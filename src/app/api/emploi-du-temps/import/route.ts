import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { normalizeText, fuzzyFindStrict, fuzzyFind } from "@/lib/text-match";
import { overlaps, timeToMinutes } from "@/lib/emploi-du-temps/suggest";
import { getGridConfig, MAX_MINUTES_PAR_JOUR } from "@/lib/grid-config";
import { parseEmploiFile, parseMatiereNiveau, type RawCreneau, type Jour } from "@/lib/import-parser";
import type { StructureType } from "@prisma/client";

// ============================================================
// POST /api/emploi-du-temps/import
// ============================================================
//
// Aperçu (preview) d'un import d'emploi du temps — AUCUNE écriture en base.
//
// Input  : multipart/form-data { file, classeId }
// Output : {
//   format, metaClasse, metaAnnee, warnings,
//   stats: { total, ok, warnings, errors },
//   matieresACreer: [{ key, nom, code, niveau }],
//   creneaux: [{ jour, heureDebut, heureFin, matiereId, matiereNom,
//                matiereACreerKey, enseignantId, enseignantNom, salle,
//                isEvaluation, statut, warnings }],
//   conflits: [{ type, jour, heureDebut, message }],
//   totauxParJour: [{ jour, minutes, depasse }],
//   comparaison: { inchanges, ajoutes, supprimes },
// }
//
// Règles respectées :
//  - tenantId obligatoire sur toutes les requêtes (règle 1)
//  - filtrage par année courante (règle 2)
//  - fail-closed via siteFilterForModel (règle 6)

interface MatiereCandidat {
  id: string;
  nom: string;
  code: string;
  niveau: string | null;
}

interface EnseignantCandidat {
  id: string;
  nom: string;
}

interface SalleCandidat {
  id: string;
  nom: string;
}

/** Génère un code matière : 4 premiers alphanum du nom normalisé, majuscules,
 * non-alphanum → "X", paddé avec "0". Ex: "Lecture" → "LECT". */
function genererCodeMatiere(nom: string): string {
  const code = normalizeText(nom)
    .replace(/[^a-z0-9]/g, "x")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, "0");
  return code;
}

/** Statut d'un créneau après matching. */
type StatutCreneau = "ok" | "warning" | "error";

interface CreneauPreview {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  matiereId: string | null;
  matiereNom: string;
  matiereACreerKey: string | null;
  enseignantId: string | null;
  enseignantNom: string | null;
  salle: string | null;
  isEvaluation: boolean;
  statut: StatutCreneau;
  warnings: string[];
}

interface ConflitPreview {
  type: "enseignant" | "salle" | "horaire";
  jour: Jour;
  heureDebut: string;
  message: string;
}

interface MatiereACreer {
  key: string;
  nom: string;
  code: string;
  niveau: string | null;
}

/** Match une matière : exacte (nom + niveau) → fuzzy → null (à créer). */
function matchMatiere(
  matiereNomBrut: string,
  matieres: MatiereCandidat[],
): { matiere: MatiereCandidat | null; niveau: string | null } {
  const { nom, niveau } = parseMatiereNiveau(matiereNomBrut);
  const nomNorm = normalizeText(nom);

  // 1. Exacte : nom + niveau identiques.
  let found = matieres.find(
    (m) => normalizeText(m.nom) === nomNorm && m.niveau === niveau,
  );
  // 2. Exacte nom + niveau null (matière "tous niveaux").
  if (!found) {
    found = matieres.find((m) => normalizeText(m.nom) === nomNorm && m.niveau === null);
  }
  if (found) return { matiere: found, niveau };

  // 3. Fuzzy strict sur le nom (évite les faux positifs : "Graphisme" ≠ "Écriture").
  const fuzzy = fuzzyFindStrict(
    matieres.map((m) => ({ id: m.id, nom: m.nom })),
    nom,
  );
  if (fuzzy.length > 0) {
    const best = matieres.find((m) => m.id === fuzzy[0].id)!;
    return { matiere: best, niveau };
  }

  return { matiere: null, niveau };
}

/** Match un enseignant : exacte → fuzzy → null. */
function matchEnseignant(
  nomBrut: string,
  enseignants: EnseignantCandidat[],
): EnseignantCandidat | null {
  if (!nomBrut) return null;
  const n = normalizeText(nomBrut);
  // 1. Exacte.
  let found = enseignants.find((e) => normalizeText(e.nom) === n);
  if (found) return found;
  // 2. Fuzzy.
  const fuzzy = fuzzyFind(enseignants, nomBrut);
  return fuzzy[0] ?? null;
}

/** Normalise une salle vers le nom officiel si elle existe. */
function matchSalle(nomBrut: string, salles: SalleCandidat[]): string | null {
  if (!nomBrut) return null;
  const n = normalizeText(nomBrut);
  const exact = salles.find((s) => normalizeText(s.nom) === n);
  if (exact) return exact.nom;
  return nomBrut; // conserve le nom brut si aucune salle officielle
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const siteFilter = siteFilterForModel("classe", session.user);
    const annee = await getAnneeCouranteLibelle(tenantId);
    if (!annee) {
      return NextResponse.json({ error: "Aucune année scolaire active" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const classeId = formData.get("classeId");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    if (!classeId || typeof classeId !== "string") {
      return NextResponse.json({ error: "classeId manquant" }, { status: 400 });
    }

    // Charger la classe (avec sa structure) — vérifie tenant + site + année.
    const classe = await prisma.classe.findFirst({
      where: { id: classeId, tenantId, ...siteFilter, annee },
      select: { id: true, nom: true, structure: { select: { type: true } } },
    });
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    }

    const structureType = (classe.structure?.type ?? null) as StructureType | null;
    const gridConfig = getGridConfig(structureType);
    const stepMinutes = gridConfig.stepMinutes;

    // Parser le fichier (avec snapping au pas de la grille).
    const buffer = Buffer.from(await file.arrayBuffer());
    const parseResult = await parseEmploiFile(buffer, file.name, stepMinutes);

    if (parseResult.creneaux.length === 0) {
      return NextResponse.json({
        format: parseResult.format,
        metaClasse: parseResult.metaClasse,
        metaAnnee: parseResult.metaAnnee,
        warnings: parseResult.warnings,
        stats: { total: 0, ok: 0, warnings: 0, errors: 0 },
        matieresACreer: [],
        creneaux: [],
        conflits: [],
        totauxParJour: [],
        comparaison: { inchanges: 0, ajoutes: 0, supprimes: 0 },
      });
    }

    // Charger les entités du tenant (site-scopées).
    const [matieres, enseignants, salles, emploisExistants, autresEmplois] = await Promise.all([
      prisma.matiere.findMany({
        where: { tenantId, ...siteFilterForModel("matiere", session.user) },
        select: { id: true, nom: true, code: true, niveau: true },
      }),
      prisma.enseignant.findMany({
        where: { tenantId, ...siteFilterForModel("enseignant", session.user) },
        include: { user: { select: { name: true } } },
      }),
      prisma.salle.findMany({
        where: { tenantId, ...siteFilterForModel("salle", session.user) },
        select: { id: true, nom: true },
      }),
      prisma.emploiTemps.findMany({
        where: { tenantId, ...siteFilterForModel("emploiTemps", session.user), classeId, annee, periodeId: null },
        select: { jour: true, heureDebut: true, heureFin: true, matiereId: true, enseignantId: true, salle: true },
      }),
      prisma.emploiTemps.findMany({
        where: {
          tenantId, ...siteFilterForModel("emploiTemps", session.user), annee,
          classeId: { not: classeId }, periodeId: null,
        },
        select: { jour: true, heureDebut: true, heureFin: true, enseignantId: true, salle: true },
      }),
    ]);

    const matiereCandidats: MatiereCandidat[] = matieres.map((m) => ({
      id: m.id, nom: m.nom, code: m.code, niveau: m.niveau,
    }));
    const enseignantCandidats: EnseignantCandidat[] = enseignants.map((e) => ({
      id: e.id, nom: e.user.name ?? "",
    }));
    const salleCandidats: SalleCandidat[] = salles.map((s) => ({ id: s.id, nom: s.nom }));

    // Cache des matières à créer (par clé = nom normalisé + niveau) pour
    // éviter les doublons au sein du même import.
    const matieresACreerMap = new Map<string, MatiereACreer>();

    const creneauxPreview: CreneauPreview[] = [];
    const conflits: ConflitPreview[] = [];

    for (const raw of parseResult.creneaux) {
      const warnings: string[] = [];
      let statut: StatutCreneau = "ok";

      // Validation horaire : heureFin doit être après heureDebut.
      if (!raw.heureFin || timeToMinutes(raw.heureFin) <= timeToMinutes(raw.heureDebut)) {
        warnings.push("Heure de fin manquante ou invalide");
        statut = "error";
      }

      // Match matière.
      const { matiere, niveau } = matchMatiere(raw.matiere, matiereCandidats);
      let matiereId: string | null = matiere?.id ?? null;
      let matiereACreerKey: string | null = null;
      if (!matiere) {
        // À créer : génère une clé unique par (nom normalisé + niveau).
        const { nom: nomPropre } = parseMatiereNiveau(raw.matiere);
        const key = `${normalizeText(nomPropre)}__${niveau ?? ""}`;
        if (!matieresACreerMap.has(key)) {
          matieresACreerMap.set(key, {
            key,
            nom: nomPropre,
            code: genererCodeMatiere(nomPropre),
            niveau,
          });
        }
        matiereACreerKey = key;
        warnings.push(`Matière « ${nomPropre} » sera créée (code ${genererCodeMatiere(nomPropre)})`);
        if (statut !== "error") statut = "warning";
      }

      // Match enseignant.
      const ens = matchEnseignant(raw.enseignant ?? "", enseignantCandidats);
      const enseignantId = ens?.id ?? null;
      const enseignantNom = ens?.nom ?? null;
      if (raw.enseignant && !ens) {
        warnings.push(`Enseignant « ${raw.enseignant} » non reconnu`);
        if (statut === "ok") statut = "warning";
      }

      // Match salle.
      const salle = matchSalle(raw.salle ?? "", salleCandidats);

      creneauxPreview.push({
        jour: raw.jour,
        heureDebut: raw.heureDebut,
        heureFin: raw.heureFin,
        matiereId,
        matiereNom: raw.matiere,
        matiereACreerKey,
        enseignantId,
        enseignantNom,
        salle,
        isEvaluation: raw.isEvaluation,
        statut,
        warnings,
      });
    }

    // Conflits internes au lot (chevauchements horaire / enseignant / salle).
    for (let i = 0; i < creneauxPreview.length; i++) {
      for (let j = i + 1; j < creneauxPreview.length; j++) {
        const a = creneauxPreview[i];
        const b = creneauxPreview[j];
        if (a.jour !== b.jour) continue;
        if (!overlaps(a.heureDebut, a.heureFin, b.heureDebut, b.heureFin)) continue;
        if (a.enseignantId && a.enseignantId === b.enseignantId) {
          conflits.push({
            type: "enseignant",
            jour: a.jour,
            heureDebut: a.heureDebut,
            message: `Enseignant en double le ${a.jour} à ${a.heureDebut}`,
          });
        }
        if (a.salle && a.salle === b.salle) {
          conflits.push({
            type: "salle",
            jour: a.jour,
            heureDebut: a.heureDebut,
            message: `Salle « ${a.salle} » en double le ${a.jour} à ${a.heureDebut}`,
          });
        }
      }
    }

    // Conflits externes (avec les autres classes, même année).
    for (const c of creneauxPreview) {
      if (!c.heureFin) continue;
      const ensConflict = c.enseignantId &&
        autresEmplois.some(
          (a) => a.enseignantId === c.enseignantId && a.jour === c.jour &&
            overlaps(a.heureDebut, a.heureFin, c.heureDebut, c.heureFin),
        );
      if (ensConflict) {
        conflits.push({
          type: "enseignant",
          jour: c.jour,
          heureDebut: c.heureDebut,
          message: `Enseignant déjà engagé ailleurs le ${c.jour} à ${c.heureDebut}`,
        });
      }
      const salleConflict = c.salle &&
        autresEmplois.some(
          (a) => a.salle === c.salle && a.jour === c.jour &&
            overlaps(a.heureDebut, a.heureFin, c.heureDebut, c.heureFin),
        );
      if (salleConflict) {
        conflits.push({
          type: "salle",
          jour: c.jour,
          heureDebut: c.heureDebut,
          message: `Salle « ${c.salle} » déjà occupée le ${c.jour} à ${c.heureDebut}`,
        });
      }
    }

    // Totaux horaires par jour (max 12h45 = 765 min).
    const totauxParJour: { jour: Jour; minutes: number; depasse: boolean }[] = [];
    const joursPresents = new Set(creneauxPreview.map((c) => c.jour));
    for (const jour of joursPresents) {
      const minutes = creneauxPreview
        .filter((c) => c.jour === jour && c.heureFin)
        .reduce((sum, c) => sum + (timeToMinutes(c.heureFin) - timeToMinutes(c.heureDebut)), 0);
      totauxParJour.push({ jour, minutes, depasse: minutes > MAX_MINUTES_PAR_JOUR });
    }

    // Comparaison avec l'existant : inchangés / ajoutés / supprimés.
    const existingKeys = new Set(
      emploisExistants.map((e) =>
        `${e.jour}|${e.heureDebut}|${e.heureFin}|${e.matiereId}|${e.enseignantId ?? ""}|${e.salle ?? ""}`,
      ),
    );
    const newKeys = new Set(
      creneauxPreview
        .filter((c) => c.matiereId && c.heureFin)
        .map((c) =>
          `${c.jour}|${c.heureDebut}|${c.heureFin}|${c.matiereId}|${c.enseignantId ?? ""}|${c.salle ?? ""}`,
        ),
    );
    let inchanges = 0;
    for (const k of newKeys) if (existingKeys.has(k)) inchanges++;
    const ajoutes = newKeys.size - inchanges;
    const supprimes = existingKeys.size - inchanges;

    // Stats globales.
    const ok = creneauxPreview.filter((c) => c.statut === "ok").length;
    const warn = creneauxPreview.filter((c) => c.statut === "warning").length;
    const err = creneauxPreview.filter((c) => c.statut === "error").length;

    // Avertissement si métadonnées .docx différentes de la classe/année courante.
    const warnings = [...parseResult.warnings];
    if (parseResult.metaAnnee && parseResult.metaAnnee !== annee) {
      warnings.push(`Le fichier indique l'année « ${parseResult.metaAnnee} » mais l'année active est « ${annee} ».`);
    }

    return NextResponse.json({
      format: parseResult.format,
      metaClasse: parseResult.metaClasse,
      metaAnnee: parseResult.metaAnnee,
      warnings,
      stats: { total: creneauxPreview.length, ok, warnings: warn, errors: err },
      matieresACreer: Array.from(matieresACreerMap.values()),
      creneaux: creneauxPreview,
      conflits,
      totauxParJour,
      comparaison: { inchanges, ajoutes, supprimes },
      gridConfig: {
        stepMinutes: gridConfig.stepMinutes,
        isFineGrid: gridConfig.isFineGrid,
        structureType,
      },
    });
  } catch (error) {
    console.error("[API/emploi-du-temps/import]", error);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
