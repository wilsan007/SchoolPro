import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const periodeId = searchParams.get("periodeId");

    if (!classeId || !periodeId) {
      return NextResponse.json({ error: "classeId et periodeId sont requis" }, { status: 400 });
    }

    // Récupérer la classe et les élèves
    const classe = await prisma.classe.findFirst({
      where: { id: classeId, tenantId: session.user.tenantId },
      select: { nom: true },
    });
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    }

    const periode = await prisma.periode.findUnique({
      where: { id: periodeId },
      select: { nom: true, numero: true, annee: { select: { libelle: true } } },
    });
    if (!periode) {
      return NextResponse.json({ error: "Période introuvable" }, { status: 404 });
    }

    // Récupérer tous les bulletins de la classe pour cette période
    const bulletins = await prisma.bulletin.findMany({
      where: {
        eleve: { classeId, tenantId: session.user.tenantId, statut: "ACTIF" },
        periodeId,
      },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true } },
        matieres: { include: { matiere: { select: { nom: true, code: true } } } },
      },
      orderBy: { eleve: { nom: "asc" } },
    });

    if (bulletins.length === 0) {
      return NextResponse.json({ error: "Aucun bulletin généré pour cette classe/période" }, { status: 404 });
    }

    // Collecter toutes les matières (union de toutes les matières des bulletins)
    const matiereMap = new Map<string, { nom: string; code: string; coefficient: number }>();
    for (const b of bulletins) {
      for (const bm of b.matieres) {
        if (!matiereMap.has(bm.matiereId)) {
          matiereMap.set(bm.matiereId, {
            nom: bm.matiere.nom,
            code: bm.matiere.code,
            coefficient: bm.coefficient,
          });
        }
      }
    }
    const matieres = Array.from(matiereMap.values()).sort((a, b) => a.nom.localeCompare(b.nom));

    // Construire le classement (tri par moyenne générale décroissante)
    const sortedBulletins = [...bulletins].sort((a, b) => (b.moyenneGenerale ?? -1) - (a.moyenneGenerale ?? -1));

    // Créer le workbook Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Bulletin ${classe.nom}`, {
      views: [{ state: "frozen", ySplit: 3, xSplit: 4 }],
    });

    // Titre
    sheet.mergeCells(1, 1, 1, 4 + matieres.length + 4);
    sheet.getCell(1, 1).value = `BULLETIN DE NOTES — ${classe.nom} — ${periode.nom} — Année ${periode.annee.libelle}`;
    sheet.getCell(1, 1).font = { bold: true, size: 14 };
    sheet.getCell(1, 1).alignment = { horizontal: "center" };

    // Ligne 2: infos
    sheet.getCell(2, 1).value = `Effectif: ${bulletins.length}`;
    sheet.getCell(2, 1).font = { italic: true, size: 10 };
    const dateStr = new Date().toLocaleDateString("fr-FR");
    sheet.getCell(2, 4 + matieres.length + 4).value = `Édité le ${dateStr}`;
    sheet.getCell(2, 4 + matieres.length + 4).font = { italic: true, size: 10 };
    sheet.getCell(2, 4 + matieres.length + 4).alignment = { horizontal: "right" };

    // En-têtes (ligne 3)
    const headers = [
      "Rang", "Matricule", "Nom", "Prénom",
      ...matieres.map(m => `${m.nom}\n(coef ${m.coefficient})`),
      "Moy. Générale", "Moy. Classe", "Rang", "Appréciation",
    ];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(3, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBCFE8" } };
      cell.border = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    });

    // Largeurs de colonnes
    sheet.getColumn(1).width = 6;   // Rang
    sheet.getColumn(2).width = 12;  // Matricule
    sheet.getColumn(3).width = 20;  // Nom
    sheet.getColumn(4).width = 15;  // Prénom
    matieres.forEach((_, i) => {
      sheet.getColumn(5 + i).width = 12;
    });
    sheet.getColumn(5 + matieres.length).width = 14;     // Moy. Générale
    sheet.getColumn(5 + matieres.length + 1).width = 14; // Moy. Classe
    sheet.getColumn(5 + matieres.length + 2).width = 8;  // Rang
    sheet.getColumn(5 + matieres.length + 3).width = 25; // Appréciation

    // Données: un élève par ligne
    for (let rowIdx = 0; rowIdx < sortedBulletins.length; rowIdx++) {
      const b = sortedBulletins[rowIdx];
      const row = rowIdx + 4; // ligne 4+

      sheet.getCell(row, 1).value = rowIdx + 1;
      sheet.getCell(row, 2).value = b.eleve.matricule;
      sheet.getCell(row, 3).value = b.eleve.nom;
      sheet.getCell(row, 4).value = b.eleve.prenom;

      // Moyennes par matière
      matieres.forEach((mat, matIdx) => {
        const bm = b.matieres.find(m => m.matiere.code === mat.code);
        const cell = sheet.getCell(row, 5 + matIdx);
        cell.value = bm?.moyenneEleve ?? null;
        cell.alignment = { horizontal: "center" };
        cell.numFmt = "0.00";
        if (bm?.moyenneEleve !== null && bm?.moyenneEleve !== undefined) {
          if (bm.moyenneEleve >= 10) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
          } else {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          }
        }
      });

      // Moyenne générale
      const mgCell = sheet.getCell(row, 5 + matieres.length);
      mgCell.value = b.moyenneGenerale;
      mgCell.numFmt = "0.00";
      mgCell.font = { bold: true };
      mgCell.alignment = { horizontal: "center" };
      if (b.moyenneGenerale !== null) {
        mgCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: b.moyenneGenerale >= 10 ? "FFBAE6FD" : "FFFEE2E2" } };
      }

      // Moyenne classe
      const mcCell = sheet.getCell(row, 5 + matieres.length + 1);
      mcCell.value = b.moyenneClasse;
      mcCell.numFmt = "0.00";
      mcCell.alignment = { horizontal: "center" };

      // Rang
      sheet.getCell(row, 5 + matieres.length + 2).value = b.rang;
      sheet.getCell(row, 5 + matieres.length + 2).alignment = { horizontal: "center" };

      // Appréciation
      sheet.getCell(row, 5 + matieres.length + 3).value = b.appreciation ?? "";
      sheet.getCell(row, 5 + matieres.length + 3).alignment = { horizontal: "left" };
      sheet.getCell(row, 5 + matieres.length + 3).font = { italic: true, size: 9 };

      // Bordures
      for (let c = 1; c <= 4 + matieres.length + 4; c++) {
        sheet.getCell(row, c).border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" },
        };
      }
    }

    // Ligne des moyennes par matière (classe)
    const summaryRow = sortedBulletins.length + 4;
    sheet.getCell(summaryRow, 1).value = "MOY. CLASSE";
    sheet.getCell(summaryRow, 1).font = { bold: true, size: 9 };
    sheet.getCell(summaryRow, 1).alignment = { horizontal: "center" };
    sheet.mergeCells(summaryRow, 1, summaryRow, 4);

    matieres.forEach((mat, matIdx) => {
      const moyennes = bulletins
        .map(b => b.matieres.find(m => m.matiere.code === mat.code)?.moyenneEleve)
        .filter(v => v !== null && v !== undefined) as number[];
      const moyClasse = moyennes.length > 0
        ? Number((moyennes.reduce((a, b) => a + b, 0) / moyennes.length).toFixed(2))
        : null;
      const cell = sheet.getCell(summaryRow, 5 + matIdx);
      cell.value = moyClasse;
      cell.numFmt = "0.00";
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
    });

    // Moyenne générale de la classe
    const validMg = bulletins.map(b => b.moyenneGenerale).filter(v => v !== null) as number[];
    const mgClasse = validMg.length > 0
      ? Number((validMg.reduce((a, b) => a + b, 0) / validMg.length).toFixed(2))
      : null;
    sheet.getCell(summaryRow, 5 + matieres.length).value = mgClasse;
    sheet.getCell(summaryRow, 5 + matieres.length).numFmt = "0.00";
    sheet.getCell(summaryRow, 5 + matieres.length).font = { bold: true };
    sheet.getCell(summaryRow, 5 + matieres.length).alignment = { horizontal: "center" };
    sheet.getCell(summaryRow, 5 + matieres.length).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBAE6FD" } };

    // Bordures de la ligne résumé
    for (let c = 1; c <= 4 + matieres.length + 4; c++) {
      sheet.getCell(summaryRow, c).border = {
        top: { style: "double" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    }

    // Générer le buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Bulletin_${classe.nom.replace(/\s/g, "_")}_${periode.nom.replace(/\s/g, "_")}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[API/bulletins/export-excel]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
