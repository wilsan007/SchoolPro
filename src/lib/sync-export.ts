/**
 * EcolPro — Export complet des données d'un tenant
 *
 * Génère un ensemble de fichiers Excel (.xlsx) ergonomiques contenant
 * TOUTES les données d'un établissement, organisées par :
 *   - Catégorie (élèves, notes, comptabilité, personnel, etc.)
 *   - Site / Campus
 *   - Niveau de classe
 *
 * Les fichiers sont compressés en ZIP pour faciliter le téléchargement
 * et le stockage sur le PC du principal (synchronisation locale).
 *
 * Utilisé par :
 *   - GET /api/sync/export-all (agent local automatique)
 *   - Bouton "Télécharger sauvegarde complète" dans Paramètres
 */

import * as archiver from "archiver";
import { Writable } from "stream";
import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import type { ExportOptions, ExportResult } from "./sync-export/helpers";
import { exportElevesParents } from "./sync-export/eleves-parents";
import { exportNotesBulletins } from "./sync-export/notes-bulletins";
import { exportEmploiTemps } from "./sync-export/emploi-temps";
import { exportExamens } from "./sync-export/examens";
import { exportPersonnel } from "./sync-export/personnel";
import { exportComptabilite } from "./sync-export/comptabilite";
import { exportParametres } from "./sync-export/parametres";
import { exportAbsences } from "./sync-export/absences";

export type { ExportOptions, ExportResult } from "./sync-export/helpers";

// ============================================================
// FONCTION PRINCIPALE — Génère le ZIP complet
// ============================================================

export async function generateFullExportZip(
  tenantId: string,
  claims: SessionSiteClaims,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const opts = {
    includeBulletins: true,
    includeNotes: true,
    includeEmploiTemps: true,
    includeExamens: true,
    includePersonnel: true,
    includeComptabilite: true,
    includeAbsences: true,
    includeParametres: true,
    ...options,
  };

  // Lancer tous les exports en parallèle
  const exportTasks: Promise<{ buffer: Buffer; filename: string; rows: number }>[] = [];

  // Toujours exporter les élèves/parents
  exportTasks.push(exportElevesParents(tenantId, claims));

  if (opts.includeNotes || opts.includeBulletins) {
    exportTasks.push(exportNotesBulletins(tenantId, claims));
  }
  if (opts.includeEmploiTemps) {
    exportTasks.push(exportEmploiTemps(tenantId, claims));
  }
  if (opts.includeExamens) {
    exportTasks.push(exportExamens(tenantId, claims));
  }
  if (opts.includePersonnel) {
    exportTasks.push(exportPersonnel(tenantId, claims));
  }
  if (opts.includeComptabilite) {
    exportTasks.push(exportComptabilite(tenantId, claims));
  }
  if (opts.includeParametres) {
    exportTasks.push(exportParametres(tenantId, claims));
  }
  if (opts.includeAbsences) {
    exportTasks.push(exportAbsences(tenantId, claims));
  }

  const results = await Promise.all(exportTasks);

  // Créer le ZIP
  const archive = (archiver as any)("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  archive.pipe(writable);

  for (const result of results) {
    archive.append(result.buffer, { name: result.filename });
  }

  // Ajouter un fichier README dans le ZIP
  const now = new Date();
  const readmeContent = `SAUVEGARDE ECOLPRO
==================

Établissement : ${(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name ?? "Inconnu"}
Date : ${now.toLocaleString("fr-FR")}

CONTENU DU FICHIER ZIP
-----------------------
${results.map((r) => `• ${r.filename} (${r.rows.toLocaleString("fr-FR")} lignes)`).join("\n")}

STRUCTURE DES FICHIERS EXCEL
-----------------------------
Chaque fichier .xlsx contient plusieurs onglets organisés par :
  - Site / Campus
  - Niveau de classe
  - Catégorie de données

Pour ouvrir ces fichiers : Excel, LibreOffice Calc, Google Sheets, ou tout tableur compatible.

Cette sauvegarde a été générée automatiquement par EcolPro.
`;
  archive.append(readmeContent, { name: "README.txt" });

  await archive.finalize();

  const buffer = Buffer.concat(chunks);
  const dateStr = now.toISOString().replace(/[:.]/g, "-").substring(0, 16);
  const filename = `sauvegarde_ecolpro_${dateStr}.zip`;

  return {
    buffer,
    filename,
    fileCount: results.length,
    totalRows: results.reduce((sum, r) => sum + r.rows, 0),
  };
}
