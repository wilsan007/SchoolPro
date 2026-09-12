import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { createStyledSheet, addRowsWithBorders, fmtDate } from "./helpers";

// ============================================================
// 7. PARAMÈTRES ÉTABLISSEMENT
// ============================================================

export async function exportParametres(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const [tenant, sites, structures, classes, matieres, periodes, annees, evenements, inventaire] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.site.findMany({ where: { tenantId }, orderBy: { nom: "asc" } }),
    prisma.structure.findMany({ where: { tenantId, ...siteFilterForModel("structure", claims) }, include: { site: { select: { nom: true } } } }),
    prisma.classe.findMany({
      where: { tenantId, deletedAt: null, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", claims) },
      include: {
        site: { select: { nom: true } },
        structure: { select: { nom: true, type: true } },
        profPrincipal: { include: { user: { select: { name: true } } } },
        _count: { select: { eleves: { where: { deletedAt: null } } } },
      },
      orderBy: [{ niveau: "asc" }, { nom: "asc" }],
    }),
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      include: { site: { select: { nom: true } } },
      orderBy: { nom: "asc" },
    }),
    prisma.periode.findMany({
      where: { annee: { tenantId } },
      include: { annee: { select: { libelle: true } } },
      orderBy: { numero: "asc" },
    }),
    prisma.anneesScolaires.findMany({ where: { tenantId }, orderBy: { libelle: "desc" } }),
    prisma.evenement.findMany({ where: { tenantId, ...siteFilterForModel("evenement", claims) }, orderBy: { dateDebut: "asc" } }),
    prisma.itemInventaire.findMany({
      where: { tenantId, ...siteFilterForModel("itemInventaire", claims) },
      include: { site: { select: { nom: true } } },
      orderBy: { nom: "asc" },
    }),
  ]);

  // --- Onglet Informations générales ---
  const infoSheet = createStyledSheet(workbook, "Informations générales", [
    { header: "Champ", key: "champ", width: 25 },
    { header: "Valeur", key: "valeur", width: 40 },
  ]);
  if (tenant) {
    const infos = [
      { champ: "Nom", valeur: tenant.name },
      { champ: "Slug", valeur: tenant.slug },
      { champ: "Domaine", valeur: tenant.domain ?? "" },
      { champ: "Plan", valeur: tenant.plan },
      { champ: "Statut", valeur: tenant.status },
      { champ: "Adresse", valeur: tenant.address ?? "" },
      { champ: "Ville", valeur: tenant.city ?? "" },
      { champ: "Pays", valeur: tenant.country },
      { champ: "Téléphone", valeur: tenant.phone ?? "" },
      { champ: "Email", valeur: tenant.email ?? "" },
      { champ: "Site web", valeur: tenant.website ?? "" },
      { champ: "SIRET/Agrément", valeur: tenant.siret ?? "" },
      { champ: "Année en cours", valeur: tenant.currentYear },
      { champ: "Notation max", valeur: String(tenant.notationMax) },
      { champ: "Langue", valeur: tenant.langue },
      { champ: "Fuseau horaire", valeur: tenant.timezone },
      { champ: "Devise", valeur: tenant.currency },
      { champ: "Chef d'établissement", valeur: tenant.chefEtablissement ?? "" },
      { champ: "Date création", valeur: fmtDate(tenant.createdAt) },
    ];
    addRowsWithBorders(infoSheet, infos);
  }

  // --- Onglet Sites & Campus ---
  const siteSheet = createStyledSheet(workbook, "Sites & Campus", [
    { header: "Nom", key: "nom", width: 20 },
    { header: "Code", key: "code", width: 10 },
    { header: "Adresse", key: "adresse", width: 30 },
    { header: "Ville", key: "ville", width: 15 },
    { header: "Téléphone", key: "telephone", width: 16 },
    { header: "Email", key: "email", width: 25 },
    { header: "Actif", key: "actif", width: 8 },
  ]);
  addRowsWithBorders(
    siteSheet,
    sites.map((s) => ({
      nom: s.nom,
      code: s.code ?? "",
      adresse: s.adresse ?? "",
      ville: s.ville ?? "",
      telephone: s.telephone ?? "",
      email: s.email ?? "",
      actif: s.actif ? "Oui" : "Non",
    }))
  );

  // --- Onglet Structures pédagogiques ---
  const structSheet = createStyledSheet(workbook, "Structures pédagogiques", [
    { header: "Type", key: "type", width: 16 },
    { header: "Nom", key: "nom", width: 20 },
    { header: "Site", key: "site", width: 18 },
    { header: "Actif", key: "actif", width: 8 },
  ]);
  addRowsWithBorders(
    structSheet,
    structures.map((s) => ({
      type: s.type,
      nom: s.nom,
      site: s.site?.nom ?? "Tous sites",
      actif: s.actif ? "Oui" : "Non",
    }))
  );

  // --- Onglet Classes ---
  const classeSheet = createStyledSheet(workbook, "Classes", [
    { header: "Nom", key: "nom", width: 20 },
    { header: "Niveau", key: "niveau", width: 12 },
    { header: "Filière", key: "filiere", width: 18 },
    { header: "Effectif actuel", key: "effectifActuel", width: 16 },
    { header: "Effectif max", key: "effectifMax", width: 14 },
    { header: "Prof. principal", key: "profPrincipal", width: 25 },
    { header: "Structure", key: "structure", width: 20 },
    { header: "Site", key: "site", width: 18 },
    { header: "Année", key: "annee", width: 12 },
  ]);
  addRowsWithBorders(
    classeSheet,
    classes.map((c) => ({
      nom: c.nom,
      niveau: c.niveau,
      filiere: c.filiere ?? "",
      effectifActuel: c._count.eleves,
      effectifMax: c.effectifMax,
      profPrincipal: c.profPrincipal?.user.name ?? "",
      structure: c.structure ? `${c.structure.type} - ${c.structure.nom}` : "",
      site: c.site?.nom ?? "Établissement",
      annee: c.annee,
    }))
  );

  // --- Onglet Matières ---
  const matSheet = createStyledSheet(workbook, "Matières", [
    { header: "Nom", key: "nom", width: 20 },
    { header: "Code", key: "code", width: 10 },
    { header: "Coefficient", key: "coefficient", width: 12 },
    { header: "Niveau", key: "niveau", width: 12 },
    { header: "Site", key: "site", width: 18 },
  ]);
  addRowsWithBorders(
    matSheet,
    matieres.map((m) => ({
      nom: m.nom,
      code: m.code,
      coefficient: m.coefficient,
      niveau: m.niveau ?? "Tous",
      site: m.site?.nom ?? "Tous sites",
    }))
  );

  // --- Onglet Périodes & Années scolaires ---
  const perSheet = createStyledSheet(workbook, "Périodes & Années", [
    { header: "Année", key: "annee", width: 14 },
    { header: "Période", key: "periode", width: 18 },
    { header: "N°", key: "numero", width: 6 },
    { header: "Date début", key: "dateDebut", width: 14 },
    { header: "Date fin", key: "dateFin", width: 14 },
  ]);
  addRowsWithBorders(
    perSheet,
    periodes.map((p) => ({
      annee: p.annee.libelle,
      periode: p.nom,
      numero: p.numero,
      dateDebut: fmtDate(p.dateDebut),
      dateFin: fmtDate(p.dateFin),
    }))
  );

  // --- Onglet Événements calendaires ---
  const evtSheet = createStyledSheet(workbook, "Événements calendaires", [
    { header: "Titre", key: "titre", width: 25 },
    { header: "Type", key: "type", width: 14 },
    { header: "Date début", key: "dateDebut", width: 14 },
    { header: "Date fin", key: "dateFin", width: 14 },
    { header: "Description", key: "description", width: 30 },
  ]);
  addRowsWithBorders(
    evtSheet,
    evenements.map((e) => ({
      titre: e.titre,
      type: e.type,
      dateDebut: fmtDate(e.dateDebut),
      dateFin: fmtDate(e.dateFin),
      description: e.description ?? "",
    }))
  );

  // --- Onglet Inventaire ---
  const invSheet = createStyledSheet(workbook, "Inventaire", [
    { header: "Nom", key: "nom", width: 20 },
    { header: "Description", key: "description", width: 25 },
    { header: "Référence", key: "reference", width: 14 },
    { header: "Catégorie", key: "categorie", width: 16 },
    { header: "État", key: "etat", width: 12 },
    { header: "Quantité", key: "quantite", width: 10 },
    { header: "Quantité min", key: "quantiteMin", width: 12 },
    { header: "Site", key: "site", width: 18 },
  ]);
  addRowsWithBorders(
    invSheet,
    inventaire.map((i) => ({
      nom: i.nom,
      description: i.description ?? "",
      reference: i.reference ?? "",
      categorie: i.categorie,
      etat: i.etat,
      quantite: i.quantite,
      quantiteMin: i.quantiteMin,
      site: i.site?.nom ?? "Tous sites",
    }))
  );

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    filename: "07_Parametres_etablissement.xlsx",
    rows: (tenant ? 1 : 0) + sites.length + structures.length + classes.length + matieres.length + periodes.length + evenements.length + inventaire.length,
  };
}
