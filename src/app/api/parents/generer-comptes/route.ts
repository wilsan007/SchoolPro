import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { siteFilterForModel } from "@/lib/site-scope";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import { revalidateTag } from "next/cache";
import { checkPermission } from "@/lib/rbac";

/**
 * POST /api/parents/generer-comptes
 *
 * Génère les comptes de connexion pour les parents des élèves d'une classe.
 *
 * Règles :
 *   - Sélectionne les Parent liés (via EleveParent) aux élèves de la classe
 *     qui n'ont pas encore de compte (userId = null) et qui ont un téléphone.
 *   - Username = téléphone normalisé (ex: 221771234567)
 *   - Mot de passe initial = date de naissance de l'enfant aîné lié
 *     (la plus petite dateNaissance parmi ses enfants), format JJMMAAAA
 *   - mustChangePassword = true → le parent doit changer au 1er login
 *   - Déduplication : un parent avec plusieurs enfants dans la classe
 *     = 1 seul compte, tous ses EleveParent restent rattachés.
 *   - Les parents sans téléphone (ou téléphone invalide) sont ignorés
 *     et retournés dans un rapport pour saisie manuelle.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  // Génération de comptes parents : action d'écriture sur les élèves.
  // Sans cette garde, n'importe quel utilisateur authentifié pouvait
  // créer des comptes pour les parents d'une classe entière.
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const body = await req.json();
  const { classeId, customPassword } = body as {
    classeId: string;
    customPassword?: string;
  };

  if (!classeId) {
    return NextResponse.json({ error: "classeId requis" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const siteFilter = siteFilterForModel("eleve", session.user);

  // 1. Récupérer les élèves de la classe pour connaître leurs dates de naissance
  const eleves = await prisma.eleve.findMany({
    where: {
      classeId,
      tenantId,
      ...siteFilter,
      statut: "ACTIF",
    },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
    },
  });

  if (eleves.length === 0) {
    return NextResponse.json({ error: "Aucun élève dans cette classe", created: 0, accounts: [] });
  }

  const eleveIds = eleves.map((e) => e.id);
  const eleveParId = new Map(eleves.map((e) => [e.id, e]));

  // 2. Récupérer les EleveParent pour ces élèves, avec le Parent
  // eslint-disable-next-line ecolpro/require-site-filter -- filtrage par eleveIds déjà isolés par siteFilter ci-dessus
  const eleveParents = await prisma.eleveParent.findMany({
    where: {
      eleveId: { in: eleveIds },
      eleve: { tenantId },
    },
    include: {
      parent: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          phone: true,
          phone2: true,
          email: true,
          userId: true,
        },
      },
    },
  });

  // 3. Filtrer : parents sans compte (userId = null) et avec téléphone valide
  const parentsACompter = new Map<string, {
    parentId: string;
    nom: string;
    prenom: string;
    phone: string;
    phoneNormalized: string;
    enfants: { matricule: string; nom: string; dateNaissance: Date }[];
  }>();

  const parentsSansTel: { nom: string; prenom: string; raison: string }[] = [];

  for (const ep of eleveParents) {
    const p = ep.parent;
    if (p.userId) continue; // a déjà un compte

    const tel = p.phone || p.phone2 || "";
    if (!tel || !isValidPhone(tel)) {
      // Éviter les doublons dans le rapport
      const key = `${p.nom}-${p.prenom}`;
      if (!parentsSansTel.some((s) => `${s.nom}-${s.prenom}` === key)) {
        parentsSansTel.push({
          nom: p.nom,
          prenom: p.prenom,
          raison: "Téléphone manquant ou invalide",
        });
      }
      continue;
    }

    const telNorm = normalizePhone(tel);

    // Déduplication par téléphone normalisé
    const existing = parentsACompter.get(telNorm);
    const eleve = eleveParId.get(ep.eleveId);
    if (!eleve) continue;

    const enfantInfo = {
      matricule: eleve.matricule,
      nom: `${eleve.prenom} ${eleve.nom}`,
      dateNaissance: eleve.dateNaissance,
    };

    if (existing) {
      // Ajouter cet enfant à la liste
      existing.enfants.push(enfantInfo);
    } else {
      parentsACompter.set(telNorm, {
        parentId: p.id,
        nom: p.nom,
        prenom: p.prenom,
        phone: telNorm,
        phoneNormalized: telNorm,
        enfants: [enfantInfo],
      });
    }
  }

  if (parentsACompter.size === 0) {
    return NextResponse.json({
      created: 0,
      accounts: [],
      skipped: parentsSansTel.length > 0 ? parentsSansTel : undefined,
    });
  }

  // 4. Créer les comptes
  const accounts: {
    nom: string;
    username: string;
    password: string;
    enfants: string;
  }[] = [];
  const created: string[] = [];
  const skippedUsername: { nom: string; prenom: string; raison: string }[] = [];

  for (const [, info] of parentsACompter) {
    const username = info.phoneNormalized;

    // Vérifier l'unicité globale du username (email)
    // Unicité vérifiée sans tenir compte de la casse : la connexion recherche
    // désormais en `mode: "insensitive"`, deux comptes ne différant que par la
    // casse rendraient donc l'authentification ambiguë.
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- vérification d'unicité globale par email
    const existing = await prisma.user.findFirst({
      where: { email: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      skippedUsername.push({
        nom: `${info.prenom} ${info.nom}`,
        prenom: info.prenom,
        raison: "Téléphone déjà utilisé comme identifiant",
      });
      continue;
    }

    // Mot de passe : customPassword si fourni, sinon DOB de l'enfant aîné
    // (la plus petite dateNaissance = l'aîné)
    const dobAine = info.enfants.reduce((min, e) =>
      e.dateNaissance < min ? e.dateNaissance : min, info.enfants[0].dateNaissance
    );
    const password = customPassword || formatDOB(dobAine);

    if (!password) {
      skippedUsername.push({
        nom: `${info.prenom} ${info.nom}`,
        prenom: info.prenom,
        raison: "Date de naissance de l'enfant manquante",
      });
      continue;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: username,
        name: `${info.prenom} ${info.nom}`,
        password: hashedPassword,
        role: "PARENT",
        tenantId,
        locale: "fr",
        mustChangePassword: true,
        userTenants: {
          create: {
            tenantId,
            role: "PARENT",
            isActive: true,
            isDefault: true,
          },
        },
        userRoles: {
          create: {
            tenantId,
            role: "PARENT",
            isActive: true,
          },
        },
      },
    });

    // Lier le compte User au Parent
    // eslint-disable-next-line ecolpro/require-tenant-id -- parentId provient du lot déjà filtré par tenantId
    await prisma.parent.update({
      where: { id: info.parentId },
      data: { userId: user.id },
    });

    // --- Notification IN_APP au nouveau parent ---
    try {
      await prisma.notification.create({
        data: {
          tenantId,
          titre: "Compte parent créé",
          contenu: `Votre compte parent a été créé avec succès.\n\nIdentifiant : ${username}\n\nPour des raisons de sécurité, vous devrez changer votre mot de passe lors de votre première connexion.`,
          canal: "IN_APP",
          statut: "ENVOYEE",
          cible: "PARENTS",
          envoyeParId: session.user.id,
          nbDestinataires: 1,
          nbDelivres: 1,
          envoyeeAt: new Date(),
        },
      });
    } catch (notifError) {
      console.error("[generer-comptes/parents] Notification error:", notifError);
    }

    accounts.push({
      nom: `${info.prenom} ${info.nom}`,
      username,
      password: customPassword ? "—" : password,
      enfants: info.enfants.map((e) => `${e.nom} (${e.matricule})`).join(", "),
    });
    created.push(user.id);
  }

  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");

  const allSkipped = [...parentsSansTel, ...skippedUsername];

  return NextResponse.json({
    created: created.length,
    accounts,
    skipped: allSkipped.length > 0 ? allSkipped : undefined,
  });
}

/**
 * Formate une date au format JJMMAAAA (ex: 05042012).
 */
function formatDOB(date: Date): string | null {
  if (!date || isNaN(date.getTime())) return null;
  const jj = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(date.getUTCFullYear());
  return `${jj}${mm}${aaaa}`;
}
