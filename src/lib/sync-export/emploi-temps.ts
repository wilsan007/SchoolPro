import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { createStyledSheet, addRowsWithBorders, groupBy } from "./helpers";

// ============================================================
// 3. EMPLOI DU TEMPS
// ============================================================

export async function exportEmploiTemps(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const [emploiTemps, classes, enseignants] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: { tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("emploiTemps", claims) },
      include: {
        classe: { select: { nom: true, niveau: true, siteId: true } },
        matiere: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ classe: { niveau: "asc" } }, { jour: "asc" }, { heureDebut: "asc" }],
    }),
    prisma.classe.findMany({
      where: { tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", claims) },
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
