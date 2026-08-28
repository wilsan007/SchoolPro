/**
 * seed-ambouli-users.ts — Utilisateurs staff & enseignants pour les 2 sites.
 * Crée : TENANT_ADMIN, PRINCIPAL ×2, SECRETARY ×2, ACCOUNTANT, SUPERVISOR ×4,
 * NURSE ×2, COUNSELOR ×2, TEACHER (~40, 20/site), FicheRH, BulletinPaie.
 */

import { PrismaClient, Role, TypeContrat } from "@prisma/client";
import bcrypt from "bcryptjs";
import { setSeed, randInt, pick, pickSome, dateStr, addMonths } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";

export interface UsersData {
  adminId: string;
  principals: Record<string, string>; // site -> userId
  accountants: Record<string, string>;
  teachers: Record<string, { userId: string; enseignantId: string; specialite: string }[]>;
  allStaffIds: string[];
}

const PASSWORD = process.env.SEED_PASSWORD ?? "Ambouli@2026!";
const SALAIRE_BASE = {
  CDI: 180000,
  FONCTIONNAIRE: 220000,
  VACATAIRE: 0, // tarif horaire
};
const GRADES = ["Professeur certifié", "Professeur agrégé", "PES", "PLP", "Contractuel"];
const DIPLOMES = ["Licence", "Master 1", "Master 2", "CAPES", "Agrégation", "Doctorat"];

const SPECIALITES = [
  "Mathématiques", "Français", "Anglais", "Arabe", "Histoire-Géographie",
  "Physique-Chimie", "SVT", "EPS", "Technologie", "Arts Plastiques",
  "Éducation Musicale", "Éducation Islamique", "Philosophie", "SES",
];

const NOMS_STAFF = [
  { prenom: "Abdillahi", nom: "Mahamoud", role: "admin" },
  { prenom: "Omar", nom: "Guelleh", role: "principal-coll" },
  { prenom: "Khadra", nom: "Hassan", role: "principal-lycee" },
  { prenom: "Said", nom: "Waberi", role: "principal-coll-2" },
  { prenom: "Fatima", nom: "Aden", role: "principal-lycee-2" },
  { prenom: "Hawa", nom: "Djama", role: "secretary" },
  { prenom: "Rachid", nom: "Yacin", role: "secretary-2" },
  { prenom: "Yacin", nom: "Gouled", role: "accountant" },
  { prenom: "Mahamoud", nom: "Farah", role: "supervisor" },
  { prenom: "Amina", nom: "Barkat", role: "supervisor-2" },
  { prenom: "Ibrahim", nom: "Elmi", role: "supervisor-3" },
  { prenom: "Safia", nom: "Hersi", role: "supervisor-4" },
  { prenom: "Leyla", nom: "Ismael", role: "nurse" },
  { prenom: "Naima", nom: "Robleh", role: "nurse-2" },
  { prenom: "Aden", nom: "Choukri", role: "counselor" },
  { prenom: "Mariam", nom: "Daoud", role: "counselor-2" },
];

export async function seedUsers(prisma: PrismaClient, ref: RefData): Promise<UsersData> {
  setSeed(20240901);
  console.log("🌱 [2/12] Création des utilisateurs staff & enseignants...");

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const allStaffIds: string[] = [];
  const principals: Record<string, string> = {};
  const accountants: Record<string, string> = {};
  const teachers: Record<string, { userId: string; enseignantId: string; specialite: string }[]> = {
    ambouli: [],
    arhiba: [],
  };

  // ── TENANT_ADMIN ────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@cite-ambouli.dj" },
    update: {},
    create: {
      tenantId: ref.tenantId,
      email: "admin@cite-ambouli.dj",
      password: passwordHash,
      name: "Abdillahi Mahamoud",
      firstName: "Abdillahi",
      lastName: "Mahamoud",
      role: Role.TENANT_ADMIN,
      phone: "+253 77 12 34 01",
    },
  });
  allStaffIds.push(admin.id);
  console.log(`  ✅ Admin: ${admin.email}`);

  // ── PRINCIPAL ×2 (1 collège + 1 lycée par site) ─────────────
  const principalDefs = [
    { site: "ambouli", email: "principal-coll-amb@cite-ambouli.dj", prenom: "Omar", nom: "Guelleh" },
    { site: "ambouli", email: "principal-lycee-amb@cite-ambouli.dj", prenom: "Khadra", nom: "Hassan" },
    { site: "arhiba", email: "principal-coll-arh@cite-ambouli.dj", prenom: "Said", nom: "Waberi" },
    { site: "arhiba", email: "principal-lycee-arh@cite-ambouli.dj", prenom: "Fatima", nom: "Aden" },
  ];
  for (const p of principalDefs) {
    const u = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        tenantId: ref.tenantId,
        siteId: ref.sites[p.site as "ambouli" | "arhiba"],
        email: p.email,
        password: passwordHash,
        name: `${p.prenom} ${p.nom}`,
        firstName: p.prenom,
        lastName: p.nom,
        role: Role.PRINCIPAL,
        phone: `+253 77 12 34 ${10 + principalDefs.indexOf(p)}`,
      },
    });
    principals[`${p.site}-${p.email.includes("coll") ? "coll" : "lycee"}`] = u.id;
    allStaffIds.push(u.id);
  }
  console.log(`  ✅ Principals: 4 (collège+lycée × 2 sites)`);

  // ── SECRETARY ×2 (1 par site) ───────────────────────────────
  for (const [site, siteId] of Object.entries(ref.sites)) {
    const email = `secretary-${site}@cite-ambouli.dj`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        tenantId: ref.tenantId,
        siteId,
        email,
        password: passwordHash,
        name: site === "ambouli" ? "Hawa Djama" : "Rachid Yacin",
        firstName: site === "ambouli" ? "Hawa" : "Rachid",
        lastName: site === "ambouli" ? "Djama" : "Yacin",
        role: Role.SECRETARY,
        phone: `+253 77 12 34 ${20 + (site === "ambouli" ? 0 : 1)}`,
      },
    });
    allStaffIds.push(u.id);
  }

  // ── ACCOUNTANT ×2 (1 par site) ──────────────────────────────
  for (const [site, siteId] of Object.entries(ref.sites)) {
    const email = `accountant-${site}@cite-ambouli.dj`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        tenantId: ref.tenantId,
        siteId,
        email,
        password: passwordHash,
        name: site === "ambouli" ? "Yacin Gouled" : "Noura Abdo",
        firstName: site === "ambouli" ? "Yacin" : "Noura",
        lastName: site === "ambouli" ? "Gouled" : "Abdo",
        role: Role.ACCOUNTANT,
        phone: `+253 77 12 34 ${30 + (site === "ambouli" ? 0 : 1)}`,
      },
    });
    accountants[site] = u.id;
    allStaffIds.push(u.id);
  }

  // ── SUPERVISOR ×4 (2 par site) ──────────────────────────────
  for (const [site, siteId] of Object.entries(ref.sites)) {
    for (let i = 0; i < 2; i++) {
      const email = `supervisor-${site}-${i + 1}@cite-ambouli.dj`;
      const u = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          tenantId: ref.tenantId,
          siteId,
          email,
          password: passwordHash,
          name: `Superviseur ${site} ${i + 1}`,
          firstName: "Superviseur",
          lastName: `${site}-${i + 1}`,
          role: Role.SUPERVISOR,
          phone: `+253 77 12 34 ${40 + i + (site === "ambouli" ? 0 : 2)}`,
        },
      });
      allStaffIds.push(u.id);
    }
  }

  // ── NURSE ×2 (1 par site) ───────────────────────────────────
  for (const [site, siteId] of Object.entries(ref.sites)) {
    const email = `nurse-${site}@cite-ambouli.dj`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        tenantId: ref.tenantId,
        siteId,
        email,
        password: passwordHash,
        name: site === "ambouli" ? "Leyla Ismael" : "Naima Robleh",
        firstName: site === "ambouli" ? "Leyla" : "Naima",
        lastName: site === "ambouli" ? "Ismael" : "Robleh",
        role: Role.NURSE,
        phone: `+253 77 12 34 ${50 + (site === "ambouli" ? 0 : 1)}`,
      },
    });
    allStaffIds.push(u.id);
  }

  // ── COUNSELOR ×2 (1 par site) ───────────────────────────────
  for (const [site, siteId] of Object.entries(ref.sites)) {
    const email = `counselor-${site}@cite-ambouli.dj`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        tenantId: ref.tenantId,
        siteId,
        email,
        password: passwordHash,
        name: site === "ambouli" ? "Aden Choukri" : "Mariam Daoud",
        firstName: site === "ambouli" ? "Aden" : "Mariam",
        lastName: site === "ambouli" ? "Choukri" : "Daoud",
        role: Role.COUNSELOR,
        phone: `+253 77 12 34 ${60 + (site === "ambouli" ? 0 : 1)}`,
      },
    });
    allStaffIds.push(u.id);
  }
  console.log(`  ✅ Staff: 1 admin + 4 principals + 2 sec + 2 acc + 4 sup + 2 nurse + 2 counselor = 17`);

  // ── TEACHERS (~20 par site = 40 total) ──────────────────────
  const teacherNoms = [
    "Mahamoud", "Abdillahi", "Omar", "Hassan", "Said", "Ibrahim", "Ali", "Mohamed",
    "Farah", "Djibril", "Aden", "Moussa", "Yacin", "Rachid", "Kamal", "Nabil",
    "Amina", "Fatima", "Asma", "Hodan", "Leyla", "Safia", "Khadra", "Naima",
    "Mariam", "Hawa", "Deqa", "Halima", "Zainab", "Sumaya", "Yasmin", "Salma",
    "Imane", "Sara", "Lina", "Hibo", "Faiza", "Ayan", "Rahma", "Noura",
  ];
  let teacherIdx = 0;
  for (const [site, siteId] of Object.entries(ref.sites)) {
    for (let i = 0; i < 20; i++) {
      const prenom = teacherNoms[teacherIdx % teacherNoms.length];
      const nom = pick(["Farah", "Waberi", "Guelleh", "Djama", "Gouled", "Barkat", "Elmi", "Hersi"]);
      const specialite = SPECIALITES[i % SPECIALITES.length];
      const email = `prof-${site}-${i + 1}@cite-ambouli.dj`;
      teacherIdx++;

      const u = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          tenantId: ref.tenantId,
          siteId,
          email,
          password: passwordHash,
          name: `${prenom} ${nom}`,
          firstName: prenom,
          lastName: nom,
          role: Role.TEACHER,
          phone: `+253 77 12 ${50 + i}`,
        },
      });
      allStaffIds.push(u.id);

      // Enseignant
      const typeContrat = pick(["CDI", "CDI", "FONCTIONNAIRE", "VACATAIRE"]) as TypeContrat;
      const ens = await prisma.enseignant.upsert({
        where: { id: `ens-${site}-${i + 1}` },
        update: {},
        create: {
          id: `ens-${site}-${i + 1}`,
          tenantId: ref.tenantId,
          userId: u.id,
          matricule: `ENS-${site.toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
          specialite,
          typeContrat,
          dateEntree: dateStr(2020 + randInt(0, 4), randInt(1, 12), randInt(1, 28)),
        },
      });

      // EnseignantSite
      await prisma.enseignantSite.upsert({
        where: { id: `enssite-${site}-${i + 1}` },
        update: {},
        create: {
          id: `enssite-${site}-${i + 1}`,
          enseignantId: ens.id,
          siteId,
        },
      });

      // FicheRH
      const salaireBase = typeContrat === "VACATAIRE" ? null : SALAIRE_BASE[typeContrat as keyof typeof SALAIRE_BASE] + randInt(-20000, 40000);
      const ficheRH = await prisma.ficheRH.upsert({
        where: { id: `rh-${site}-${i + 1}` },
        update: {},
        create: {
          id: `rh-${site}-${i + 1}`,
          tenantId: ref.tenantId,
          enseignantId: ens.id,
          typeContrat,
          dateEntree: ens.dateEntree,
          salaireBase: salaireBase ?? undefined,
          tarifHoraire: typeContrat === "VACATAIRE" ? randInt(2500, 5000) : null,
          diplome: pick(DIPLOMES),
          echelon: randInt(1, 8),
          grade: pick(GRADES),
          banque: pick(["Banque de Djibouti", "BCIM", "Saba Bank", "Caisse Populaire"]),
          rib: `DJ${randInt(100000, 999999)}`,
          congesAnnuels: 30,
          congesPris: randInt(0, 15),
          absencesCount: randInt(0, 5),
        },
      });

      // BulletinPaie (24 mois : 2024-01 à 2025-12)
      for (let mois = 1; mois <= 24; mois++) {
        const annee = 2024 + Math.floor((mois - 1) / 12);
        const m = ((mois - 1) % 12) + 1;
        const base = salaireBase ?? 0;
        const heures = typeContrat === "VACATAIRE" ? randInt(40, 80) : 151;
        const primes = randInt(0, 15000);
        const deductions = randInt(2000, 12000);
        await prisma.bulletinPaie.upsert({
          where: {
            ficheRHId_mois_annee: { ficheRHId: ficheRH.id, mois: m, annee },
          },
          update: {},
          create: {
            ficheRHId: ficheRH.id,
            mois: m,
            annee,
            heuresEffectuees: heures,
            salaireBase: base,
            primes,
            deductions,
            netAPayer: base + primes - deductions,
            isPaye: true,
            datePaiement: dateStr(annee, m, 5),
            reference: `PAY-${annee}-${String(m).padStart(2, "0")}-${ficheRH.id.slice(-4)}`,
          },
        });
      }

      teachers[site].push({ userId: u.id, enseignantId: ens.id, specialite });
    }
  }
  console.log(`  ✅ Enseignants: 40 (20/site) avec FicheRH + 24 mois de bulletins de paie`);

  return { adminId: admin.id, principals, accountants, teachers, allStaffIds };
}
