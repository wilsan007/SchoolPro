/**
 * EcolPro — Export complet des données d'un tenant
 *
 * Génère un ensemble de fichiers Excel (.xlsx) ergonomiques contenant
 * TOUTES les données d'un établissement, organisées par :
 *   - Catégorie (élèves, notes, comptabilité, personnel, etc.)
 *   - Site / Campus
 *   - Niveau de classe
 *
 * Les fichiers sont compressés en ZIP pour faciliter le téléchargement
 * et le stockage sur le PC du principal (synchronisation locale).
 *
 * Utilisé par :
 *   - GET /api/sync/export-all (agent local automatique)
 *   - Bouton "Télécharger sauvegarde complète" dans Paramètres
 */

import ExcelJS from "exceljs";
import * as archiver from "archiver";
import { Writable } from "stream";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

// ============================================================
// TYPES
// ============================================================

export interface ExportOptions {
  includeBulletins?: boolean;
  includeNotes?: boolean;
  includeEmploiTemps?: boolean;
  includeExamens?: boolean;
  includePersonnel?: boolean;
  includeComptabilite?: boolean;
  includeAbsences?: boolean;
  includeParametres?: boolean;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  fileCount: number;
  totalRows: number;
}

// ============================================================
// HELPERS COMMUNS
// ============================================================

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF4472C4" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
};

/** Nettoie un nom pour un onglet Excel (max 31 chars, pas de caractères interdits). */
function sanitizeSheetName(name: string): string {
  let cleaned = name.replace(/[/\\?*[\]:]/g, "-").trim();
  if (cleaned.length > 31) cleaned = cleaned.substring(0, 31);
  return cleaned || "Sans nom";
}

/** Crée une feuille avec en-têtes stylisées et auto-filtre. */
function createStyledSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: { header: string; key: string; width?: number }[]
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 18,
  }));

  // Style en-tête
  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // Auto-filtre
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  return sheet;
}

/** Ajoute des lignes à une feuille et applique les bordures. */
function addRowsWithBorders(
  sheet: ExcelJS.Worksheet,
  rows: Record<string, any>[]
): void {
  for (const row of rows) {
    sheet.addRow(row);
  }
  // Bordures sur toutes les cellules
  for (let i = 1; i <= sheet.rowCount; i++) {
    const r = sheet.getRow(i);
    for (let j = 1; j <= sheet.columnCount; j++) {
      const cell = r.getCell(j);
      cell.border = THIN_BORDER;
      if (i > 1) {
        cell.alignment = { vertical: "middle", wrapText: true };
      }
    }
  }
}

/** Groupe des éléments par clé et retourne un Map. */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

/** Formate une date pour Excel. */
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR");
}

/** Formate une date+heure pour Excel. */
function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("fr-FR");
}

// ============================================================
// 1. ÉLÈVES & PARENTS
// ============================================================

async function exportElevesParents(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [sites, eleves, parents, eleveParents] = await Promise.all([
    prisma.site.findMany({ where: { tenantId }, orderBy: { nom: "asc" } }),
    prisma.eleve.findMany({
      where: { tenantId, deletedAt: null, ...siteFilterForModel("eleve", claims) },
      include: {
        classe: { select: { nom: true, niveau: true } },
        site: { select: { nom: true } },
        parents: { where: siteFilterForModel("eleveParent", claims), include: { parent: true } },
      },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.parent.findMany({
      where: { tenantId, ...siteFilterForModel("parent", claims) },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.eleveParent.findMany({
      where: { eleve: { tenantId }, ...siteFilterForModel("eleveParent", claims) },
      include: {
        eleve: { select: { matricule: true, nom: true, prenom: true } },
        parent: { select: { nom: true, prenom: true, phone: true, email: true } },
      },
    }),
  ]);

  const siteMap = new Map(sites.map((s) => [s.id, s.nom]));
  const siteNames = sites.length > 0 ? sites.map((s) => s.nom) : ["Établissement"];

  // --- Onglets par site + niveau ---
  for (const siteName of siteNames) {
    const siteEleves = eleves.filter(
      (e) => (e.site?.nom ?? "Établissement") === siteName
    );
    const byNiveau = groupBy(siteEleves, (e) => e.classe?.niveau ?? "Sans niveau");

    for (const [niveau, niveauEleves] of byNiveau) {
      const sheet = createStyledSheet(workbook, `${siteName} → ${niveau}`, [
        { header: "Matricule", key: "matricule", width: 12 },
        { header: "Nom", key: "nom", width: 20 },
        { header: "Prénom", key: "prenom", width: 18 },
        { header: "Sexe", key: "sexe", width: 6 },
        { header: "Date de naissance", key: "dateNaissance", width: 16 },
        { header: "Lieu de naissance", key: "lieuNaissance", width: 18 },
        { header: "Nationalité", key: "nationalite", width: 12 },
        { header: "Classe", key: "classe", width: 15 },
        { header: "Niveau", key: "niveau", width: 12 },
        { header: "Régime", key: "regime", width: 15 },
        { header: "Statut", key: "statut", width: 12 },
        { header: "Année inscription", key: "anneeInscription", width: 14 },
        { header: "Date inscription", key: "dateInscription", width: 16 },
        { header: "Contact urgence", key: "contactUrgence", width: 20 },
        { header: "Téléphone urgence", key: "contactUrgencePhone", width: 16 },
        { header: "Groupe sanguin", key: "groupeSanguin", width: 14 },
        { header: "Allergies", key: "allergies", width: 20 },
        { header: "Besoins spéciaux", key: "besoinsSpeciaux", width: 20 },
      ]);

      addRowsWithBorders(
        sheet,
        niveauEleves.map((e) => ({
          matricule: e.matricule,
          nom: e.nom,
          prenom: e.prenom,
          sexe: e.sexe,
          dateNaissance: fmtDate(e.dateNaissance),
          lieuNaissance: e.lieuNaissance ?? "",
          nationalite: e.nationalite ?? "",
          classe: e.classe?.nom ?? "Non assigné",
          niveau: e.classe?.niveau ?? "",
          regime: e.regime ?? "",
          statut: e.statut,
          anneeInscription: e.anneeInscription,
          dateInscription: fmtDate(e.dateInscription),
          contactUrgence: e.contactUrgenceNom ?? "",
          contactUrgencePhone: e.contactUrgencePhone ?? "",
          groupeSanguin: e.groupeSanguin ?? "",
          allergies: e.allergies ?? "",
          besoinsSpeciaux: e.besoinsSpeciaux ?? "",
        }))
      );
    }
  }

  // --- Onglet Parents ---
  const parentSheet = createStyledSheet(workbook, "Parents", [
    { header: "Nom", key: "nom", width: 20 },
    { header: "Prénom", key: "prenom", width: 18 },
    { header: "Email", key: "email", width: 28 },
    { header: "Téléphone", key: "phone", width: 16 },
    { header: "Téléphone 2", key: "phone2", width: 16 },
    { header: "Profession", key: "profession", width: 20 },
    { header: "Adresse", key: "adresse", width: 30 },
  ]);
  addRowsWithBorders(
    parentSheet,
    parents.map((p) => ({
      nom: p.nom,
      prenom: p.prenom,
      email: p.email ?? "",
      phone: p.phone,
      phone2: p.phone2 ?? "",
      profession: p.profession ?? "",
      adresse: p.adresse ?? "",
    }))
  );

  // --- Onglet Correspondances Élève-Parent ---
  const linkSheet = createStyledSheet(workbook, "Élèves-Parents", [
    { header: "Matricule élève", key: "matricule", width: 14 },
    { header: "Nom élève", key: "eleveNom", width: 20 },
    { header: "Prénom élève", key: "elevePrenom", width: 18 },
    { header: "Lien", key: "lien", width: 10 },
    { header: "Tuteur légal", key: "gardien", width: 12 },
    { header: "Nom parent", key: "parentNom", width: 20 },
    { header: "Prénom parent", key: "parentPrenom", width: 18 },
    { header: "Téléphone", key: "parentPhone", width: 16 },
    { header: "Email parent", key: "parentEmail", width: 28 },
  ]);
  addRowsWithBorders(
    linkSheet,
    eleveParents.map((ep) => ({
      matricule: ep.eleve.matricule,
      eleveNom: ep.eleve.nom,
      elevePrenom: ep.eleve.prenom,
      lien: ep.lien,
      gardien: ep.isGardien ? "Oui" : "Non",
      parentNom: ep.parent.nom,
      parentPrenom: ep.parent.prenom,
      parentPhone: ep.parent.phone,
      parentEmail: ep.parent.email ?? "",
    }))
  );

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "01_Eleves_et_Parents.xlsx", rows: eleves.length + parents.length };
}

// ============================================================
// 2. NOTES & BULLETINS
// ============================================================

async function exportNotesBulletins(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [notes, bulletins] = await Promise.all([
    prisma.note.findMany({
      where: { tenantId, ...siteFilterForModel("note", claims) },
      include: {
        eleve: { select: { matricule: true, nom: true, prenom: true } },
        classe: { select: { nom: true, niveau: true, siteId: true } },
        matiere: { select: { nom: true, code: true } },
        periode: { select: { nom: true } },
      },
      orderBy: [{ classe: { niveau: "asc" } }, { classe: { nom: "asc" } }, { eleve: { nom: "asc" } }],
    }),
    prisma.bulletin.findMany({
      where: { tenantId, ...siteFilterForModel("bulletin", claims) },
      include: {
        eleve: { select: { matricule: true, nom: true, prenom: true, classeId: true } },
        periode: { select: { nom: true, annee: { select: { libelle: true } } } },
        matieres: { where: siteFilterForModel("bulletinMatiere", claims), include: { matiere: { select: { nom: true, code: true } } } },
      },
      orderBy: { eleve: { nom: "asc" } },
    }),
  ]);

  // Récupérer les classes pour mapper classeId → nom/niveau/site
  const classes = await prisma.classe.findMany({
    where: { tenantId, ...siteFilterForModel("classe", claims) },
    include: { site: { select: { nom: true } } },
  });
  const classeMap = new Map(
    classes.map((c) => [c.id, { nom: c.nom, niveau: c.niveau, site: c.site?.nom ?? "Établissement" }])
  );

  // --- Notes : onglets par niveau → classe ---
  const notesByClasse = groupBy(notes, (n) => n.classeId);
  for (const [classeId, classeNotes] of notesByClasse) {
    const c = classeMap.get(classeId);
    const sheetName = c ? `${c.site} → ${c.niveau} ${c.nom} → Notes` : "Notes sans classe";
    const sheet = createStyledSheet(workbook, sheetName, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 20 },
      { header: "Prénom", key: "prenom", width: 18 },
      { header: "Matière", key: "matiere", width: 20 },
      { header: "Type", key: "type", width: 12 },
      { header: "Intitulé", key: "intitule", width: 18 },
      { header: "Note", key: "valeur", width: 8 },
      { header: "Note max", key: "noteMax", width: 10 },
      { header: "Coefficient", key: "coefficient", width: 10 },
      { header: "Date", key: "date", width: 14 },
      { header: "Période", key: "periode", width: 16 },
      { header: "Appréciation", key: "appreciation", width: 25 },
      { header: "Publiée", key: "isPubliee", width: 10 },
    ]);

    addRowsWithBorders(
      sheet,
      classeNotes.map((n) => ({
        matricule: n.eleve.matricule,
        nom: n.eleve.nom,
        prenom: n.eleve.prenom,
        matiere: n.matiere.nom,
        type: n.type,
        intitule: n.intitule ?? "",
        valeur: n.valeur,
        noteMax: n.noteMax,
        coefficient: n.coefficient,
        date: fmtDate(n.date),
        periode: n.periode?.nom ?? "",
        appreciation: n.appreciation ?? "",
        isPubliee: n.isPubliee ? "Oui" : "Non",
      }))
    );
  }

  // --- Bulletins : onglets par niveau → classe ---
  const bulletinsByClasse = groupBy(
    bulletins.filter((b) => b.eleve.classeId),
    (b) => b.eleve.classeId!
  );
  for (const [classeId, classeBull] of bulletinsByClasse) {
    const c = classeMap.get(classeId);
    const sheetName = c ? `${c.site} → ${c.niveau} ${c.nom} → Bulletins` : "Bulletins sans classe";
    const sheet = createStyledSheet(workbook, sheetName, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 20 },
      { header: "Prénom", key: "prenom", width: 18 },
      { header: "Période", key: "periode", width: 16 },
      { header: "Année", key: "annee", width: 12 },
      { header: "Moy. générale", key: "moyenneGenerale", width: 14 },
      { header: "Moy. classe", key: "moyenneClasse", width: 14 },
      { header: "Moy. premier", key: "moyennePremier", width: 14 },
      { header: "Rang", key: "rang", width: 8 },
      { header: "Effectif", key: "effectifClasse", width: 10 },
      { header: "Heures absence", key: "heuresAbsence", width: 14 },
      { header: "Appréciation", key: "appreciation", width: 30 },
      { header: "Décision", key: "decision", width: 18 },
      { header: "Publié", key: "isPublie", width: 10 },
    ]);

    addRowsWithBorders(
      sheet,
      classeBull.map((b) => ({
        matricule: b.eleve.matricule,
        nom: b.eleve.nom,
        prenom: b.eleve.prenom,
        periode: b.periode.nom,
        annee: b.periode.annee.libelle,
        moyenneGenerale: b.moyenneGenerale,
        moyenneClasse: b.moyenneClasse,
        moyennePremier: b.moyennePremier,
        rang: b.rang,
        effectifClasse: b.effectifClasse,
        heuresAbsence: b.heuresAbsence,
        appreciation: b.appreciation ?? "",
        decision: b.decision ?? "",
        isPublie: b.isPublie ? "Oui" : "Non",
      }))
    );
  }

  // --- Onglet récapitulatif ---
  const recapSheet = createStyledSheet(workbook, "Récapitulatif", [
    { header: "Classe", key: "classe", width: 20 },
    { header: "Niveau", key: "niveau", width: 12 },
    { header: "Site", key: "site", width: 18 },
    { header: "Nb notes", key: "nbNotes", width: 10 },
    { header: "Nb bulletins", key: "nbBulletins", width: 14 },
  ]);
  for (const c of classes) {
    const nbNotes = notesByClasse.get(c.id)?.length ?? 0;
    const nbBull = bulletinsByClasse.get(c.id)?.length ?? 0;
    recapSheet.addRow({
      classe: c.nom,
      niveau: c.niveau,
      site: c.site?.nom ?? "Établissement",
      nbNotes,
      nbBulletins: nbBull,
    });
  }
  for (let i = 1; i <= recapSheet.rowCount; i++) {
    const r = recapSheet.getRow(i);
    for (let j = 1; j <= recapSheet.columnCount; j++) {
      r.getCell(j).border = THIN_BORDER;
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "02_Notes_et_Bulletins.xlsx", rows: notes.length + bulletins.length };
}

// ============================================================
// 3. EMPLOI DU TEMPS
// ============================================================

async function exportEmploiTemps(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [emploiTemps, classes, enseignants] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: { tenantId, ...siteFilterForModel("emploiTemps", claims) },
      include: {
        classe: { select: { nom: true, niveau: true, siteId: true } },
        matiere: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ classe: { niveau: "asc" } }, { jour: "asc" }, { heureDebut: "asc" }],
    }),
    prisma.classe.findMany({
      where: { tenantId, ...siteFilterForModel("classe", claims) },
      include: { site: { select: { nom: true } } },
    }),
    prisma.enseignant.findMany({
      where: { tenantId, ...siteFilterForModel("enseignant", claims) },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const classeMap = new Map(
    classes.map((c) => [c.id, { nom: c.nom, niveau: c.niveau, site: c.site?.nom ?? "Établissement" }])
  );

  // --- Onglets par site → classe ---
  const byClasse = groupBy(emploiTemps, (e) => e.classeId);
  for (const [classeId, classeEdt] of byClasse) {
    const c = classeMap.get(classeId);
    const sheetName = c ? `${c.site} → ${c.niveau} ${c.nom}` : "Sans classe";
    const sheet = createStyledSheet(workbook, sheetName, [
      { header: "Jour", key: "jour", width: 12 },
      { header: "Heure début", key: "heureDebut", width: 12 },
      { header: "Heure fin", key: "heureFin", width: 12 },
      { header: "Matière", key: "matiere", width: 20 },
      { header: "Enseignant", key: "enseignant", width: 25 },
      { header: "Salle", key: "salle", width: 12 },
      { header: "Année", key: "annee", width: 12 },
    ]);

    addRowsWithBorders(
      sheet,
      classeEdt.map((e) => ({
        jour: e.jour,
        heureDebut: e.heureDebut,
        heureFin: e.heureFin,
        matiere: e.matiere.nom,
        enseignant: e.enseignant?.user.name ?? "Non assigné",
        salle: e.salle ?? "",
        annee: e.annee,
      }))
    );
  }

  // --- Onglet emploi du temps enseignants ---
  const edtSheet = createStyledSheet(workbook, "Emploi du temps enseignants", [
    { header: "Enseignant", key: "enseignant", width: 25 },
    { header: "Jour", key: "jour", width: 12 },
    { header: "Heure début", key: "heureDebut", width: 12 },
    { header: "Heure fin", key: "heureFin", width: 12 },
    { header: "Classe", key: "classe", width: 15 },
    { header: "Matière", key: "matiere", width: 20 },
    { header: "Salle", key: "salle", width: 12 },
  ]);
  addRowsWithBorders(
    edtSheet,
    emploiTemps
      .filter((e) => e.enseignant)
      .map((e) => ({
        enseignant: e.enseignant!.user.name,
        jour: e.jour,
        heureDebut: e.heureDebut,
        heureFin: e.heureFin,
        classe: e.classe?.nom ?? "",
        matiere: e.matiere.nom,
        salle: e.salle ?? "",
      }))
  );

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "03_Emploi_du_temps.xlsx", rows: emploiTemps.length };
}

// ============================================================
// 4. EXAMENS PLANIFIÉS
// ============================================================

async function exportExamens(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [examens, sites] = await Promise.all([
    prisma.examen.findMany({
      where: { tenantId, ...siteFilterForModel("examen", claims) },
      include: {
        site: { select: { nom: true } },
        sessions: true,
      },
      orderBy: { dateDebut: "asc" },
    }),
    prisma.site.findMany({ where: { tenantId }, orderBy: { nom: "asc" } }),
  ]);

  const now = new Date();

  // --- Onglet Examens à venir ---
  const aVenir = examens.filter((e) => e.dateDebut > now);
  const aVenirSheet = createStyledSheet(workbook, "Examens à venir", [
    { header: "Intitulé", key: "intitule", width: 25 },
    { header: "Description", key: "description", width: 30 },
    { header: "Site", key: "site", width: 18 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Date début", key: "dateDebut", width: 16 },
    { header: "Date fin", key: "dateFin", width: 16 },
    { header: "Nb sessions", key: "nbSessions", width: 12 },
  ]);
  addRowsWithBorders(
    aVenirSheet,
    aVenir.map((e) => ({
      intitule: e.intitule,
      description: e.description ?? "",
      site: e.site?.nom ?? "Tous sites",
      statut: e.statut,
      dateDebut: fmtDateTime(e.dateDebut),
      dateFin: fmtDateTime(e.dateFin),
      nbSessions: e.sessions.length,
    }))
  );

  // --- Onglet Examens passés ---
  const passes = examens.filter((e) => e.dateDebut <= now);
  const passesSheet = createStyledSheet(workbook, "Examens passés", [
    { header: "Intitulé", key: "intitule", width: 25 },
    { header: "Description", key: "description", width: 30 },
    { header: "Site", key: "site", width: 18 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Date début", key: "dateDebut", width: 16 },
    { header: "Date fin", key: "dateFin", width: 16 },
    { header: "Nb sessions", key: "nbSessions", width: 12 },
  ]);
  addRowsWithBorders(
    passesSheet,
    passes.map((e) => ({
      intitule: e.intitule,
      description: e.description ?? "",
      site: e.site?.nom ?? "Tous sites",
      statut: e.statut,
      dateDebut: fmtDateTime(e.dateDebut),
      dateFin: fmtDateTime(e.dateFin),
      nbSessions: e.sessions.length,
    }))
  );

  // --- Onglets par site : sessions détaillées ---
  for (const site of sites) {
    const siteExamens = examens.filter((e) => e.siteId === site.id);
    if (siteExamens.length === 0) continue;

    const sheet = createStyledSheet(workbook, `${site.nom} → Sessions`, [
      { header: "Examen", key: "examen", width: 25 },
      { header: "Matière", key: "matiereNom", width: 20 },
      { header: "Date", key: "date", width: 16 },
      { header: "Heure début", key: "heureDebut", width: 12 },
      { header: "Heure fin", key: "heureFin", width: 12 },
      { header: "Salle", key: "salle", width: 12 },
      { header: "Niveau", key: "niveau", width: 12 },
      { header: "Statut examen", key: "statutExamen", width: 14 },
    ]);

    const rows: Record<string, any>[] = [];
    for (const ex of siteExamens) {
      for (const s of ex.sessions) {
        rows.push({
          examen: ex.intitule,
          matiereNom: s.matiereNom,
          date: fmtDate(s.date),
          heureDebut: s.heureDebut,
          heureFin: s.heureFin,
          salle: s.salle ?? "",
          niveau: s.niveau ?? "",
          statutExamen: ex.statut,
        });
      }
    }
    addRowsWithBorders(sheet, rows);
  }

  // Sessions sans site
  const noSiteExamens = examens.filter((e) => !e.siteId);
  if (noSiteExamens.length > 0) {
    const sheet = createStyledSheet(workbook, "Tous sites → Sessions", [
      { header: "Examen", key: "examen", width: 25 },
      { header: "Matière", key: "matiereNom", width: 20 },
      { header: "Date", key: "date", width: 16 },
      { header: "Heure début", key: "heureDebut", width: 12 },
      { header: "Heure fin", key: "heureFin", width: 12 },
      { header: "Salle", key: "salle", width: 12 },
      { header: "Niveau", key: "niveau", width: 12 },
      { header: "Statut examen", key: "statutExamen", width: 14 },
    ]);
    const rows: Record<string, any>[] = [];
    for (const ex of noSiteExamens) {
      for (const s of ex.sessions) {
        rows.push({
          examen: ex.intitule,
          matiereNom: s.matiereNom,
          date: fmtDate(s.date),
          heureDebut: s.heureDebut,
          heureFin: s.heureFin,
          salle: s.salle ?? "",
          niveau: s.niveau ?? "",
          statutExamen: ex.statut,
        });
      }
    }
    addRowsWithBorders(sheet, rows);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "04_Examens_planifies.xlsx", rows: examens.length };
}

// ============================================================
// 5. PERSONNEL & ENSEIGNANTS
// ============================================================

async function exportPersonnel(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [enseignants, fichesRH, bulletinsPaie, absencesPerso, congesPerso] = await Promise.all([
    prisma.enseignant.findMany({
      where: { tenantId, ...siteFilterForModel("enseignant", claims) },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        sites: { where: siteFilterForModel("enseignantSite", claims), include: { site: { select: { nom: true } } } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.ficheRH.findMany({
      where: { tenantId, ...siteFilterForModel("ficheRH", claims) },
      include: { enseignant: { include: { user: { select: { name: true } } } } },
    }),
    prisma.bulletinPaie.findMany({
      where: { ficheRH: { tenantId }, ...siteFilterForModel("bulletinPaie", claims) },
      include: { ficheRH: { include: { enseignant: { include: { user: { select: { name: true } } } } } } },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    }),
    prisma.absencePersonnel.findMany({
      where: { tenantId, ...siteFilterForModel("absencePersonnel", claims) },
      include: { enseignant: { include: { user: { select: { name: true } } } } },
      orderBy: { date: "desc" },
    }),
    prisma.congePersonnel.findMany({
      where: { tenantId, ...siteFilterForModel("congePersonnel", claims) },
      include: { enseignant: { include: { user: { select: { name: true } } } } },
      orderBy: { dateDebut: "desc" },
    }),
  ]);

  // --- Onglet Enseignants ---
  const ensSheet = createStyledSheet(workbook, "Enseignants", [
    { header: "Nom", key: "nom", width: 25 },
    { header: "Email", key: "email", width: 28 },
    { header: "Téléphone", key: "phone", width: 16 },
    { header: "Matricule", key: "matricule", width: 12 },
    { header: "Spécialité", key: "specialite", width: 20 },
    { header: "Type contrat", key: "typeContrat", width: 14 },
    { header: "Date entrée", key: "dateEntree", width: 14 },
    { header: "Sites", key: "sites", width: 30 },
  ]);
  addRowsWithBorders(
    ensSheet,
    enseignants.map((e) => ({
      nom: e.user.name,
      email: e.user.email ?? "",
      phone: e.user.phone ?? "",
      matricule: e.matricule ?? "",
      specialite: e.specialite ?? "",
      typeContrat: e.typeContrat ?? "",
      dateEntree: fmtDate(e.dateEntree),
      sites: e.sites.map((s) => s.site.nom).join(", ") || "Tous sites",
    }))
  );

  // --- Onglet Fiches RH ---
  const rhSheet = createStyledSheet(workbook, "Fiches RH", [
    { header: "Enseignant", key: "enseignant", width: 25 },
    { header: "Type contrat", key: "typeContrat", width: 14 },
    { header: "Date entrée", key: "dateEntree", width: 14 },
    { header: "Date sortie", key: "dateSortie", width: 14 },
    { header: "Salaire base", key: "salaireBase", width: 14 },
    { header: "Tarif horaire", key: "tarifHoraire", width: 14 },
    { header: "Diplôme", key: "diplome", width: 18 },
    { header: "Échelon", key: "echelon", width: 10 },
    { header: "Grade", key: "grade", width: 20 },
    { header: "Banque", key: "banque", width: 16 },
    { header: "RIB", key: "rib", width: 20 },
    { header: "Congés annuels", key: "congesAnnuels", width: 14 },
    { header: "Congés pris", key: "congesPris", width: 12 },
    { header: "Absences", key: "absencesCount", width: 10 },
  ]);
  addRowsWithBorders(
    rhSheet,
    fichesRH.map((f) => ({
      enseignant: f.enseignant.user.name,
      typeContrat: f.typeContrat,
      dateEntree: fmtDate(f.dateEntree),
      dateSortie: fmtDate(f.dateSortie),
      salaireBase: f.salaireBase ?? "",
      tarifHoraire: f.tarifHoraire ?? "",
      diplome: f.diplome ?? "",
      echelon: f.echelon,
      grade: f.grade ?? "",
      banque: f.banque ?? "",
      rib: f.rib ?? "",
      congesAnnuels: f.congesAnnuels,
      congesPris: f.congesPris,
      absencesCount: f.absencesCount,
    }))
  );

  // --- Onglet Bulletins de paie ---
  const paieSheet = createStyledSheet(workbook, "Bulletins de paie", [
    { header: "Enseignant", key: "enseignant", width: 25 },
    { header: "Mois", key: "mois", width: 8 },
    { header: "Année", key: "annee", width: 8 },
    { header: "Heures effectuées", key: "heuresEffectuees", width: 16 },
    { header: "Salaire base", key: "salaireBase", width: 14 },
    { header: "Primes", key: "primes", width: 12 },
    { header: "Déductions", key: "deductions", width: 12 },
    { header: "Net à payer", key: "netAPayer", width: 14 },
    { header: "Payé", key: "isPaye", width: 8 },
    { header: "Date paiement", key: "datePaiement", width: 14 },
    { header: "Référence", key: "reference", width: 16 },
  ]);
  addRowsWithBorders(
    paieSheet,
    bulletinsPaie.map((b) => ({
      enseignant: b.ficheRH.enseignant.user.name,
      mois: b.mois,
      annee: b.annee,
      heuresEffectuees: b.heuresEffectuees,
      salaireBase: b.salaireBase,
      primes: b.primes,
      deductions: b.deductions,
      netAPayer: b.netAPayer,
      isPaye: b.isPaye ? "Oui" : "Non",
      datePaiement: fmtDate(b.datePaiement),
      reference: b.reference ?? "",
    }))
  );

  // --- Onglet Absences du personnel ---
  const absSheet = createStyledSheet(workbook, "Absences personnel", [
    { header: "Enseignant", key: "enseignant", width: 25 },
    { header: "Date", key: "date", width: 14 },
    { header: "Heure début", key: "heureDebut", width: 12 },
    { header: "Heure fin", key: "heureFin", width: 12 },
    { header: "Type", key: "type", width: 14 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Motif", key: "motif", width: 25 },
  ]);
  addRowsWithBorders(
    absSheet,
    absencesPerso.map((a) => ({
      enseignant: a.enseignant.user.name,
      date: fmtDate(a.date),
      heureDebut: a.heureDebut ?? "",
      heureFin: a.heureFin ?? "",
      type: a.type,
      statut: a.statut,
      motif: a.motif ?? "",
    }))
  );

  // --- Onglet Congés du personnel ---
  const congeSheet = createStyledSheet(workbook, "Congés personnel", [
    { header: "Enseignant", key: "enseignant", width: 25 },
    { header: "Type", key: "type", width: 14 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Date début", key: "dateDebut", width: 14 },
    { header: "Date fin", key: "dateFin", width: 14 },
    { header: "Nb jours", key: "nbJours", width: 10 },
    { header: "Motif", key: "motif", width: 25 },
  ]);
  addRowsWithBorders(
    congeSheet,
    congesPerso.map((c) => ({
      enseignant: c.enseignant.user.name,
      type: c.type,
      statut: c.statut,
      dateDebut: fmtDate(c.dateDebut),
      dateFin: fmtDate(c.dateFin),
      nbJours: c.nbJours,
      motif: c.motif ?? "",
    }))
  );

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    filename: "05_Personnel_et_Enseignants.xlsx",
    rows: enseignants.length + fichesRH.length + bulletinsPaie.length + absencesPerso.length + congesPerso.length,
  };
}

// ============================================================
// 6. COMPTABILITÉ
// ============================================================

async function exportComptabilite(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [factures, echeanciers, echeances, paiements, relances, tarifs] = await Promise.all([
    prisma.facture.findMany({
      where: { tenantId, ...siteFilterForModel("facture", claims) },
      include: {
        eleve: { select: { matricule: true, nom: true, prenom: true } },
        site: { select: { nom: true } },
        paiements: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.echeancier.findMany({
      where: { facture: { tenantId } },
      include: { facture: { include: { eleve: { select: { matricule: true, nom: true, prenom: true } } } } },
    }),
    prisma.echeancePaiement.findMany({
      where: { facture: { tenantId } },
      include: { facture: { include: { eleve: { select: { matricule: true, nom: true, prenom: true } } } } },
      orderBy: { dateEcheance: "asc" },
    }),
    prisma.paiement.findMany({
      where: { facture: { tenantId }, ...siteFilterForModel("paiement", claims) },
      include: { facture: { include: { eleve: { select: { matricule: true, nom: true, prenom: true } } } } },
      orderBy: { date: "desc" },
    }),
    prisma.relance.findMany({
      where: { tenantId },
      include: { facture: { include: { eleve: { select: { matricule: true, nom: true, prenom: true } } } } },
      orderBy: { envoyeeLe: "desc" },
    }),
    prisma.tarifNiveau.findMany({
      where: { tenantId },
      include: { site: { select: { nom: true } } },
      orderBy: [{ niveau: "asc" }, { annee: "desc" }],
    }),
  ]);

  // --- Onglet Factures ---
  const factureSheet = createStyledSheet(workbook, "Factures", [
    { header: "Numéro", key: "numero", width: 14 },
    { header: "Matricule", key: "matricule", width: 12 },
    { header: "Élève", key: "eleve", width: 25 },
    { header: "Site", key: "site", width: 18 },
    { header: "Libellé", key: "libelle", width: 25 },
    { header: "Montant", key: "montant", width: 12 },
    { header: "Devise", key: "devise", width: 8 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Échéance", key: "echeance", width: 14 },
    { header: "Total payé", key: "totalPaye", width: 12 },
    { header: "Reste dû", key: "resteDu", width: 12 },
    { header: "Date création", key: "createdAt", width: 16 },
  ]);
  addRowsWithBorders(
    factureSheet,
    factures.map((f) => {
      const totalPaye = f.paiements.reduce((sum, p) => sum + p.montant, 0);
      return {
        numero: f.numero,
        matricule: f.eleve.matricule,
        eleve: `${f.eleve.nom} ${f.eleve.prenom}`,
        site: f.site?.nom ?? "Tous sites",
        libelle: f.libelle,
        montant: f.montant,
        devise: f.devise,
        statut: f.statut,
        echeance: fmtDate(f.echeance),
        totalPaye,
        resteDu: f.montant - totalPaye,
        createdAt: fmtDate(f.createdAt),
      };
    })
  );

  // --- Onglet Échéanciers ---
  const echSheet = createStyledSheet(workbook, "Échéanciers", [
    { header: "Élève", key: "eleve", width: 25 },
    { header: "Facture", key: "factureNumero", width: 14 },
    { header: "Nb échéances", key: "nbEcheances", width: 14 },
    { header: "Intervalle (jours)", key: "intervalleJours", width: 16 },
    { header: "Première échéance", key: "datePremiere", width: 16 },
    { header: "Statut", key: "statut", width: 12 },
  ]);
  addRowsWithBorders(
    echSheet,
    echeanciers.map((e) => ({
      eleve: `${e.facture.eleve.nom} ${e.facture.eleve.prenom}`,
      factureNumero: e.facture.numero,
      nbEcheances: e.nbEcheances,
      intervalleJours: e.intervalleJours,
      datePremiere: fmtDate(e.datePremiereEcheance),
      statut: e.statut,
    }))
  );

  // --- Onglet Échéances en retard ---
  const now = new Date();
  const enRetard = echeances.filter(
    (e) => e.statut === "EN_RETARD" || (e.statut === "EN_ATTENTE" && e.dateEcheance < now)
  );
  const retardSheet = createStyledSheet(workbook, "Échéances en retard", [
    { header: "Élève", key: "eleve", width: 25 },
    { header: "Facture", key: "factureNumero", width: 14 },
    { header: "N° échéance", key: "numero", width: 12 },
    { header: "Montant", key: "montant", width: 12 },
    { header: "Devise", key: "devise", width: 8 },
    { header: "Date échéance", key: "dateEcheance", width: 16 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Jours de retard", key: "joursRetard", width: 14 },
  ]);
  addRowsWithBorders(
    retardSheet,
    enRetard.map((e) => ({
      eleve: `${e.facture.eleve.nom} ${e.facture.eleve.prenom}`,
      factureNumero: e.facture.numero,
      numero: e.numero,
      montant: e.montant,
      devise: e.devise,
      dateEcheance: fmtDate(e.dateEcheance),
      statut: e.statut,
      joursRetard: Math.floor((now.getTime() - e.dateEcheance.getTime()) / (1000 * 60 * 60 * 24)),
    }))
  );

  // --- Onglet Paiements reçus ---
  const paieSheet = createStyledSheet(workbook, "Paiements reçus", [
    { header: "Élève", key: "eleve", width: 25 },
    { header: "Facture", key: "factureNumero", width: 14 },
    { header: "Montant", key: "montant", width: 12 },
    { header: "Devise", key: "devise", width: 8 },
    { header: "Méthode", key: "methode", width: 14 },
    { header: "Référence", key: "reference", width: 16 },
    { header: "Date", key: "date", width: 16 },
  ]);
  addRowsWithBorders(
    paieSheet,
    paiements.map((p) => ({
      eleve: `${p.facture.eleve.nom} ${p.facture.eleve.prenom}`,
      factureNumero: p.facture.numero,
      montant: p.montant,
      devise: p.devise,
      methode: p.methode,
      reference: p.reference ?? "",
      date: fmtDate(p.date),
    }))
  );

  // --- Onglet Relances ---
  const relSheet = createStyledSheet(workbook, "Relances", [
    { header: "Élève", key: "eleve", width: 25 },
    { header: "Facture", key: "factureNumero", width: 14 },
    { header: "Niveau", key: "niveau", width: 10 },
    { header: "Canal", key: "canal", width: 14 },
    { header: "Message", key: "message", width: 30 },
    { header: "Date envoi", key: "envoyeeLe", width: 16 },
  ]);
  addRowsWithBorders(
    relSheet,
    relances.map((r) => ({
      eleve: `${r.facture.eleve.nom} ${r.facture.eleve.prenom}`,
      factureNumero: r.facture.numero,
      niveau: r.niveau,
      canal: r.canal,
      message: r.message,
      envoyeeLe: fmtDate(r.envoyeeLe),
    }))
  );

  // --- Onglet Tarifs par niveau ---
  const tarifSheet = createStyledSheet(workbook, "Tarifs par niveau", [
    { header: "Niveau", key: "niveau", width: 16 },
    { header: "Année", key: "annee", width: 12 },
    { header: "Site", key: "site", width: 18 },
    { header: "Mensualité", key: "mensualite", width: 14 },
    { header: "Frais inscription", key: "fraisInscription", width: 16 },
    { header: "Devise", key: "devise", width: 8 },
  ]);
  addRowsWithBorders(
    tarifSheet,
    tarifs.map((t) => ({
      niveau: t.niveau,
      annee: t.annee,
      site: t.site?.nom ?? "Tous sites",
      mensualite: t.mensualite,
      fraisInscription: t.fraisInscription ?? "",
      devise: t.devise,
    }))
  );

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    filename: "06_Comptabilite.xlsx",
    rows: factures.length + echeances.length + paiements.length + relances.length + tarifs.length,
  };
}

// ============================================================
// 7. PARAMÈTRES ÉTABLISSEMENT
// ============================================================

async function exportParametres(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [tenant, sites, structures, classes, matieres, periodes, annees, evenements, inventaire] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.site.findMany({ where: { tenantId }, orderBy: { nom: "asc" } }),
    prisma.structure.findMany({ where: { tenantId, ...siteFilterForModel("structure", claims) }, include: { site: { select: { nom: true } } } }),
    prisma.classe.findMany({
      where: { tenantId, deletedAt: null, ...siteFilterForModel("classe", claims) },
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

// ============================================================
// 8. ABSENCES ÉLÈVES
// ============================================================

async function exportAbsences(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const [absences, classes] = await Promise.all([
    prisma.absence.findMany({
      where: { tenantId, ...siteFilterForModel("absence", claims) },
      include: {
        eleve: { select: { matricule: true, nom: true, prenom: true, classeId: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.classe.findMany({
      where: { tenantId, ...siteFilterForModel("classe", claims) },
      include: { site: { select: { nom: true } } },
    }),
  ]);

  const classeMap = new Map(
    classes.map((c) => [c.id, { nom: c.nom, niveau: c.niveau, site: c.site?.nom ?? "Établissement" }])
  );

  // --- Onglets par niveau → classe ---
  const byClasse = groupBy(
    absences.filter((a) => a.eleve.classeId),
    (a) => a.eleve.classeId!
  );
  for (const [classeId, classeAbs] of byClasse) {
    const c = classeMap.get(classeId);
    const sheetName = c ? `${c.site} → ${c.niveau} ${c.nom}` : "Absences sans classe";
    const sheet = createStyledSheet(workbook, sheetName, [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom", key: "nom", width: 20 },
      { header: "Prénom", key: "prenom", width: 18 },
      { header: "Date", key: "date", width: 14 },
      { header: "Heure début", key: "heureDebut", width: 12 },
      { header: "Heure fin", key: "heureFin", width: 12 },
      { header: "Retard", key: "isRetard", width: 8 },
      { header: "Motif", key: "motif", width: 14 },
      { header: "Statut", key: "statut", width: 14 },
      { header: "Justificatif", key: "justificatif", width: 14 },
    ]);

    addRowsWithBorders(
      sheet,
      classeAbs.map((a) => ({
        matricule: a.eleve.matricule,
        nom: a.eleve.nom,
        prenom: a.eleve.prenom,
        date: fmtDate(a.date),
        heureDebut: a.heureDebut ?? "Journée",
        heureFin: a.heureFin ?? "",
        isRetard: a.isRetard ? "Oui" : "Non",
        motif: a.motif,
        statut: a.statut,
        justificatif: a.justificatif ? "Oui" : "Non",
      }))
    );
  }

  // --- Onglet récapitulatif ---
  const recapSheet = createStyledSheet(workbook, "Récapitulatif", [
    { header: "Classe", key: "classe", width: 20 },
    { header: "Niveau", key: "niveau", width: 12 },
    { header: "Site", key: "site", width: 18 },
    { header: "Nb absences", key: "nbAbsences", width: 12 },
    { header: "Nb retards", key: "nbRetards", width: 12 },
  ]);
  for (const c of classes) {
    const cAbs = byClasse.get(c.id) ?? [];
    recapSheet.addRow({
      classe: c.nom,
      niveau: c.niveau,
      site: c.site?.nom ?? "Établissement",
      nbAbsences: cAbs.filter((a) => !a.isRetard).length,
      nbRetards: cAbs.filter((a) => a.isRetard).length,
    });
  }
  for (let i = 1; i <= recapSheet.rowCount; i++) {
    const r = recapSheet.getRow(i);
    for (let j = 1; j <= recapSheet.columnCount; j++) {
      r.getCell(j).border = THIN_BORDER;
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "08_Absences_eleves.xlsx", rows: absences.length };
}

// ============================================================
// FONCTION PRINCIPALE — Génère le ZIP complet
// ============================================================

export async function generateFullExportZip(
  tenantId: string,
  claims: SessionSiteClaims,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const opts = {
    includeBulletins: true,
    includeNotes: true,
    includeEmploiTemps: true,
    includeExamens: true,
    includePersonnel: true,
    includeComptabilite: true,
    includeAbsences: true,
    includeParametres: true,
    ...options,
  };

  // Lancer tous les exports en parallèle
  const exportTasks: Promise<{ buffer: Buffer; filename: string; rows: number }>[] = [];

  // Toujours exporter les élèves/parents
  exportTasks.push(exportElevesParents(tenantId, claims));

  if (opts.includeNotes || opts.includeBulletins) {
    exportTasks.push(exportNotesBulletins(tenantId, claims));
  }
  if (opts.includeEmploiTemps) {
    exportTasks.push(exportEmploiTemps(tenantId, claims));
  }
  if (opts.includeExamens) {
    exportTasks.push(exportExamens(tenantId, claims));
  }
  if (opts.includePersonnel) {
    exportTasks.push(exportPersonnel(tenantId, claims));
  }
  if (opts.includeComptabilite) {
    exportTasks.push(exportComptabilite(tenantId, claims));
  }
  if (opts.includeParametres) {
    exportTasks.push(exportParametres(tenantId, claims));
  }
  if (opts.includeAbsences) {
    exportTasks.push(exportAbsences(tenantId, claims));
  }

  const results = await Promise.all(exportTasks);

  // Créer le ZIP
  const archive = (archiver as any)("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  archive.pipe(writable);

  for (const result of results) {
    archive.append(result.buffer, { name: result.filename });
  }

  // Ajouter un fichier README dans le ZIP
  const now = new Date();
  const readmeContent = `SAUVEGARDE ECOLPRO
==================

Établissement : ${(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name ?? "Inconnu"}
Date : ${now.toLocaleString("fr-FR")}

CONTENU DU FICHIER ZIP
-----------------------
${results.map((r) => `• ${r.filename} (${r.rows.toLocaleString("fr-FR")} lignes)`).join("\n")}

STRUCTURE DES FICHIERS EXCEL
-----------------------------
Chaque fichier .xlsx contient plusieurs onglets organisés par :
  - Site / Campus
  - Niveau de classe
  - Catégorie de données

Pour ouvrir ces fichiers : Excel, LibreOffice Calc, Google Sheets, ou tout tableur compatible.

Cette sauvegarde a été générée automatiquement par EcolPro.
`;
  archive.append(readmeContent, { name: "README.txt" });

  await archive.finalize();

  const buffer = Buffer.concat(chunks);
  const dateStr = now.toISOString().replace(/[:.]/g, "-").substring(0, 16);
  const filename = `sauvegarde_ecolpro_${dateStr}.zip`;

  return {
    buffer,
    filename,
    fileCount: results.length,
    totalRows: results.reduce((sum, r) => sum + r.rows, 0),
  };
}
