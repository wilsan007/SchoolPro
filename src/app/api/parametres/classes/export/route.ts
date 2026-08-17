import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getClassesForExport } from "@/lib/actions/parametres";

export async function GET() {
  const classes = await getClassesForExport();
  if (classes.length === 0) {
    return NextResponse.json({ error: "Aucune classe à exporter" }, { status: 404 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Classes");

  ws.columns = [
    { header: "Nom", key: "nom", width: 20 },
    { header: "Niveau", key: "niveau", width: 15 },
    { header: "Filière", key: "filiere", width: 18 },
    { header: "Effectif actuel", key: "effectifActuel", width: 16 },
    { header: "Effectif max", key: "effectifMax", width: 14 },
    { header: "Prof. principal", key: "profPrincipal", width: 25 },
    { header: "Structure", key: "structure", width: 20 },
    { header: "Site", key: "site", width: 20 },
    { header: "Année", key: "annee", width: 12 },
  ];

  // Style de l'en-tête
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const c of classes) {
    ws.addRow(c);
  }

  // Bordures
  for (let i = 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    for (let j = 1; j <= ws.columnCount; j++) {
      const cell = row.getCell(j);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="classes_${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  });
}
