import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, isRelationScopedRole } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import type { Jour } from "@prisma/client";

const JOURS: Jour[] = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];

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

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;

    if (isRelationScopedRole(session.user.role)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") ?? "excel";
    const scope = searchParams.get("scope") ?? "all";
    const classeId = searchParams.get("classeId") ?? undefined;
    const enseignantId = searchParams.get("enseignantId") ?? undefined;
    const siteId = searchParams.get("siteId") ?? undefined;
    const periodeId = searchParams.get("periodeId") ?? undefined;

    const tenantId = session.user.tenantId;
    const emploiFilter = siteFilterForModel("emploiTemps", session.user);
    const annee = await getAnneeCouranteLibelle(tenantId);

    const emplois = await prisma.emploiTemps.findMany({
      where: {
        tenantId,
        ...emploiFilter,
        ...(annee ? { annee } : {}),
        ...(classeId ? { classeId } : {}),
        ...(enseignantId ? { enseignantId } : {}),
        ...(siteId ? { classe: { siteId } } : {}),
        // Si periodeId fourni, exporter les créneaux de cette période + annuels
        ...(periodeId ? { OR: [{ periodeId }, { periodeId: null }] } : {}),
      },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true, niveau: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    });

    const dateStr = new Date().toISOString().split("T")[0];

    if (format === "pdf") {
      return generatePdfHtml(emplois, scope, dateStr);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EcolPro";
    workbook.created = new Date();

    const byJour = new Map<Jour, typeof emplois>();
    for (const j of JOURS) {
      byJour.set(j, emplois.filter((e) => e.jour === j));
    }

    for (const j of JOURS) {
      const rows = byJour.get(j) ?? [];
      if (rows.length === 0) continue;
      const sheet = workbook.addWorksheet(j, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      sheet.columns = [
        { header: "Heure", key: "heure", width: 16 },
        { header: "Classe", key: "classe", width: 18 },
        { header: "Matière", key: "matiere", width: 22 },
        { header: "Enseignant", key: "enseignant", width: 25 },
        { header: "Salle", key: "salle", width: 14 },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = HEADER_FONT;
      headerRow.fill = HEADER_FILL;
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 22;
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 5 },
      };

      for (const e of rows) {
        sheet.addRow({
          heure: `${e.heureDebut} - ${e.heureFin}`,
          classe: e.classe?.nom ?? "",
          matiere: e.matiere?.nom ?? "",
          enseignant: e.enseignant?.user.name ?? "",
          salle: e.salle ?? "",
        });
      }
      for (let i = 1; i <= sheet.rowCount; i++) {
        const r = sheet.getRow(i);
        for (let k = 1; k <= sheet.columnCount; k++) {
          const cell = r.getCell(k);
          cell.border = THIN_BORDER;
          if (i > 1) cell.alignment = { vertical: "middle", wrapText: true };
        }
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `emploi-du-temps-${scope}-${dateStr}.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[API/emploi-du-temps/export]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function generatePdfHtml(
  emplois: Array<{
    jour: string;
    heureDebut: string;
    heureFin: string;
    salle: string | null;
    matiere: { nom: string; code: string; couleur: string | null };
    classe: { nom: string } | null;
    enseignant: { user: { name: string | null } } | null;
  }>,
  scope: string,
  dateStr: string
) {
  const byJour = new Map<string, typeof emplois>();
  for (const j of JOURS) {
    byJour.set(j, emplois.filter((e) => e.jour === j));
  }

  const tables = JOURS.filter((j) => (byJour.get(j) ?? []).length > 0)
    .map((j) => {
      const rows = byJour.get(j) ?? [];
      const body = rows
        .map(
          (e) =>
            `<tr><td>${e.heureDebut} - ${e.heureFin}</td><td>${e.classe?.nom ?? ""}</td><td>${e.matiere?.nom ?? ""}</td><td>${e.enseignant?.user.name ?? ""}</td><td>${e.salle ?? ""}</td></tr>`
        )
        .join("");
      return `<h2>${j}</h2><table><thead><tr><th>Heure</th><th>Classe</th><th>Matière</th><th>Enseignant</th><th>Salle</th></tr></thead><tbody>${body}</tbody></table>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Emploi du temps (${scope}) — ${dateStr}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { padding: 8px; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 12px; background: #f9fafb; }
  td { padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #1e40af; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #1e3a8a; }
  @media print { .print-btn { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<h1>Emploi du temps (${scope}) — ${dateStr}</h1>
${tables}
<button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
