import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { revalidateTag } from "next/cache";

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
  statut: z.enum(["SOUMISE", "EN_EXAMEN", "ADMIS", "REFUSE", "INSCRIT", "ANNULE"]).optional(),
  dateExamen: z.string().optional().nullable(),
  noteExamen: z.number().min(0).max(20).optional().nullable(),
  commentaire: z.string().optional(),
  motifRefus: z.string().optional(),
});

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


  const siteFilter = siteFilterForModel("candidature", session.user);
  const candidature = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
  });

  if (!candidature) {
    return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
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
    },
  });

  // --- Workflow INSCRIT : créer Eleve + Parent + compte User + notification ---
  // Déclenché uniquement quand le statut passe à INSCRIT. Toute la chaîne est
  // enveloppée dans un try/catch : un échec de notification ou de création de
  // compte ne doit pas faire échouer la mise à jour de la candidature elle-même.
  if (data.statut === "INSCRIT") {
    const tenantId = session.user.tenantId;
    try {
      const anneeInscription = await getAnneeCouranteLibelle(tenantId);
      if (!anneeInscription) {
        throw new Error("Aucune année scolaire active pour ce tenant");
      }

      // Générer un matricule unique : ECL-<année>-<compteur>.
      const count = await prisma.eleve.count({
        where: { tenantId, ...siteFilterForModel("eleve", session.user) },
      });
      const matricule = `ECL-${anneeInscription}-${String(count + 1).padStart(4, "0")}`;

      // Mapper classeVoulue (ex: "6ème") à une Classe réelle du tenant pour
      // l'année courante, en cherchant par niveau.
      const classe = await prisma.classe.findFirst({
        where: {
          tenantId,
          niveau: candidature.classeVoulue,
          annee: anneeInscription,
          deletedAt: null,
          ...siteFilterForModel("classe", session.user),
        },
        select: { id: true, siteId: true },
      });

      const resolvedSiteId = classe?.siteId ?? candidature.siteId ?? session.user.siteId ?? null;

      // 1. Créer l'élève (même patron que createEleve dans lib/actions/eleve.ts).
      const eleve = await prisma.eleve.create({
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
          classeId: classe?.id ?? null,
          statut: "ACTIF",
          anneeInscription,
          dateInscription: new Date(),
        },
      });

      // Historique de classe initial (non-bloquant).
      if (classe) {
        await prisma.historiqueClasse.create({
          data: {
            tenantId,
            eleveId: eleve.id,
            classeId: classe.id,
            dateEntree: new Date(),
            motif: "Inscription",
          },
        }).catch(() => {});
      }

      // 2. Créer le Parent + le lien EleveParent.
      let parentId: string | null = null;
      if (candidature.parentNom && candidature.parentPrenom && candidature.parentPhone) {
        const parent = await prisma.parent.create({
          data: {
            tenantId,
            nom: candidature.parentNom,
            prenom: candidature.parentPrenom,
            phone: candidature.parentPhone,
            email: candidature.parentEmail || null,
          },
        });
        parentId = parent.id;

        await prisma.eleveParent.create({
          data: {
            eleveId: eleve.id,
            parentId: parent.id,
            lien: candidature.parentLien,
            isGardien: true,
          },
        });
      }

      // 3. Créer le compte User pour l'élève (username = matricule, password = DOB).
      // Même patron que generer-comptes/route.ts.
      const password = formatDOB(candidature.dateNaissance);
      if (password) {
        // Unicité insensible à la casse : voir src/lib/email.ts.
        // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- vérification d'unicité globale par email avant création de compte élève
        const existingUser = await prisma.user.findFirst({
          where: { email: { equals: matricule, mode: "insensitive" } },
          select: { id: true },
        });
        if (!existingUser) {
          const hashedPassword = await bcrypt.hash(password, 10);
          const user = await prisma.user.create({
            data: {
              email: matricule,
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

          await prisma.eleve.update({
            where: { id: eleve.id },
            data: { userId: user.id },
          });
        }
      }

      // 4. Notification IN_APP au parent (non-bloquante).
      if (parentId) {
        try {
          await prisma.notification.create({
            data: {
              tenantId,
              siteId: resolvedSiteId,
              titre: `Inscription confirmée - ${candidature.prenom} ${candidature.nom}`,
              contenu:
                `Bonjour,\n\nNous avons le plaisir de vous confirmer l'inscription de ` +
                `${candidature.prenom} ${candidature.nom} (matricule ${matricule})` +
                `${classe ? ` en ${candidature.classeVoulue}` : ""}.\n\n` +
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
    } catch (workflowError) {
      // La chaîne d'inscription a échoué : on loggue sans faire échouer la
      // réponse — la candidature est bien passée à INSCRIT.
      console.error("[API/admissions] Workflow INSCRIT échoué:", workflowError);
    }
  }

  return NextResponse.json({ candidature: updated });
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
