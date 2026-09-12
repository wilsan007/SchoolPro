import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { createStyledSheet, addRowsWithBorders, fmtDate, fmtDateTime } from "./helpers";

// ============================================================
// 4. EXAMENS PLANIFIÉS
// ============================================================

export async function exportExamens(
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
