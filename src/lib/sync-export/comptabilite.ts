import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { createStyledSheet, addRowsWithBorders, fmtDate } from "./helpers";

// ============================================================
// 6. COMPTABILITÉ
// ============================================================

export async function exportComptabilite(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EcolPro";
  workbook.created = new Date();

  const anneeId = await anneeActiveId(tenantId);

  const [factures, echeanciers, echeances, paiements, relances, tarifs] = await Promise.all([
    prisma.facture.findMany({
      where: { tenantId, ...(anneeId ? { anneeId } : {}), ...siteFilterForModel("facture", claims) },
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
      where: { facture: { tenantId, ...(anneeId ? { anneeId } : {}) }, ...siteFilterForModel("paiement", claims) },
      include: { facture: { include: { eleve: { select: { matricule: true, nom: true, prenom: true } } } } },
      orderBy: { date: "desc" },
    }),
    prisma.relance.findMany({
      where: { tenantId, ...(anneeId ? { facture: { anneeId } } : {}) },
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
        matricule: f.eleve?.matricule ?? "",
        eleve: `${f.eleve?.nom ?? ""} ${f.eleve?.prenom ?? ""}`,
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
      eleve: `${e.facture.eleve?.nom ?? ""} ${e.facture.eleve?.prenom ?? ""}`,
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
      eleve: `${e.facture.eleve?.nom ?? ""} ${e.facture.eleve?.prenom ?? ""}`,
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
      eleve: `${p.facture.eleve?.nom ?? ""} ${p.facture.eleve?.prenom ?? ""}`,
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
      eleve: `${r.facture.eleve?.nom ?? ""} ${r.facture.eleve?.prenom ?? ""}`,
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
