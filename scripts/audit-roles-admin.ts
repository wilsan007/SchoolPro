/**
 * Audit d'intégrité des rôles d'un utilisateur.
 *
 * Vérifie que pour un utilisateur donné (typiquement le TENANT_ADMIN de démo),
 * tous les rôles possédés (UserRole) sont :
 *  - des rôles qui existent dans l'enum `Role`
 *  - associés à un tenant valide
 *  - reliés à un site (UserSite) quand le rôle le requiert
 *  - reliés à des classes (Enseignant → AffectationEnseignant) pour TEACHER / CLASS_TEACHER
 *  - reliés à des matières (AffectationEnseignant) pour TEACHER
 *  - prof principal de classes (Classe.profPrincipalId) pour CLASS_TEACHER
 *  - reliés à des élèves (Parent → EleveParent) pour PARENT
 *  - les élèves sont dans des classes
 *  - les classes ont un prof principal
 *
 * Usage :
 *   pnpm tsx scripts/audit-roles-admin.ts <userId>
 *   pnpm tsx scripts/audit-roles-admin.ts <email>
 *
 * Sans argument : audite tous les TENANT_ADMIN du tenant par défaut.
 */
import prisma from "../src/lib/prisma";
import { PrismaClient } from "@prisma/client";

const ROLES_VALIDES = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "PRINCIPAL",
  "SECRETARY",
  "TEACHER",
  "CLASS_TEACHER",
  "COUNSELOR",
  "NURSE",
  "ACCOUNTANT",
  "CAISSIER",
  "SUPERVISOR",
  "SUBJECT_LEAD",
  "SITE_MANAGER",
  "INSPECTOR",
  "PARENT",
  "STUDENT",
] as const;

type RoleValide = (typeof ROLES_VALIDES)[number];

interface Probleme {
  severity: "ERREUR" | "AVERTISSEMENT";
  role: string;
  message: string;
}

async function auditerUtilisateur(userId: string): Promise<Probleme[]> {
  const problemes: Probleme[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      tenantId: true,
      siteId: true,
      role: true,
      isActive: true,
    },
  });

  if (!user) {
    console.error(`Utilisateur introuvable : ${userId}`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`Audit des rôles — ${user.name} <${user.email}>`);
  console.log(`Rôle actif : ${user.role} | tenantId : ${user.tenantId ?? "(aucun)"}`);
  console.log(`${"=".repeat(72)}\n`);

  // 1. Rôles possédés (UserRole)
  const userRoles = await prisma.userRole.findMany({
    where: { userId, isActive: true },
    select: { id: true, tenantId: true, role: true },
  });

  if (userRoles.length === 0) {
    problemes.push({
      severity: "AVERTISSEMENT",
      role: user.role,
      message: "Aucun UserRole actif — l'utilisateur ne possède aucun rôle explicite. Le rôle actif est utilisé par défaut.",
    });
  }

  // Vérifier que chaque rôle est un rôle valide de l'enum
  for (const ur of userRoles) {
    if (!ROLES_VALIDES.includes(ur.role as RoleValide)) {
      problemes.push({
        severity: "ERREUR",
        role: ur.role,
        message: `Le rôle "${ur.role}" n'existe pas dans l'enum Role.`,
      });
    }
  }

  // 2. Tenant actif
  if (!user.tenantId) {
    problemes.push({
      severity: "ERREUR",
      role: user.role,
      message: "Aucun tenantId sur l'utilisateur — impossible de vérifier le périmètre.",
    });
    return problemes;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    problemes.push({
      severity: "ERREUR",
      role: user.role,
      message: `Le tenant ${user.tenantId} n'existe pas.`,
    });
    return problemes;
  }

  console.log(`Tenant : ${tenant.name} (${tenant.slug})`);
  console.log(`Rôles possédés : ${userRoles.map((r) => r.role).join(", ") || "(aucun)"}\n`);

  // 3. Sites
  const sites = await prisma.site.findMany({
    where: { tenantId: user.tenantId, actif: true },
    select: { id: true, nom: true, code: true },
  });
  console.log(`Sites du tenant (${sites.length}) : ${sites.map((s) => s.nom).join(", ") || "(aucun)"}\n`);

  const userSites = await prisma.userSite.findMany({
    where: { userId },
    select: { siteId: true, role: true },
  });
  console.log(`Sites de l'utilisateur (${userSites.length}) : ${userSites.map((us) => us.siteId).join(", ") || "(aucun)"}`);

  if (userSites.length === 0 && sites.length > 0) {
    problemes.push({
      severity: "AVERTISSEMENT",
      role: user.role,
      message: "Aucun UserSite — l'utilisateur n'est rattaché à aucun site explicite. (TENANT_ADMIN a accès à tous les sites par défaut.)",
    });
  }

  // Vérifier que les UserSite pointent vers des sites du tenant
  for (const us of userSites) {
    const siteExiste = sites.some((s) => s.id === us.siteId);
    if (!siteExiste) {
      problemes.push({
        severity: "ERREUR",
        role: user.role,
        message: `UserSite ${us.siteId} ne correspond à aucun site actif du tenant ${user.tenantId}.`,
      });
    }
  }

  // 4. Enseignant (TEACHER / CLASS_TEACHER / SUBJECT_LEAD)
  const enseignant = await prisma.enseignant.findFirst({
    where: { userId, tenantId: user.tenantId },
    select: { id: true, specialite: true },
  });

  const rolesEnseignant = ["TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD"];
  const possedeRoleEnseignant = userRoles.some((r) => rolesEnseignant.includes(r.role));

  if (possedeRoleEnseignant) {
    console.log(`\n--- Rôle enseignant ---`);
    if (!enseignant) {
      problemes.push({
        severity: "ERREUR",
        role: "TEACHER/CLASS_TEACHER",
        message: "L'utilisateur possède un rôle enseignant mais aucune ligne Enseignant n'existe pour ce user × tenant.",
      });
    } else {
      console.log(`Enseignant trouvé : ${enseignant.id} (spécialité : ${enseignant.specialite ?? "—"})`);

      // Affectations (classes + matières)
      const affectations = await prisma.affectationEnseignant.findMany({
        where: { enseignantId: enseignant.id, tenantId: user.tenantId },
        select: {
          id: true,
          classeId: true,
          matiereId: true,
          classe: { select: { id: true, nom: true, niveau: true, deletedAt: true } },
          matiere: { select: { id: true, nom: true, code: true } },
        },
      });

      console.log(`Affectations (${affectations.length}) :`);
      for (const a of affectations) {
        const archivee = a.classe?.deletedAt ? " [ARCHIVÉE]" : "";
        console.log(`  - ${a.classe?.nom ?? "?"} (${a.classe?.niveau ?? "?"}) → ${a.matiere?.nom ?? "?"} (${a.matiere?.code ?? "?"})${archivee}`);
      }

      if (affectations.length === 0) {
        problemes.push({
          severity: "ERREUR",
          role: "TEACHER",
          message: "L'enseignant n'a aucune affectation (classe × matière). Il ne peut ni saisir de notes ni voir de classes.",
        });
      }

      // Vérifier que les classes des affectations ne sont pas supprimées
      for (const a of affectations) {
        if (a.classe?.deletedAt) {
          problemes.push({
            severity: "AVERTISSEMENT",
            role: "TEACHER",
            message: `Affectation vers une classe archivée : ${a.classe?.nom} (${a.classeId}).`,
          });
        }
      }

      // Sites enseignant
      const ensSites = await prisma.enseignantSite.findMany({
        where: { enseignantId: enseignant.id },
        select: { siteId: true },
      });
      console.log(`Sites enseignant (${ensSites.length}) : ${ensSites.map((s) => s.siteId).join(", ") || "(aucun)"}`);

      // Classes dont il est prof principal (CLASS_TEACHER)
      const classesProfPrincipal = await prisma.classe.findMany({
        where: {
          profPrincipalId: enseignant.id,
          tenantId: user.tenantId,
          deletedAt: null,
        },
        select: { id: true, nom: true, niveau: true, annee: true },
      });
      console.log(`Classes dont prof principal (${classesProfPrincipal.length}) : ${classesProfPrincipal.map((c) => c.nom).join(", ") || "(aucun)"}`);

      const possedeClassTeacher = userRoles.some((r) => r.role === "CLASS_TEACHER");
      if (possedeClassTeacher && classesProfPrincipal.length === 0) {
        problemes.push({
          severity: "ERREUR",
          role: "CLASS_TEACHER",
          message: "L'utilisateur possède le rôle CLASS_TEACHER mais n'est prof principal d'aucune classe active.",
        });
      }

      // Élèves dans les classes dont il est prof principal
      for (const c of classesProfPrincipal) {
        const nbEleves = await prisma.eleve.count({
          where: { classeId: c.id, tenantId: user.tenantId, deletedAt: null },
        });
        console.log(`  - ${c.nom} : ${nbEleves} élève(s) actif(s)`);
        if (nbEleves === 0) {
          problemes.push({
            severity: "AVERTISSEMENT",
            role: "CLASS_TEACHER",
            message: `La classe ${c.nom} (${c.id}) dont l'utilisateur est prof principal n'a aucun élève actif.`,
          });
        }
      }
    }
  }

  // 5. Parent (PARENT)
  const possedeRoleParent = userRoles.some((r) => r.role === "PARENT");
  if (possedeRoleParent) {
    console.log(`\n--- Rôle parent ---`);
    const parent = await prisma.parent.findFirst({
      where: { userId, tenantId: user.tenantId },
      select: { id: true, nom: true, prenom: true },
    });

    if (!parent) {
      problemes.push({
        severity: "ERREUR",
        role: "PARENT",
        message: "L'utilisateur possède le rôle PARENT mais aucune ligne Parent n'existe pour ce user × tenant.",
      });
    } else {
      console.log(`Parent trouvé : ${parent.prenom} ${parent.nom} (${parent.id})`);

      const enfants = await prisma.eleveParent.findMany({
        where: { parentId: parent.id },
        select: {
          lien: true,
          isGardien: true,
          eleve: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              matricule: true,
              classeId: true,
              deletedAt: true,
              classe: { select: { id: true, nom: true, niveau: true } },
            },
          },
        },
      });

      console.log(`Enfants liés (${enfants.length}) :`);
      for (const e of enfants) {
        const archive = e.eleve.deletedAt ? " [ARCHIVÉ]" : "";
        const classe = e.eleve.classe?.nom ?? "(aucune classe)";
        console.log(`  - ${e.eleve.prenom} ${e.eleve.nom} (${e.eleve.matricule}) — ${e.lien}${e.isGardien ? " (gardien)" : ""} → ${classe}${archive}`);
      }

      if (enfants.length === 0) {
        problemes.push({
          severity: "ERREUR",
          role: "PARENT",
          message: "Le parent n'a aucun enfant lié (EleveParent).",
        });
      }

      // Vérifier que chaque enfant a une classe
      for (const e of enfants) {
        if (!e.eleve.classeId) {
          problemes.push({
            severity: "AVERTISSEMENT",
            role: "PARENT",
            message: `L'enfant ${e.eleve.prenom} ${e.eleve.nom} (${e.eleve.matricule}) n'est dans aucune classe.`,
          });
        }
        if (e.eleve.deletedAt) {
          problemes.push({
            severity: "AVERTISSEMENT",
            role: "PARENT",
            message: `L'enfant ${e.eleve.prenom} ${e.eleve.nom} (${e.eleve.matricule}) est archivé (soft delete).`,
          });
        }
      }
    }
  }

  // 6. Élève (STUDENT)
  const possedeRoleEleve = userRoles.some((r) => r.role === "STUDENT");
  if (possedeRoleEleve) {
    console.log(`\n--- Rôle élève ---`);
    const eleve = await prisma.eleve.findFirst({
      where: { userId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, nom: true, prenom: true, matricule: true, classeId: true, classe: { select: { id: true, nom: true, niveau: true } } },
    });

    if (!eleve) {
      problemes.push({
        severity: "ERREUR",
        role: "STUDENT",
        message: "L'utilisateur possède le rôle STUDENT mais aucune ligne Eleve active n'existe pour ce user × tenant.",
      });
    } else {
      console.log(`Élève trouvé : ${eleve.prenom} ${eleve.nom} (${eleve.matricule}) → ${eleve.classe?.nom ?? "(aucune classe)"}`);
      if (!eleve.classeId) {
        problemes.push({
          severity: "ERREUR",
          role: "STUDENT",
          message: `L'élève ${eleve.prenom} ${eleve.nom} n'est dans aucune classe.`,
        });
      }
    }
  }

  // 7. Classes du tenant — vérifier qu'elles ont un prof principal
  const classesActives = await prisma.classe.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    select: { id: true, nom: true, niveau: true, profPrincipalId: true, annee: true },
  });
  console.log(`\n--- Classes actives du tenant (${classesActives.length}) ---`);
  for (const c of classesActives) {
    const nbEleves = await prisma.eleve.count({
      where: { classeId: c.id, tenantId: user.tenantId, deletedAt: null },
    });
    const pp = c.profPrincipalId ? "oui" : "NON";
    console.log(`  - ${c.nom} (${c.niveau}, ${c.annee}) : ${nbEleves} élève(s), prof principal : ${pp}`);
    if (!c.profPrincipalId && nbEleves > 0) {
      problemes.push({
        severity: "AVERTISSEMENT",
        role: "TENANT_ADMIN",
        message: `La classe ${c.nom} (${c.id}) a ${nbEleves} élèves mais pas de prof principal.`,
      });
    }
  }

  return problemes;
}

async function main() {
  const arg = process.argv[2];
  let userId: string;

  if (!arg) {
    // Par défaut : tous les TENANT_ADMIN
    console.log("Aucun argument — recherche de tous les TENANT_ADMIN actifs...");
    const admins = await prisma.user.findMany({
      where: { role: "TENANT_ADMIN", isActive: true },
      select: { id: true, email: true, name: true, tenantId: true },
    });
    if (admins.length === 0) {
      console.log("Aucun TENANT_ADMIN actif trouvé.");
      process.exit(0);
    }
    console.log(`${admins.length} TENANT_ADMIN(s) trouvé(s).`);

    let totalProblemes: Probleme[] = [];
    for (const a of admins) {
      const p = await auditerUtilisateur(a.id);
      totalProblemes = totalProblemes.concat(p);
    }

    afficherRapport(totalProblemes);
  } else {
    // Chercher par ID ou email
    const user = arg.includes("@")
      ? await prisma.user.findUnique({ where: { email: arg }, select: { id: true } })
      : await prisma.user.findUnique({ where: { id: arg }, select: { id: true } });

    if (!user) {
      console.error(`Utilisateur introuvable : ${arg}`);
      process.exit(1);
    }

    const problemes = await auditerUtilisateur(user.id);
    afficherRapport(problemes);
  }

  await prisma.$disconnect();
}

function afficherRapport(problemes: Probleme[]) {
  console.log(`\n${"=".repeat(72)}`);
  console.log("RAPPORT D'AUDIT");
  console.log(`${"=".repeat(72)}\n`);

  if (problemes.length === 0) {
    console.log("✅ Aucun problème détecté. Toutes les relations sont cohérentes.\n");
    return;
  }

  const erreurs = problemes.filter((p) => p.severity === "ERREUR");
  const avertissements = problemes.filter((p) => p.severity === "AVERTISSEMENT");

  console.log(`❌ ${erreurs.length} erreur(s) | ⚠️  ${avertissements.length} avertissement(s)\n`);

  if (erreurs.length > 0) {
    console.log("--- ERREURS ---");
    for (const p of erreurs) {
      console.log(`  ❌ [${p.role}] ${p.message}`);
    }
  }

  if (avertissements.length > 0) {
    console.log(`\n--- AVERTISSEMENTS ---`);
    for (const p of avertissements) {
      console.log(`  ⚠️  [${p.role}] ${p.message}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
