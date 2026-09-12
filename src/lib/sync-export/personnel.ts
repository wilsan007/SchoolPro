import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { createStyledSheet, addRowsWithBorders, fmtDate } from "./helpers";

// ============================================================
// 5. PERSONNEL & ENSEIGNANTS
// ============================================================

export async function exportPersonnel(
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
