import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { notifyDirection } from "@/lib/notifications/notify-direction";
import { revalidateTag } from "next/cache";
import { moisScolariteDefaut, isMoisScolariteValide, formatMoisScolarite } from "@/lib/admissions/mois-scolarite";
import {
  PIECES_OBLIGATOIRES,
  fusionnerDocuments,
  piecesRequisesPresentes,
  piecesManquantes,
  type DocumentInscription,
} from "@/lib/admissions/pieces-justificatives";

/**
 * Formate une date de naissance au format JJMMAAAA (ex: 05042012).
 * Utilisé comme mot de passe initial pour les comptes élèves.
 */
function formatDOB(date: Date): string | null {
  if (!date || isNaN(date.getTime())) return null;
  const jj = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(date.getUTCFullYear());
  return `${jj}${mm}${aaaa}`;
}

const UpdateSchema = z.object({
  statut: z.enum(["SOUMISE", "DOSSIER_COMPLET", "EN_EXAMEN", "ADMIS", "REFUSE", "INSCRIT", "ANNULE"]).optional(),
  dateExamen: z.string().optional().nullable(),
  noteExamen: z.number().min(0).max(20).optional().nullable(),
  commentaire: z.string().optional(),
  motifRefus: z.string().optional(),
  // Mois de scolarité pour la facture d'admission (format "YYYY-MM")
  moisScolarite: z.string().refine(isMoisScolariteValide, "Format mois invalide (YYYY-MM)").optional(),
  // ── Dossier d'inscription ──
  dossierStatut: z.enum(["INCOMPLET", "EN_COURS", "COMPLETE", "VALIDE", "CLOS"]).optional(),
  documentsInscription: z.array(z.object({
    type: z.string(),
    url: z.string(),
    nom: z.string().optional(),
    taille: z.number().optional(),
    ajouteLe: z.string().optional(),
    ajouteParId: z.string().optional(),
  })).optional(),
});

// Rôles autorisés à valider le dossier (VALIDE).
const ROLES_VALIDATION = ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"];

// Rôles autorisés à finaliser l'inscription (INSCRIT).
const ROLES_INSCRIPTION = ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const data = UpdateSchema.parse(body);

  const tenantId = session.user.tenantId;

  // ── Restriction : seule la direction peut valider le dossier (VALIDE) ──
  if (data.dossierStatut === "VALIDE" && !ROLES_VALIDATION.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Seul le chef d'établissement peut valider le dossier." },
      { status: 403 }
    );
  }

  // ── Restriction : finaliser l'inscription (INSCRIT) — direction + comptable ──
  if (data.statut === "INSCRIT" && !ROLES_INSCRIPTION.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Vous n'avez pas les permissions pour finaliser l'inscription." },
      { status: 403 }
    );
  }

  const siteFilter = siteFilterForModel("candidature", session.user);
  const candidature = await prisma.candidature.findFirst({
    where: { id, tenantId, ...siteFilter },
  });

  if (!candidature) {
    return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
  }

  // ── Gate pièces justificatives au passage à EN_EXAMEN ──
  if (data.statut === "EN_EXAMEN" && candidature.statut !== "EN_EXAMEN") {
    const docsExistants = (candidature.documentsInscription ?? []) as unknown as DocumentInscription[];
    const docsFusionnes = fusionnerDocuments(docsExistants, data.documentsInscription);
    if (!piecesRequisesPresentes(docsFusionnes)) {
      const manquantes = piecesManquantes(docsFusionnes);
      return NextResponse.json(
        {
          error: `Pièces justificatives manquantes : ${manquantes.map((p) => p.nom).join(", ")}`,
          piecesManquantes: manquantes.map((p) => p.id),
        },
        { status: 400 }
      );
    }
  }

  // ── Génération automatique de la facture au passage à ADMIS ──
  let factureCreeId: string | null = null;
  if (data.statut === "ADMIS" && candidature.statut !== "ADMIS") {
    // a) Idempotence : vérifier qu'aucune facture n'existe déjà pour cette candidature
    // eslint-disable-next-line ecolpro/require-site-filter -- recherche par candidatureId, pas de filtre site nécessaire
    const factureExistante = await prisma.facture.findFirst({
      where: { candidatureId: candidature.id, tenantId },
      select: { id: true },
    });
    if (factureExistante) {
      factureCreeId = factureExistante.id;
    } else {
      // b) Résolution du niveau tarifaire
      // TarifNiveau est indexé par NIVEAU pédagogique (ex: "Terminale"),
      // alors que classeVoulue contient le NOM de la classe (ex: "Terminale A").
      // On résout d'abord la classe pour récupérer son niveau.
      let niveauTarif = candidature.classeVoulue; // fallback : utiliser classeVoulue tel quel
      // eslint-disable-next-line ecolpro/require-site-filter -- recherche par nom dans le site de la candidature
      const classeForNiveau = await prisma.classe.findFirst({
        where: {
          tenantId,
          nom: candidature.classeVoulue,
          ...(candidature.siteId ? { siteId: candidature.siteId } : {}),
        },
        select: { niveau: true },
      });
      if (classeForNiveau) {
        niveauTarif = classeForNiveau.niveau;
      }

      // c) Recherche du tarif (site-spécifique prioritaire, fallback partagé)
      const tarif = await prisma.tarifNiveau.findFirst({
        where: {
          tenantId,
          niveau: niveauTarif,
          annee: candidature.annee,
          actif: true,
          OR: [{ siteId: candidature.siteId ?? null }, { siteId: null }],
        },
        orderBy: { siteId: "desc" }, // privilégier le tarif spécifique au site
      });

      // d) Garde-fou tarif : blocage hard si tarif manquant ou montant ≤ 0
      const fraisInscription = tarif?.fraisInscription ?? 0;
      const mensualite = tarif?.mensualite ?? 0;
      const montantTotal = fraisInscription + mensualite;

      if (!tarif || montantTotal <= 0) {
        return NextResponse.json(
          {
            error: "Aucun tarif configuré pour ce niveau. Veuillez configurer les tarifs dans Paramètres → Tarifs avant d'admettre le candidat.",
            niveau: niveauTarif,
            annee: candidature.annee,
          },
          { status: 400 }
        );
      }

      // e) Choix du mois de scolarité
      const moisScolarite = data.moisScolarite ?? moisScolariteDefaut();
      const moisLabel = formatMoisScolarite(moisScolarite);

      // f) Numéro de facture
      // eslint-disable-next-line ecolpro/require-site-filter -- compteur global tenant pour numérotation
      const factureCount = await prisma.facture.count({ where: { tenantId } });
      const numeroFacture = `FAC-${new Date().getFullYear()}-${String(factureCount + 1).padStart(5, "0")}`;

      // g) Création de la facture (eleveId = NULL, l'élève n'existe pas encore)
      const nouvelleFacture = await prisma.facture.create({
        data: {
          tenantId,
          siteId: candidature.siteId,
          candidatureId: candidature.id,
          // eleveId: NON renseigné — l'élève n'existe pas encore
          numero: numeroFacture,
          libelle: `Frais d'inscription + Scolarité ${moisLabel} — ${candidature.prenom} ${candidature.nom} (${candidature.classeVoulue}, ${candidature.annee})`,
          montant: montantTotal, // = fraisInscription + mensualite (premier mois)
          devise: tarif?.devise ?? "DJF",
          statut: "EN_ATTENTE",
          mois: moisScolarite,
          createdById: session.user.id,
        },
      });
      factureCreeId = nouvelleFacture.id;
    }
  }

  // ── Gate de paiement au passage à INSCRIT ──
  if (data.statut === "INSCRIT" && candidature.statut !== "INSCRIT") {
    // Récupérer la facture liée à la candidature avec ses paiements
    // eslint-disable-next-line ecolpro/require-site-filter -- recherche par candidatureId
    const factureInscription = await prisma.facture.findFirst({
      where: { candidatureId: candidature.id, tenantId },
      include: { paiements: true },
    });

    if (!factureInscription) {
      return NextResponse.json(
        { error: "Le candidat doit d'abord être admis (aucune facture trouvée)." },
        { status: 400 }
      );
    }

    const totalPaye = factureInscription.paiements.reduce((sum, p) => sum + p.montant, 0);
    const estPayee = totalPaye >= factureInscription.montant && factureInscription.montant > 0;

    if (!estPayee) {
      return NextResponse.json(
        {
          error: "Le paiement de la facture d'inscription doit être complet avant de finaliser l'inscription.",
          factureId: factureInscription.id,
          montant: factureInscription.montant,
          totalPaye,
          restant: factureInscription.montant - totalPaye,
        },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.candidature.update({
    where: { id },
    data: {
      ...(data.statut && { statut: data.statut }),
      ...(data.dateExamen !== undefined && {
        dateExamen: data.dateExamen ? new Date(data.dateExamen) : null,
      }),
      ...(data.noteExamen !== undefined && { noteExamen: data.noteExamen }),
      ...(data.commentaire !== undefined && { commentaire: data.commentaire }),
      ...(data.motifRefus !== undefined && { motifRefus: data.motifRefus }),
      ...(data.dossierStatut && {
        dossierStatut: data.dossierStatut,
        ...(data.dossierStatut === "VALIDE" && {
          valideParId: session.user.id,
          valideLe: new Date(),
        }),
      }),
      ...(data.documentsInscription !== undefined && {
        documentsInscription: data.documentsInscription,
      }),
    },
  });

  // ── Audit trail : tracer les changements de statut du dossier ──
  if (data.dossierStatut && data.dossierStatut !== candidature.dossierStatut) {
    try {
      await prisma.inscriptionHistorique.create({
        data: {
          tenantId,
          candidatureId: id,
          type: "CHANGEMENT_STATUT",
          description: `Dossier : ${candidature.dossierStatut} → ${data.dossierStatut}`,
          auteurId: session.user.id,
          auteurNom: session.user.name,
          donnees: { ancienStatut: candidature.dossierStatut, nouveauStatut: data.dossierStatut },
        },
      });
    } catch (histError) {
      console.error("[API/admissions] Historique dossier échoué:", histError);
    }
  }

  // ── Audit trail : tracer les changements de statut de candidature ──
  if (data.statut && data.statut !== candidature.statut) {
    try {
      await prisma.inscriptionHistorique.create({
        data: {
          tenantId,
          candidatureId: id,
          type: "CHANGEMENT_STATUT",
          description: `Candidature : ${candidature.statut} → ${data.statut}`,
          auteurId: session.user.id,
          auteurNom: session.user.name,
          donnees: { ancienStatut: candidature.statut, nouveauStatut: data.statut },
        },
      });
    } catch (histError) {
      console.error("[API/admissions] Historique candidature échoué:", histError);
    }

    // ── Notifications à la direction (best-effort) ──
    const nomComplet = `${candidature.prenom} ${candidature.nom}`;
    if (data.statut === "ADMIS") {
      await notifyDirection({
        tenantId,
        siteId: candidature.siteId ?? null,
        titre: `Candidat admis — ${nomComplet}`,
        contenu: `Le candidat ${nomComplet} a été admis en ${candidature.classeVoulue}.\nDossier: ${candidature.dossierStatut ?? "INCOMPLET"}${factureCreeId ? `\nFacture générée.` : ""}`,
        envoyeParId: session.user.id,
      });
    } else if (data.statut === "REFUSE") {
      await notifyDirection({
        tenantId,
        siteId: candidature.siteId ?? null,
        titre: `Candidature refusée — ${nomComplet}`,
        contenu: `La candidature de ${nomComplet} a été refusée${data.motifRefus ? ` pour le motif suivant : ${data.motifRefus}` : ""}.`,
        envoyeParId: session.user.id,
      });
    }
  }

  // --- Workflow INSCRIT : créer Eleve + Parent + compte User + rattacher facture ---
  // Déclenché uniquement quand le statut passe à INSCRIT (après gate de paiement).
  let eleveCreeId: string | null = null;
  if (data.statut === "INSCRIT") {
    try {
      const anneeInscription = await getAnneeCouranteLibelle(tenantId);
      if (!anneeInscription) {
        throw new Error("Aucune année scolaire active pour ce tenant");
      }

      // ── Transaction : élève + parent + lien facture ──
      const result = await prisma.$transaction(async (tx) => {
        // a) Générer un matricule unique : ECL-<année>-<compteur>.
        // eslint-disable-next-line ecolpro/require-site-filter -- compteur global tenant pour matricule
        const count = await tx.eleve.count({ where: { tenantId } });
        let matricule = `ECL-${anneeInscription}-${String(count + 1).padStart(4, "0")}`;

        // Vérification d'unicité → incrémenter si collision
        let matriculeExiste = await tx.eleve.findUnique({
          where: { tenantId_matricule: { tenantId, matricule } },
          select: { id: true },
        });
        let suffix = count + 1;
        while (matriculeExiste) {
          suffix++;
          matricule = `ECL-${anneeInscription}-${String(suffix).padStart(4, "0")}`;
          matriculeExiste = await tx.eleve.findUnique({
            where: { tenantId_matricule: { tenantId, matricule } },
            select: { id: true },
          });
        }

        // b) Résolution de la classe par NOM + siteId (stricte)
        // classeVoulue contient le NOM de la classe (ex: "Terminale A")
        // On cherche d'abord par nom + siteId + annee, puis fallback sans année.
        // Refus propre si introuvable (pas d'élève orphelin).
        let classe = await tx.classe.findFirst({
          where: {
            tenantId,
            nom: candidature.classeVoulue,
            ...(candidature.siteId ? { siteId: candidature.siteId } : {}),
            annee: anneeInscription,
            deletedAt: null,
          },
          select: { id: true, siteId: true },
        });

        if (!classe) {
          // Fallback : nom + siteId sans année
          classe = await tx.classe.findFirst({
            where: {
              tenantId,
              nom: candidature.classeVoulue,
              ...(candidature.siteId ? { siteId: candidature.siteId } : {}),
              deletedAt: null,
            },
            select: { id: true, siteId: true },
          });
        }

        if (!classe) {
          throw new Error("La classe n'existe pas dans ce site. Créez la structure de classes avant de finaliser l'inscription.");
        }

        const resolvedSiteId = classe.siteId ?? candidature.siteId ?? session.user.siteId ?? null;

        // c) Parent : recherche par phone, sinon création
        let parentId: string | null = null;
        if (candidature.parentPhone) {
          const parentExistant = await tx.parent.findFirst({
            where: { tenantId, phone: candidature.parentPhone },
            select: { id: true },
          });

          if (parentExistant) {
            parentId = parentExistant.id;
          } else if (candidature.parentNom && candidature.parentPrenom) {
            const parent = await tx.parent.create({
              data: {
                tenantId,
                nom: candidature.parentNom,
                prenom: candidature.parentPrenom,
                phone: candidature.parentPhone,
                email: candidature.parentEmail || null,
              },
            });
            parentId = parent.id;
          }
        }

        // d) Élève
        const eleve = await tx.eleve.create({
          data: {
            tenantId,
            siteId: resolvedSiteId,
            matricule,
            nom: candidature.nom,
            prenom: candidature.prenom,
            dateNaissance: candidature.dateNaissance,
            lieuNaissance: candidature.lieuNaissance ?? null,
            nationalite: candidature.nationalite ?? "SN",
            sexe: candidature.sexe,
            classeId: classe.id,
            statut: "ACTIF",
            anneeInscription,
            dateInscription: new Date(),
          },
        });

        // Historique de classe initial
        await tx.historiqueClasse.create({
          data: {
            tenantId,
            eleveId: eleve.id,
            classeId: classe.id,
            dateEntree: new Date(),
            motif: "Inscription",
          },
        }).catch(() => {});

        // e) Lien EleveParent
        if (parentId) {
          await tx.eleveParent.create({
            data: {
              eleveId: eleve.id,
              parentId,
              lien: candidature.parentLien,
              isGardien: true,
            },
          });
        }

        // f) Rattachement rétroactif de la facture à l'élève
        // eslint-disable-next-line ecolpro/require-site-filter -- recherche par candidatureId
        const factureInscription = await tx.facture.findFirst({
          where: { candidatureId: candidature.id, tenantId },
          select: { id: true },
        });
        if (factureInscription) {
          await tx.facture.update({
            where: { id: factureInscription.id },
            data: { eleveId: eleve.id },
          });
        }

        return { eleve, parentId, matricule };
      });

      eleveCreeId = result.eleve.id;

      // g) Créer le compte User pour l'élève (username = matricule, password = DOB)
      const password = formatDOB(candidature.dateNaissance);
      if (password) {
        // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- vérification d'unicité globale par email
        const existingUser = await prisma.user.findFirst({
          where: { email: { equals: result.matricule, mode: "insensitive" } },
          select: { id: true },
        });
        if (!existingUser) {
          const hashedPassword = await bcrypt.hash(password, 10);
          const user = await prisma.user.create({
            data: {
              email: result.matricule,
              name: `${candidature.prenom} ${candidature.nom}`,
              password: hashedPassword,
              role: "STUDENT",
              tenantId,
              locale: "fr",
              mustChangePassword: true,
              userTenants: {
                create: {
                  tenantId,
                  role: "STUDENT",
                  isActive: true,
                  isDefault: true,
                },
              },
              userRoles: {
                create: {
                  tenantId,
                  role: "STUDENT",
                  isActive: true,
                },
              },
            },
          });

          // eslint-disable-next-line ecolpro/require-tenant-id -- l'élève vient d'être créé dans la transaction ci-dessus
          await prisma.eleve.update({
            where: { id: result.eleve.id },
            data: { userId: user.id },
          });
        }
      }

      // h) Notification IN_APP au parent (non-bloquante)
      if (result.parentId) {
        try {
          await prisma.notification.create({
            data: {
              tenantId,
              siteId: result.eleve.siteId,
              titre: `Inscription confirmée - ${candidature.prenom} ${candidature.nom}`,
              contenu:
                `Bonjour,\n\nNous avons le plaisir de vous confirmer l'inscription de ` +
                `${candidature.prenom} ${candidature.nom} (matricule ${result.matricule})` +
                ` en ${candidature.classeVoulue}.\n\n` +
                `Cordialement,\nL'établissement`,
              canal: "IN_APP",
              cible: "PARENTS",
              envoyeParId: session.user.id,
              nbDestinataires: 1,
              nbDelivres: 1,
              statut: "ENVOYEE",
              envoyeeAt: new Date(),
            },
          });
        } catch (notifError) {
          console.error("[API/admissions] Notification parent échouée:", notifError);
        }
      }

      revalidateTag("eleves-stats");
      revalidateTag("dashboard-data");

      // i) Notification à la direction
      await notifyDirection({
        tenantId,
        siteId: result.eleve.siteId,
        titre: `Nouvel élève inscrit — ${candidature.prenom} ${candidature.nom}`,
        contenu:
          `Inscription finalisée par ${session.user.name ?? "le secrétariat"}.\n` +
          `Élève : ${candidature.prenom} ${candidature.nom}\n` +
          `Matricule : ${result.matricule}\n` +
          `Classe : ${candidature.classeVoulue}\n` +
          `Année : ${anneeInscription}`,
        envoyeParId: session.user.id,
      });
    } catch (workflowError) {
      console.error("[API/admissions] Workflow INSCRIT échoué:", workflowError);
      // Si l'erreur est un refus de classe, on renvoie l'erreur
      if (workflowError instanceof Error && workflowError.message.includes("La classe n'existe pas")) {
        return NextResponse.json(
          { error: workflowError.message },
          { status: 400 }
        );
      }
    }
  }

  return NextResponse.json({
    candidature: updated,
    eleveCreeId,
    factureCreeId,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:delete");
  if (denied) return denied;

  const { id } = await params;

  const siteFilter2 = siteFilterForModel("candidature", session.user);

  const candidature = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter2 },
  });

  if (!candidature) {
    return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
  }

  await prisma.candidature.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
