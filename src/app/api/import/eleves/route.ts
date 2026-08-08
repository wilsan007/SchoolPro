import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getSchoolGroup } from "@/lib/school-groups";
import type { StructureType, Sexe } from "@prisma/client";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// Mapping: nom du groupe scolaire → StructureType
const GROUP_TO_STRUCTURE: Record<string, StructureType> = {
  Primaire: "PRIMAIRE",
  Collège: "COLLEGE",
  Lycée: "LYCEE",
};

const STRUCTURE_LABELS: Record<StructureType, string> = {
  MATERNELLE: "Maternelle",
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
};

interface ParsedRow {
  nom: string;
  prenom: string;
  classe: string;
  niveau: string;
  sexe?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  matricule?: string;
  nationalite?: string;
  regime?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const siteFilter = siteFilterForModel("eleve", session.user);

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const tenantId = session.user.tenantId;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    const formSiteId = formData.get("siteId") as string | null;
    const targetSiteId = formSiteId || (session.user.siteId ?? null);

    // ── 1. Parse Excel ──────────────────────────────────────────
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "Aucune feuille trouvée dans le fichier" }, { status: 400 });
    }

    // Lire les en-têtes
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? "").trim().toLowerCase();
    });

    // Mapping flexible des colonnes
    const colMap = buildColumnMapping(headers);

    const rows: ParsedRow[] = [];
    const errors: string[] = [];

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const raw: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) raw[header] = cell.value;
      });

      const nomRaw = raw[colMap.nom]?.toString().trim();
      const prenomRaw = raw[colMap.prenom]?.toString().trim();
      const classe = raw[colMap.classe]?.toString().trim();

      if (!nomRaw) {
        errors.push(`Ligne ${i}: nom manquant`);
        continue;
      }
      if (!classe) {
        errors.push(`Ligne ${i}: classe manquante pour ${nomRaw}`);
        continue;
      }

      // Si pas de colonne prénom, splitter le nom :
      // Convention somalienne : "Ahmed Omar Hassan" → prenom=Ahmed, nom=Omar Hassan
      let nom = nomRaw;
      let prenom = prenomRaw;
      if (!prenom) {
        const parts = nomRaw.split(/\s+/);
        if (parts.length >= 2) {
          prenom = parts[0];
          nom = parts.slice(1).join(" ");
        } else {
          prenom = nomRaw;
          nom = nomRaw;
        }
      }

      rows.push({
        nom,
        prenom,
        classe,
        niveau: raw[colMap.niveau]?.toString().trim() || classe,
        sexe: raw[colMap.sexe]?.toString().trim().toUpperCase() || undefined,
        dateNaissance: raw[colMap.dateNaissance]?.toString().trim() || undefined,
        lieuNaissance: raw[colMap.lieuNaissance]?.toString().trim() || undefined,
        matricule: raw[colMap.matricule]?.toString().trim() || undefined,
        nationalite: raw[colMap.nationalite]?.toString().trim() || undefined,
        regime: raw[colMap.regime]?.toString().trim() || undefined,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        error: "Aucune ligne valide trouvée. Vérifiez les en-têtes (nom et classe sont requis).",
      }, { status: 400 });
    }

    // ── 2. Déduire les structures à partir des classes ──────────
    const groupToClasses = new Map<string, Set<string>>();
    for (const row of rows) {
      const group = getSchoolGroup(row.niveau, row.classe);
      if (!groupToClasses.has(group)) groupToClasses.set(group, new Set());
      groupToClasses.get(group)!.add(row.classe);
    }

    // ── 3. Créer ou récupérer les structures ────────────────────
    const existingStructures = await prisma.structure.findMany({
      where: { tenantId, ...siteFilterForModel("structure", session.user) },
    });
    const structureByType = new Map<string, string>(existingStructures.map((s) => [s.type, s.id]));

    const structuresToCreate: StructureType[] = [];
    for (const [group] of groupToClasses) {
      const structType = GROUP_TO_STRUCTURE[group];
      if (structType && !structureByType.has(structType)) {
        structuresToCreate.push(structType);
      }
    }

    if (structuresToCreate.length > 0) {
      await prisma.structure.createMany({
        data: structuresToCreate.map((type) => ({
          tenantId,
          type,
          nom: STRUCTURE_LABELS[type],
          actif: true,
        })),
      });
      const created = await prisma.structure.findMany({
        where: { tenantId, ...siteFilterForModel("structure", session.user), type: { in: structuresToCreate } },
      });
      for (const s of created) structureByType.set(s.type, s.id);
    }

    // ── 4. Créer ou récupérer les classes ───────────────────────
    const existingClasses = await prisma.classe.findMany({
      where: { tenantId, ...siteFilter },
      select: { id: true, nom: true, structureId: true },
    });
    const classByName = new Map<string, { id: string; structureId: string | null }>(
      existingClasses.map((c) => [c.nom, { id: c.id, structureId: c.structureId }])
    );

    const annee = await getAnneeCouranteLibelle(tenantId);
    if (!annee) return NextResponse.json({ error: "Aucune année scolaire active" }, { status: 400 });

    const classesToCreate: { nom: string; niveau: string; structureId: string | null }[] = [];
    const classNameToNiveau = new Map<string, string>();

    for (const row of rows) {
      if (!classByName.has(row.classe)) {
        const group = getSchoolGroup(row.niveau, row.classe);
        const structType = GROUP_TO_STRUCTURE[group];
        const structureId = structType ? structureByType.get(structType) ?? null : null;

        if (!classesToCreate.find((c) => c.nom === row.classe)) {
          classesToCreate.push({
            nom: row.classe,
            niveau: row.niveau,
            structureId,
          });
        }
        classNameToNiveau.set(row.classe, row.niveau);
      }
    }

    if (classesToCreate.length > 0) {
      await prisma.classe.createMany({
        data: classesToCreate.map((c) => ({
          tenantId,
          nom: c.nom,
          niveau: c.niveau,
          effectifMax: 40,
          annee,
          structureId: c.structureId,
        })),
      });
      const created = await prisma.classe.findMany({
        where: { tenantId, ...siteFilter, nom: { in: classesToCreate.map((c) => c.nom) } },
        select: { id: true, nom: true, structureId: true },
      });
      for (const c of created) {
        classByName.set(c.nom, { id: c.id, structureId: c.structureId });
      }
    }

    // ── 5. Créer les élèves ─────────────────────────────────────
    const existingEleves = await prisma.eleve.findMany({
      where: { tenantId, ...siteFilter },
      select: { matricule: true },
    });
    const existingMatricules = new Set(existingEleves.map((e) => e.matricule));

    // Générer matricules auto si non fournis
    let matriculeCounter = await prisma.eleve.count({ where: { tenantId, ...siteFilter } });

    const elevesToCreate: any[] = [];
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const classInfo = classByName.get(row.classe);
      if (!classInfo) {
        errors.push(`Classe "${row.classe}" introuvable pour ${row.prenom} ${row.nom}`);
        skipped++;
        continue;
      }

      let matricule = row.matricule;
      if (!matricule) {
        matriculeCounter++;
        matricule = `${new Date().getFullYear()}-${String(matriculeCounter).padStart(4, "0")}`;
      }

      if (existingMatricules.has(matricule)) {
        skipped++;
        continue;
      }
      existingMatricules.add(matricule);

      const sexe: Sexe = row.sexe === "F" || row.sexe === "FEMME" || row.sexe === "FILLE" ? "F" : "M";

      let dateNaissance: Date | null = null;
      if (row.dateNaissance) {
        const parsed = new Date(row.dateNaissance);
        if (!isNaN(parsed.getTime())) dateNaissance = parsed;
      }

      elevesToCreate.push({
        tenantId,
        siteId: targetSiteId,
        matricule,
        nom: row.nom,
        prenom: row.prenom,
        dateNaissance: dateNaissance ?? new Date("2008-01-01"),
        lieuNaissance: row.lieuNaissance || null,
        nationalite: row.nationalite || "SN",
        sexe,
        statut: "ACTIF",
        classeId: classInfo.id,
        regime: row.regime || "externe",
        anneeInscription: annee,
      });
      imported++;
    }

    if (elevesToCreate.length > 0) {
      // Créer par lots de 50 pour éviter les timeouts
      for (let i = 0; i < elevesToCreate.length; i += 50) {
        await prisma.eleve.createMany({
          data: elevesToCreate.slice(i, i + 50),
        });
      }
    }

    // ── 6. Réponse ──────────────────────────────────────────────
    const structuresCreated = structuresToCreate.length;
    const classesCreated = classesToCreate.length;

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: rows.length,
        imported,
        skipped,
        structuresCreated,
        classesCreated,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      },
    });
  } catch (error) {
    console.error("[API/import/eleves] POST", error);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}

function buildColumnMapping(headers: string[]): Record<string, string> {
  const find = (patterns: string[]): string | undefined => {
    return headers.find((h) => patterns.some((p) => h.includes(p)));
  };

  return {
    nom: find(["nom", "lastname", "surname"]) ?? "nom",
    prenom: find(["prenom", "prénom", "firstname", "name"]) ?? "prenom",
    classe: find(["classe", "class"]) ?? "classe",
    niveau: find(["niveau", "level"]) ?? "niveau",
    sexe: find(["sexe", "gender", "genre"]) ?? "sexe",
    dateNaissance: find(["naissance", "birth", "dob", "date"]) ?? "datenaissance",
    lieuNaissance: find(["lieu", "birthplace", "place"]) ?? "lieunaissance",
    matricule: find(["matricule", "id", "registration"]) ?? "matricule",
    nationalite: find(["nationalite", "nationality", "pays", "country"]) ?? "nationalite",
    regime: find(["regime", "internat", "pension", "boarding"]) ?? "regime",
  };
}
