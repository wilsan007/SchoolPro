/**
 * seed-ambouli-ref.ts — Données de référence pour la Cité Scolaire Ambouli (Djibouti).
 *
 * Crée : tenant, 2 sites, 2 structures, 2 années scolaires, périodes,
 * calendrier scolaire, matières djiboutiennes, salles, tarifs par niveau.
 *
 * Exporte les IDs pour réutilisation par les autres modules.
 */

import { PrismaClient, PlanType, TenantStatus, StructureType } from "@prisma/client";

export const prisma = new PrismaClient();

export interface RefData {
  tenantId: string;
  sites: { ambouli: string; arhiba: string };
  structures: { collegeAmbouli: string; lyceeAmbouli: string; collegeArhiba: string; lyceeArhiba: string };
  annees: { y2024: string; y2025: string };
  periodes: Record<string, string>; // "y2024-t1" -> id
  matieres: Record<string, string>; // code -> id
  salles: Record<string, string>; // "ambouli-salle-1" -> id
  tarifs: Record<string, string>; // "college-2024" -> id
}

const MATIERES_COLLEGE = [
  { code: "MATH", nom: "Mathématiques", coef: 5, couleur: "#3b82f6" },
  { code: "FR", nom: "Français", coef: 5, couleur: "#ef4444" },
  { code: "ANG", nom: "Anglais", coef: 4, couleur: "#f59e0b" },
  { code: "AR", nom: "Arabe", coef: 3, couleur: "#10b981" },
  { code: "HG", nom: "Histoire-Géographie", coef: 3, couleur: "#f97316" },
  { code: "PC", nom: "Physique-Chimie", coef: 3, couleur: "#8b5cf6" },
  { code: "SVT", nom: "Sciences de la Vie et de la Terre", coef: 3, couleur: "#06b6d4" },
  { code: "EPS", nom: "Éducation Physique et Sportive", coef: 1, couleur: "#84cc16" },
  { code: "TECH", nom: "Technologie", coef: 2, couleur: "#64748b" },
  { code: "ART", nom: "Arts Plastiques", coef: 1, couleur: "#ec4899" },
  { code: "MUS", nom: "Éducation Musicale", coef: 1, couleur: "#a855f7" },
  { code: "ISL", nom: "Éducation Islamique", coef: 2, couleur: "#14b8a6" },
];

const MATIERES_LYCEE_EXTRA = [
  { code: "PHILO", nom: "Philosophie", coef: 3, couleur: "#7c3aed", niveau: "1ère" },
  { code: "SES", nom: "Sciences Économiques et Sociales", coef: 4, couleur: "#0ea5e9", niveau: "1ère" },
];

// Tarifs en DJF (Francs Djiboutiens)
const TARIFS = {
  COLLEGE: { mensualite: 15000, inscription: 10000, renouvellement: 5000, cantine: 6000, transport: 4000 },
  LYCEE:   { mensualite: 20000, inscription: 12000, renouvellement: 6000, cantine: 6000, transport: 4000 },
};

export async function seedReferenceData(): Promise<RefData> {
  console.log("🌱 [1/12] Création du tenant, sites, structures, années...");

  // ── Tenant ──────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "cite-scolaire-ambouli" },
    update: {},
    create: {
      name: "Cité Scolaire Ambouli",
      slug: "cite-scolaire-ambouli",
      plan: PlanType.BUSINESS,
      status: TenantStatus.ACTIVE,
      country: "DJ",
      city: "Djibouti",
      address: "Boulevard de la République, Djibouti",
      phone: "+253 21 35 12 34",
      email: "contact@cite-ambouli.dj",
      website: "https://cite-ambouli.dj",
      currentYear: "2025-2026",
      notationMax: 20,
      langue: "fr",
      timezone: "Africa/Djibouti",
      currency: "DJF",
      primaryColor: "#1d4ed8",
      secondaryColor: "#f59e0b",
      chefEtablissement: "M. Abdillahi Mahamoud",
    },
  });
  console.log(`  ✅ Tenant: ${tenant.name}`);

  // ── 2 Sites ─────────────────────────────────────────────────
  const siteAmbouli = await prisma.site.upsert({
    where: { id: "site-ambouli" },
    update: {},
    create: {
      id: "site-ambouli",
      tenantId: tenant.id,
      nom: "Campus Ambouli",
      code: "AMB",
      adresse: "Quartier Ambouli, Djibouti",
      ville: "Djibouti",
      telephone: "+253 21 35 12 35",
      email: "ambouli@cite-ambouli.dj",
      actif: true,
    },
  });

  const siteArhiba = await prisma.site.upsert({
    where: { id: "site-arhiba" },
    update: {},
    create: {
      id: "site-arhiba",
      tenantId: tenant.id,
      nom: "Annexe Arhiba",
      code: "ARH",
      adresse: "Quartier Arhiba, Djibouti",
      ville: "Djibouti",
      telephone: "+253 21 35 12 36",
      email: "arhiba@cite-ambouli.dj",
      actif: true,
    },
  });
  console.log(`  ✅ Sites: ${siteAmbouli.nom} | ${siteArhiba.nom}`);

  // ── 4 Structures (COLLEGE + LYCEE par site) ─────────────────
  const structCollAmb = await prisma.structure.upsert({
    where: { id: "struct-coll-amb" },
    update: {},
    create: {
      id: "struct-coll-amb",
      tenantId: tenant.id,
      siteId: siteAmbouli.id,
      type: StructureType.COLLEGE,
      nom: "Collège Ambouli",
      actif: true,
    },
  });
  const structLyceeAmb = await prisma.structure.upsert({
    where: { id: "struct-lycee-amb" },
    update: {},
    create: {
      id: "struct-lycee-amb",
      tenantId: tenant.id,
      siteId: siteAmbouli.id,
      type: StructureType.LYCEE,
      nom: "Lycée Ambouli",
      actif: true,
    },
  });
  const structCollArh = await prisma.structure.upsert({
    where: { id: "struct-coll-arh" },
    update: {},
    create: {
      id: "struct-coll-arh",
      tenantId: tenant.id,
      siteId: siteArhiba.id,
      type: StructureType.COLLEGE,
      nom: "Collège Arhiba",
      actif: true,
    },
  });
  const structLyceeArh = await prisma.structure.upsert({
    where: { id: "struct-lycee-arh" },
    update: {},
    create: {
      id: "struct-lycee-arh",
      tenantId: tenant.id,
      siteId: siteArhiba.id,
      type: StructureType.LYCEE,
      nom: "Lycée Arhiba",
      actif: true,
    },
  });
  console.log(`  ✅ Structures: 4 (collège+lycée × 2 sites)`);

  // ── 2 Années scolaires ──────────────────────────────────────
  const annee2024 = await prisma.anneesScolaires.upsert({
    where: { id: "annee-2024-amb" },
    update: {},
    create: {
      id: "annee-2024-amb",
      tenantId: tenant.id,
      libelle: "2024-2025",
      dateDebut: new Date("2024-09-15"),
      dateFin: new Date("2025-07-15"),
      isCurrent: false,
      statut: "CLOTUREE",
      cloturedAt: new Date("2025-07-20"),
    },
  });
  const annee2025 = await prisma.anneesScolaires.upsert({
    where: { id: "annee-2025-amb" },
    update: {},
    create: {
      id: "annee-2025-amb",
      tenantId: tenant.id,
      libelle: "2025-2026",
      dateDebut: new Date("2025-09-15"),
      dateFin: new Date("2026-07-15"),
      isCurrent: true,
      statut: "OUVERTE",
    },
  });
  console.log(`  ✅ Années: ${annee2024.libelle} (clôturée) | ${annee2025.libelle} (courante)`);

  // ── Périodes (3 trimestres × 2 ans = 6) ────────────────────
  const periodes: Record<string, string> = {};
  const periodeDefs = [
    { annee: "y2024", num: 1, nom: "1er Trimestre 2024-2025", deb: "2024-09-15", fin: "2024-12-20", cur: false, statut: "CLOTUREE" },
    { annee: "y2024", num: 2, nom: "2ème Trimestre 2024-2025", deb: "2025-01-06", fin: "2025-03-28", cur: false, statut: "CLOTUREE" },
    { annee: "y2024", num: 3, nom: "3ème Trimestre 2024-2025", deb: "2025-04-07", fin: "2025-07-15", cur: false, statut: "CLOTUREE" },
    { annee: "y2025", num: 1, nom: "1er Trimestre 2025-2026", deb: "2025-09-15", fin: "2025-12-19", cur: false, statut: "CLOTUREE" },
    { annee: "y2025", num: 2, nom: "2ème Trimestre 2025-2026", deb: "2026-01-05", fin: "2026-03-27", cur: true,  statut: "OUVERTE" },
    { annee: "y2025", num: 3, nom: "3ème Trimestre 2025-2026", deb: "2026-04-06", fin: "2026-07-14", cur: false, statut: "OUVERTE" },
  ];
  for (const p of periodeDefs) {
    const anneeId = p.annee === "y2024" ? annee2024.id : annee2025.id;
    const key = `${p.annee}-t${p.num}`;
    const id = `per-${key}-amb`;
    const per = await prisma.periode.upsert({
      where: { id },
      update: {},
      create: {
        id,
        anneeId,
        nom: p.nom,
        numero: p.num,
        dateDebut: new Date(p.deb),
        dateFin: new Date(p.fin),
        isCurrent: p.cur,
        statut: p.statut,
      },
    });
    periodes[key] = per.id;
  }
  console.log(`  ✅ Périodes: 6 (3 trimestres × 2 ans)`);

  // ── Calendrier scolaire (EvenementCalendaire) ───────────────
  const calEvents = [
    // 2024-2025
    { annee: annee2024.id, type: "VACANCE_SCOLAIRE", lib: "Vacances de la Toussaint", deb: "2024-10-28", fin: "2024-11-03" },
    { annee: annee2024.id, type: "VACANCE_SCOLAIRE", lib: "Vacances de Noël", deb: "2024-12-21", fin: "2025-01-05" },
    { annee: annee2024.id, type: "JOUR_FERIE", lib: "Fête de l'Indépendance", deb: "2025-06-27", fin: "2025-06-27" },
    { annee: annee2024.id, type: "EXAMEN", lib: "Examens blancs 1er trimestre", deb: "2024-12-09", fin: "2024-12-13" },
    { annee: annee2024.id, type: "EXAMEN", lib: "BFEM (3ème)", deb: "2025-06-02", fin: "2025-06-09" },
    { annee: annee2024.id, type: "EXAMEN", lib: "Baccalauréat", deb: "2025-06-16", fin: "2025-06-23" },
    { annee: annee2024.id, type: "JOUR_FERIE", lib: "Aïd al-Fitr", deb: "2025-04-10", fin: "2025-04-10" },
    // 2025-2026
    { annee: annee2025.id, type: "VACANCE_SCOLAIRE", lib: "Vacances de la Toussaint", deb: "2025-10-27", fin: "2025-11-02" },
    { annee: annee2025.id, type: "VACANCE_SCOLAIRE", lib: "Vacances de Noël", deb: "2025-12-20", fin: "2026-01-04" },
    { annee: annee2025.id, type: "VACANCE_SCOLAIRE", lib: "Vacances de printemps", deb: "2026-03-28", fin: "2026-04-05" },
    { annee: annee2025.id, type: "EXAMEN", lib: "Examens blancs 1er trimestre", deb: "2025-12-08", fin: "2025-12-12" },
    { annee: annee2025.id, type: "EXAMEN", lib: "Examens blancs 2ème trimestre", deb: "2026-03-23", fin: "2026-03-27" },
    { annee: annee2025.id, type: "JOUR_FERIE", lib: "Aïd al-Adha", deb: "2026-05-27", fin: "2026-05-27" },
    { annee: annee2025.id, type: "JOUR_FERIE", lib: "Fête de l'Indépendance", deb: "2026-06-27", fin: "2026-06-27" },
  ];
  for (const e of calEvents) {
    await prisma.evenementCalendaire.upsert({
      where: { id: `cal-${e.lib.replace(/\s/g, "-").toLowerCase()}-${e.deb}` },
      update: {},
      create: {
        id: `cal-${e.lib.replace(/\s/g, "-").toLowerCase()}-${e.deb}`,
        anneeId: e.annee,
        type: e.type,
        libelle: e.lib,
        dateDebut: new Date(e.deb),
        dateFin: new Date(e.fin),
      },
    });
  }
  console.log(`  ✅ Calendrier: ${calEvents.length} événements`);

  // ── Matières (PARTAGÉES entre tous les sites, siteId = NULL) ─
  // Le schéma Prisma et le filtre de site (SHARED_NULL_MODELS) sont conçus
  // pour cela : une matière avec siteId=NULL est visible de tous les sites.
  // Dupliquer "Français" par site casserait l'agrégation des notes, les
  // bulletins, le curriculum et les analytics inter-sites.
  // La clé dans `matieres` reste "${siteCode}-${matiereCode}" pour compatibilité
  // avec les consommateurs, mais toutes les clés pointent vers le MÊME ID.
  const matieres: Record<string, string> = {};
  for (const m of MATIERES_COLLEGE) {
    const id = `mat-${m.code}`;
    await prisma.matiere.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId: tenant.id,
        siteId: null, // Partagé entre tous les sites
        nom: m.nom,
        code: m.code,
        coefficient: m.coef,
        couleur: m.couleur,
      },
    });
    // Enregistrer sous les deux clés (AMB et ARH) pour compatibilité
    matieres[`AMB-${m.code}`] = id;
    matieres[`ARH-${m.code}`] = id;
  }
  for (const m of MATIERES_LYCEE_EXTRA) {
    const id = `mat-${m.code}`;
    await prisma.matiere.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId: tenant.id,
        siteId: null, // Partagé entre tous les sites
        nom: m.nom,
        code: m.code,
        coefficient: m.coef,
        couleur: m.couleur,
        niveau: m.niveau,
      },
    });
    matieres[`AMB-${m.code}`] = id;
    matieres[`ARH-${m.code}`] = id;
  }
  console.log(`  ✅ Matières: ${MATIERES_COLLEGE.length + MATIERES_LYCEE_EXTRA.length} partagées (siteId=NULL)`);

  // ── Salles ──────────────────────────────────────────────────
  const salles: Record<string, string> = {};
  const salleDefs = [
    { nom: "Salle 101", cap: 35, type: "cours", bat: "Bloc A" },
    { nom: "Salle 102", cap: 35, type: "cours", bat: "Bloc A" },
    { nom: "Salle 103", cap: 35, type: "cours", bat: "Bloc A" },
    { nom: "Salle 201", cap: 35, type: "cours", bat: "Bloc B" },
    { nom: "Salle 202", cap: 35, type: "cours", bat: "Bloc B" },
    { nom: "Salle 203", cap: 35, type: "cours", bat: "Bloc B" },
    { nom: "Labo Physique", cap: 25, type: "labo", bat: "Bloc C" },
    { nom: "Labo SVT", cap: 25, type: "labo", bat: "Bloc C" },
    { nom: "Salle Info", cap: 30, type: "informatique", bat: "Bloc C" },
    { nom: "Gymnase", cap: 60, type: "sport", bat: "Annexe" },
    { nom: "Salle des professeurs", cap: 40, type: "cours", bat: "Bloc A" },
    { nom: "CDI", cap: 40, type: "cours", bat: "Bloc B" },
  ];
  for (const site of [siteAmbouli, siteArhiba]) {
    for (const s of salleDefs) {
      const id = `salle-${site.code}-${s.nom.replace(/\s/g, "-").toLowerCase()}`;
      await prisma.salle.upsert({
        where: { id },
        update: {},
        create: {
          id,
          tenantId: tenant.id,
          siteId: site.id,
          nom: s.nom,
          capacite: s.cap,
          type: s.type,
          batiment: s.bat,
        },
      });
      salles[`${site.code}-${s.nom}`] = id;
    }
  }
  console.log(`  ✅ Salles: ${salleDefs.length} × 2 sites`);

  // ── Tarifs par niveau × année × site ────────────────────────
  const tarifs: Record<string, string> = {};
  for (const site of [siteAmbouli, siteArhiba]) {
    for (const annee of ["2024-2025", "2025-2026"]) {
      // Collège
      const tColl = TARIFS.COLLEGE;
      const idColl = `tarif-coll-${site.code}-${annee}`;
      await prisma.tarifNiveau.upsert({
        where: { id: idColl },
        update: {},
        create: {
          id: idColl,
          tenantId: tenant.id,
          siteId: site.id,
          niveau: "Collège",
          annee,
          mensualite: tColl.mensualite,
          fraisInscription: tColl.inscription,
          fraisRenouvellement: tColl.renouvellement,
          fraisCantine: tColl.cantine,
          fraisTransport: tColl.transport,
          devise: "DJF",
          nbMois: 10,
        },
      });
      tarifs[`coll-${site.code}-${annee}`] = idColl;
      // Lycée
      const tLycee = TARIFS.LYCEE;
      const idLycee = `tarif-lycee-${site.code}-${annee}`;
      await prisma.tarifNiveau.upsert({
        where: { id: idLycee },
        update: {},
        create: {
          id: idLycee,
          tenantId: tenant.id,
          siteId: site.id,
          niveau: "Lycée",
          annee,
          mensualite: tLycee.mensualite,
          fraisInscription: tLycee.inscription,
          fraisRenouvellement: tLycee.renouvellement,
          fraisCantine: tLycee.cantine,
          fraisTransport: tLycee.transport,
          devise: "DJF",
          nbMois: 10,
        },
      });
      tarifs[`lycee-${site.code}-${annee}`] = idLycee;
    }
  }
  console.log(`  ✅ Tarifs: 4 (collège/lycée × 2 ans × 2 sites)`);

  return {
    tenantId: tenant.id,
    sites: { ambouli: siteAmbouli.id, arhiba: siteArhiba.id },
    structures: {
      collegeAmbouli: structCollAmb.id,
      lyceeAmbouli: structLyceeAmb.id,
      collegeArhiba: structCollArh.id,
      lyceeArhiba: structLyceeArh.id,
    },
    annees: { y2024: annee2024.id, y2025: annee2025.id },
    periodes,
    matieres,
    salles,
    tarifs,
  };
}
