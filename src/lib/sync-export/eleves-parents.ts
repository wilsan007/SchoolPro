import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { createStyledSheet, addRowsWithBorders, groupBy, fmtDate } from "./helpers";

// ============================================================
// 1. ÉLÈVES & PARENTS
// ============================================================

export async function exportElevesParents(
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
