import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { createStyledSheet, addRowsWithBorders, groupBy, fmtDate, THIN_BORDER } from "./helpers";

// ============================================================
// 8. ABSENCES ÉLÈVES
// ============================================================

export async function exportAbsences(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const [absences, classes] = await Promise.all([
    prisma.absence.findMany({
      where: { tenantId, ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}), ...siteFilterForModel("absence", claims) },
      include: {
        eleve: { select: { matricule: true, nom: true, prenom: true, classeId: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.classe.findMany({
      where: { tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", claims) },
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
