import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";

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

function styledSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: string; width?: number }[]
): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet(name.substring(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  return sheet;
}

function addBorders(sheet: ExcelJS.Worksheet) {
  for (let i = 1; i <= sheet.rowCount; i++) {
    const r = sheet.getRow(i);
    for (let j = 1; j <= sheet.columnCount; j++) {
      const cell = r.getCell(j);
      cell.border = THIN_BORDER;
      if (i > 1) cell.alignment = { vertical: "middle", wrapText: true };
    }
  }
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR");
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "finance:read");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const claims = session.user as SessionSiteClaims;
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const siteId = searchParams.get("siteId") ?? undefined;

    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;

    const siteFilterPaiement = siteFilterForModel("paiement", claims);
    const siteFilterDepense = siteFilterForModel("depense", claims);

    const anneeId = await anneeActiveId(tenantId);

    const [paiements, depenses] = await Promise.all([
      prisma.paiement.findMany({
        where: {
          ...siteFilterPaiement,
          facture: { tenantId, ...(siteId ? { siteId } : {}), ...(anneeId ? { anneeId } : {}) },
          ...(from || to
            ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        include: {
          facture: {
            select: {
              numero: true,
              libelle: true,
              eleve: { select: { nom: true, prenom: true, matricule: true } },
            },
          },
        },
        orderBy: { date: "desc" },
      }),
      prisma.depense.findMany({
        where: {
          tenantId,
          ...siteFilterDepense,
          ...(siteId ? { siteId } : {}),
          ...(from || to
            ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        orderBy: { date: "desc" },
      }),
    ]);

    const totalRecettes = paiements.reduce((s, p) => s + p.montant, 0);
    const totalDepenses = depenses.reduce((s, d) => s + d.montant, 0);

    const recettesParCategorie = new Map<string, number>();
    for (const p of paiements) {
      const cat = p.facture?.libelle ?? "Autre";
      recettesParCategorie.set(cat, (recettesParCategorie.get(cat) ?? 0) + p.montant);
    }
    const depensesParCategorie = new Map<string, number>();
    for (const d of depenses) {
      depensesParCategorie.set(d.categorie, (depensesParCategorie.get(d.categorie) ?? 0) + d.montant);
    }

    const evolutionMap = new Map<string, { recettes: number; depenses: number }>();
    for (const p of paiements) {
      const mois = p.date.toISOString().substring(0, 7);
      const entry = evolutionMap.get(mois) ?? { recettes: 0, depenses: 0 };
      entry.recettes += p.montant;
      evolutionMap.set(mois, entry);
    }
    for (const d of depenses) {
      const mois = d.date.toISOString().substring(0, 7);
      const entry = evolutionMap.get(mois) ?? { recettes: 0, depenses: 0 };
      entry.depenses += d.montant;
      evolutionMap.set(mois, entry);
    }
    const evolution = Array.from(evolutionMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, v]) => ({ mois, ...v }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EcolPro";
    workbook.created = new Date();

    const recettesSheet = styledSheet(workbook, "Recettes", [
      { header: "Date", key: "date", width: 14 },
      { header: "Facture", key: "facture", width: 14 },
      { header: "Libellé", key: "libelle", width: 22 },
      { header: "Élève", key: "eleve", width: 22 },
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Méthode", key: "methode", width: 14 },
      { header: "Référence", key: "reference", width: 16 },
      { header: "Montant", key: "montant", width: 12 },
    ]);
    for (const p of paiements) {
      recettesSheet.addRow({
        date: fmtDate(p.date),
        facture: p.facture?.numero ?? "",
        libelle: p.facture?.libelle ?? "",
        eleve: p.facture?.eleve
          ? `${p.facture.eleve.prenom} ${p.facture.eleve.nom}`
          : "",
        matricule: p.facture?.eleve?.matricule ?? "",
        methode: p.methode,
        reference: p.reference ?? "",
        montant: p.montant,
      });
    }
    addBorders(recettesSheet);

    const depensesSheet = styledSheet(workbook, "Dépenses", [
      { header: "Date", key: "date", width: 14 },
      { header: "Libellé", key: "libelle", width: 24 },
      { header: "Catégorie", key: "categorie", width: 16 },
      { header: "Fournisseur", key: "fournisseur", width: 18 },
      { header: "Méthode", key: "methode", width: 14 },
      { header: "Référence", key: "reference", width: 16 },
      { header: "Montant", key: "montant", width: 12 },
    ]);
    for (const d of depenses) {
      depensesSheet.addRow({
        date: fmtDate(d.date),
        libelle: d.libelle,
        categorie: d.categorie,
        fournisseur: d.fournisseur ?? "",
        methode: d.methodePaiement ?? "",
        reference: d.reference ?? "",
        montant: d.montant,
      });
    }
    addBorders(depensesSheet);

    const resultatSheet = styledSheet(workbook, "Compte de résultat", [
      { header: "Rubrique", key: "rubrique", width: 28 },
      { header: "Montant", key: "montant", width: 16 },
    ]);
    resultatSheet.addRow({ rubrique: "Total recettes", montant: totalRecettes });
    resultatSheet.addRow({ rubrique: "Total dépenses", montant: totalDepenses });
    resultatSheet.addRow({ rubrique: "Résultat net", montant: totalRecettes - totalDepenses });
    addBorders(resultatSheet);

    const bilanSheet = styledSheet(workbook, "Bilan par catégorie", [
      { header: "Type", key: "type", width: 12 },
      { header: "Catégorie", key: "categorie", width: 24 },
      { header: "Montant", key: "montant", width: 16 },
    ]);
    for (const [cat, montant] of recettesParCategorie) {
      bilanSheet.addRow({ type: "Recette", categorie: cat, montant });
    }
    for (const [cat, montant] of depensesParCategorie) {
      bilanSheet.addRow({ type: "Dépense", categorie: cat, montant });
    }
    addBorders(bilanSheet);

    const evolSheet = styledSheet(workbook, "Évolution mensuelle", [
      { header: "Mois", key: "mois", width: 12 },
      { header: "Recettes", key: "recettes", width: 14 },
      { header: "Dépenses", key: "depenses", width: 14 },
    ]);
    for (const e of evolution) {
      evolSheet.addRow({ mois: e.mois, recettes: e.recettes, depenses: e.depenses });
    }
    addBorders(evolSheet);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fromStr = dateFrom ?? "debut";
    const toStr = dateTo ?? "fin";
    const filename = `finances-${fromStr}-${toStr}.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[API/finances/export]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
