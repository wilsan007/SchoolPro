/**
 * Provisionne tous les rôles et données de démonstration pour l'admin
 * du tenant "demo-learnos" (admin@qa-learnos.test).
 *
 * Crée :
 *  - UserRole pour chaque rôle (TEACHER, CLASS_TEACHER, PARENT, STUDENT, etc.)
 *  - UserSite (rattachement au site du tenant)
 *  - Enseignant (pour TEACHER / CLASS_TEACHER)
 *  - AffectationEnseignant (enseignant → classe → matière)
 *  - Prof principal d'une classe (pour CLASS_TEACHER)
 *  - Parent (pour PARENT)
 *  - EleveParent (lien parent → élève)
 *  - Eleve lié au compte admin (pour STUDENT)
 *
 * Idempotent : ne recrée pas ce qui existe déjà.
 *
 * Usage : pnpm tsx scripts/provision-demo-roles.ts
 */
import prisma from "../src/lib/prisma";

const ADMIN_EMAIL = "admin@qa-learnos.test";

const TOUS_LES_ROLES = [
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

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, name: true, role: true, tenantId: true, siteId: true, firstName: true, lastName: true },
  });

  if (!admin) {
    console.error(`Admin introuvable : ${ADMIN_EMAIL}`);
    process.exit(1);
  }
  if (!admin.tenantId) {
    console.error("L'admin n'a pas de tenantId.");
    process.exit(1);
  }

  const tenantId = admin.tenantId;
  console.log(`Admin : ${admin.name} (${admin.email}) — tenant ${tenantId}`);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, slug: true },
  });
  console.log(`Tenant : ${tenant?.name} (${tenant?.slug})`);

  // ── 1. UserRole : tous les rôles possédés ──────────────────────────
  console.log("\n--- UserRole ---");
  for (const role of TOUS_LES_ROLES) {
    const existing = await prisma.userRole.findUnique({
      where: { userId_tenantId_role: { userId: admin.id, tenantId, role } },
    });
    if (existing) {
      console.log(`  ✓ ${role} (déjà présent)`);
    } else {
      await prisma.userRole.create({
        data: { userId: admin.id, tenantId, role, isActive: true },
      });
      console.log(`  + ${role} (créé)`);
    }
  }

  // ── 2. UserSite : rattachement au site du tenant ───────────────────
  console.log("\n--- UserSite ---");
  const sites = await prisma.site.findMany({
    where: { tenantId, actif: true },
    select: { id: true, nom: true },
  });
  if (sites.length === 0) {
    console.log("  ⚠️  Aucun site actif dans le tenant.");
  } else {
    for (const site of sites) {
      const existing = await prisma.userSite.findUnique({
        where: { userId_siteId: { userId: admin.id, siteId: site.id } },
      });
      if (existing) {
        console.log(`  ✓ ${site.nom} (déjà rattaché)`);
      } else {
        await prisma.userSite.create({
          data: { userId: admin.id, siteId: site.id },
        });
        console.log(`  + ${site.nom} (rattaché)`);
      }
    }
  }

  // ── 3. Enseignant (pour TEACHER / CLASS_TEACHER) ───────────────────
  console.log("\n--- Enseignant ---");
  let enseignant = await prisma.enseignant.findFirst({
    where: { userId: admin.id, tenantId },
    select: { id: true },
  });
  if (enseignant) {
    console.log(`  ✓ Enseignant existant : ${enseignant.id}`);
  } else {
    enseignant = await prisma.enseignant.create({
      data: {
        userId: admin.id,
        tenantId,
        specialite: "Mathématiques",
        typeContrat: "CDI",
        dateEntree: new Date(),
      },
    });
    console.log(`  + Enseignant créé : ${enseignant.id}`);
  }

  // ── 4. AffectationEnseignant (classe × matière) ────────────────────
  console.log("\n--- AffectationEnseignant ---");
  const classes = await prisma.classe.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, nom: true, niveau: true },
  });
  const matieres = await prisma.matiere.findMany({
    where: { tenantId },
    select: { id: true, nom: true, code: true },
  });

  if (classes.length === 0) {
    console.log("  ⚠️  Aucune classe active dans le tenant.");
  } else if (matieres.length === 0) {
    console.log("  ⚠️  Aucune matière dans le tenant.");
  } else {
    // Affecter l'enseignant à toutes les classes × la première matière
    const matiere = matieres[0];
    for (const classe of classes) {
      const existing = await prisma.affectationEnseignant.findUnique({
        where: {
          enseignantId_classeId_matiereId: {
            enseignantId: enseignant.id,
            classeId: classe.id,
            matiereId: matiere.id,
          },
        },
      });
      if (existing) {
        console.log(`  ✓ ${classe.nom} → ${matiere.nom} (déjà affecté)`);
      } else {
        await prisma.affectationEnseignant.create({
          data: {
            tenantId,
            enseignantId: enseignant.id,
            classeId: classe.id,
            matiereId: matiere.id,
          },
        });
        console.log(`  + ${classe.nom} → ${matiere.nom} (affecté)`);
      }
    }
  }

  // ── 5. Prof principal (CLASS_TEACHER) ─────────────────────────────
  console.log("\n--- Prof principal ---");
  if (classes.length > 0) {
    const classe = classes[0];
    const updated = await prisma.classe.updateMany({
      where: { id: classe.id, profPrincipalId: null },
      data: { profPrincipalId: enseignant.id },
    });
    if (updated.count > 0) {
      console.log(`  + ${classe.nom} : admin nommé prof principal`);
    } else {
      // Vérifier si l'admin est déjà prof principal
      const existing = await prisma.classe.findFirst({
        where: { id: classe.id, profPrincipalId: enseignant.id },
        select: { id: true },
      });
      if (existing) {
        console.log(`  ✓ ${classe.nom} : admin déjà prof principal`);
      } else {
        // La classe a déjà un autre prof principal — on remplace
        await prisma.classe.update({
          where: { id: classe.id },
          data: { profPrincipalId: enseignant.id },
        });
        console.log(`  ~ ${classe.nom} : admin remplace l'ancien prof principal`);
      }
    }
  }

  // ── 6. EnseignantSite ──────────────────────────────────────────────
  console.log("\n--- EnseignantSite ---");
  for (const site of sites) {
    const existing = await prisma.enseignantSite.findUnique({
      where: { enseignantId_siteId: { enseignantId: enseignant.id, siteId: site.id } },
    });
    if (existing) {
      console.log(`  ✓ ${site.nom} (déjà rattaché)`);
    } else {
      await prisma.enseignantSite.create({
        data: { enseignantId: enseignant.id, siteId: site.id },
      });
      console.log(`  + ${site.nom} (rattaché)`);
    }
  }

  // ── 7. Parent (pour PARENT) ───────────────────────────────────────
  console.log("\n--- Parent ---");
  let parent = await prisma.parent.findFirst({
    where: { userId: admin.id, tenantId },
    select: { id: true, nom: true, prenom: true },
  });
  if (parent) {
    console.log(`  ✓ Parent existant : ${parent.prenom} ${parent.nom} (${parent.id})`);
  } else {
    const [prenom, ...rest] = (admin.name || "Admin Demo").split(" ");
    const nom = rest.join(" ") || "Demo";
    parent = await prisma.parent.create({
      data: {
        userId: admin.id,
        tenantId,
        nom,
        prenom,
        email: admin.email,
        phone: "+0000000000",
      },
    });
    console.log(`  + Parent créé : ${parent.prenom} ${parent.nom} (${parent.id})`);
  }

  // ── 8. EleveParent (lien parent → élèves) ─────────────────────────
  console.log("\n--- EleveParent ---");
  const eleves = await prisma.eleve.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, nom: true, prenom: true, matricule: true },
  });
  if (eleves.length === 0) {
    console.log("  ⚠️  Aucun élève actif dans le tenant.");
  } else {
    // Lier le parent aux 2 premiers élèves (pour la démo)
    for (const eleve of eleves.slice(0, 2)) {
      const existing = await prisma.eleveParent.findUnique({
        where: { eleveId_parentId: { eleveId: eleve.id, parentId: parent.id } },
      }).catch(() => null);
      // EleveParent n'a pas d'id ni de @@unique standard — vérifier manuellement
      const existingLink = await prisma.eleveParent.findFirst({
        where: { eleveId: eleve.id, parentId: parent.id },
      });
      if (existingLink) {
        console.log(`  ✓ ${eleve.prenom} ${eleve.nom} (déjà lié)`);
      } else {
        await prisma.eleveParent.create({
          data: {
            eleveId: eleve.id,
            parentId: parent.id,
            lien: "TUTEUR",
            isGardien: true,
          },
        });
        console.log(`  + ${eleve.prenom} ${eleve.nom} (lié comme tuteur/gardien)`);
      }
    }
  }

  // ── 9. Eleve lié au compte admin (pour STUDENT) ────────────────────
  console.log("\n--- Eleve (STUDENT) ---");
  let eleveAdmin = await prisma.eleve.findFirst({
    where: { userId: admin.id, tenantId },
    select: { id: true, nom: true, prenom: true, matricule: true, classeId: true },
  });
  if (eleveAdmin) {
    console.log(`  ✓ Élève existant : ${eleveAdmin.prenom} ${eleveAdmin.nom} (${eleveAdmin.matricule})`);
  } else {
    // Créer un élève pour l'admin
    const [prenom, ...rest] = (admin.name || "Admin Demo").split(" ");
    const nom = rest.join(" ") || "Demo";
    const matricule = `DEMO-ADMIN`;
    const classe = classes[0];

    // Vérifier l'unicité du matricule
    const existingMatricule = await prisma.eleve.findUnique({
      where: { tenantId_matricule: { tenantId, matricule } },
    }).catch(() => null);

    const finalMatricule = existingMatricule ? `DEMO-ADMIN-2` : matricule;

    eleveAdmin = await prisma.eleve.create({
      data: {
        tenantId,
        siteId: sites[0]?.id ?? null,
        matricule: finalMatricule,
        nom,
        prenom,
        dateNaissance: new Date(2000, 0, 1),
        nationalite: "SN",
        sexe: "M",
        statut: "ACTIF",
        classeId: classe?.id ?? null,
        userId: admin.id,
        anneeInscription: "2025-2026",
      },
    });
    console.log(`  + Élève créé : ${eleveAdmin.prenom} ${eleveAdmin.nom} (${eleveAdmin.matricule}) → ${classe?.nom ?? "(aucune classe)"}`);
  }

  // ── Résumé ─────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("PROVISIONNEMENT TERMINÉ");
  console.log("=".repeat(60));

  // Vérification finale
  const userRoles = await prisma.userRole.findMany({
    where: { userId: admin.id, isActive: true },
    select: { role: true },
  });
  console.log(`Rôles possédés : ${userRoles.map((r) => r.role).join(", ")}`);
  console.log(`Enseignant : ${enseignant.id}`);
  console.log(`Parent : ${parent.id}`);
  console.log(`Élève : ${eleveAdmin.id}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
