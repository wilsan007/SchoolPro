import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { createStyledSheet, addRowsWithBorders, groupBy, fmtDate, THIN_BORDER } from "./helpers";

// ============================================================
// 2. NOTES & BULLETINS
// ============================================================

export async function exportNotesBulletins(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const [notes, bulletins] = await Promise.all([
    prisma.note.findMany({
      where: { tenantId, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}), ...siteFilterForModel("note", claims) },
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
    where: { tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", claims) },
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
