import prisma from "@/lib/prisma";
import { fuzzyFind } from "@/lib/text-match";
import { infererColonnes, valeurChamp } from "@/lib/column-inference";
import { type PlanImport, type LigneImport, type ResultatImport } from "./types";

// ============================================================
// IMPORT EDT EXTERNES (indisponibilités enseignants)
// ============================================================

/// Données d'une ligne d'import d'emploi du temps externe.
/// Le fichier représente les cours d'un enseignant dans un autre
/// établissement — chaque ligne devient une indisponibilité dans
/// SchoolPro pour que le moteur d'EDT ne propose pas de créneau
/// en conflit.
export interface DonneesEdtExterne {
  [key: string]: unknown;
  enseignantNom: string;
  enseignantPrenom?: string;
  enseignantEmail?: string;
  enseignantId?: string; // ID SchoolPro si déjà résolu
  jour: string;
  heureDebut: string;
  heureFin: string;
  etablissement?: string; // nom de l'établissement externe
  matiere?: string; // matière enseignée à l'externe (pour info)
  periode?: string; // "T1", "T2", "T3" ou nom de période
}

/// Normalise un jour en enum Jour Prisma.
function normaliserJour(v: string): string | null {
  const s = v.trim().toUpperCase();
  const map: Record<string, string> = {
    "LUNDI": "LUNDI", "LUN": "LUNDI", "MON": "LUNDI", "MONDAY": "LUNDI",
    "MARDI": "MARDI", "MAR": "MARDI", "TUE": "MARDI", "TUESDAY": "MARDI",
    "MERCREDI": "MERCREDI", "MER": "MERCREDI", "WED": "MERCREDI", "WEDNESDAY": "MERCREDI",
    "JEUDI": "JEUDI", "JEU": "JEUDI", "THU": "JEUDI", "THURSDAY": "JEUDI",
    "VENDREDI": "VENDREDI", "VEN": "VENDREDI", "FRI": "VENDREDI", "FRIDAY": "VENDREDI",
    "SAMEDI": "SAMEDI", "SAM": "SAMEDI", "SAT": "SAMEDI", "SATURDAY": "SAMEDI",
    "DIMANCHE": "DIMANCHE", "DIM": "DIMANCHE", "SUN": "DIMANCHE", "SUNDAY": "DIMANCHE",
  };
  return map[s] ?? null;
}

/// Valide qu'une heure est au format HH:MM
function validerHeure(v: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(v.trim());
}

export async function analyserEdtExternes(
  rows: Record<string, string>[],
  tenantId: string,
  headers?: string[]
): Promise<PlanImport<DonneesEdtExterne>> {
  const mapping = headers
    ? infererColonnes(headers, rows, "edt-externes")
    : infererColonnes(Object.keys(rows[0] ?? {}), rows, "edt-externes");
  const hs = headers ?? Object.keys(rows[0] ?? {});

  const lignes: LigneImport<DonneesEdtExterne>[] = [];

  // Charger tous les enseignants du tenant pour la résolution par nom
  // eslint-disable-next-line ecolpro/require-site-filter -- import: résolution par nom sur tout le tenant
  const enseignants = await prisma.enseignant.findMany({
    where: { tenantId },
    include: { user: { select: { name: true, email: true } } },
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nom = valeurChamp(row, hs, mapping, "nom");
    const prenom = valeurChamp(row, hs, mapping, "prenom");
    const email = valeurChamp(row, hs, mapping, "email");
    const jour = valeurChamp(row, hs, mapping, "jour");
    const heureDebut = valeurChamp(row, hs, mapping, "heureDebut");
    const heureFin = valeurChamp(row, hs, mapping, "heureFin");
    const etablissement = valeurChamp(row, hs, mapping, "etablissement");
    const matiere = valeurChamp(row, hs, mapping, "matieres");
    const periode = valeurChamp(row, hs, mapping, "periode");

    // Validations
    if (!nom) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, jour, heureDebut, heureFin },
        message: "Nom de l'enseignant requis",
      });
      continue;
    }

    const jourNormalise = normaliserJour(jour);
    if (!jourNormalise) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, jour, heureDebut, heureFin },
        message: `Jour non reconnu: "${jour}". Utilisez LUNDI, MARDI, … ou LUN, MAR, …`,
      });
      continue;
    }

    if (!validerHeure(heureDebut) || !validerHeure(heureFin)) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, jour, heureDebut, heureFin },
        message: "Heures invalides — format attendu HH:MM (ex: 08:00)",
      });
      continue;
    }

    // Résolution de l'enseignant : par email d'abord, puis par nom fuzzy
    let enseignantId: string | undefined;
    if (email) {
      const match = enseignants.find((e) => e.user.email?.toLowerCase() === email.toLowerCase());
      if (match) enseignantId = match.id;
    }
    if (!enseignantId) {
      const nomComplet = prenom ? `${prenom} ${nom}` : nom;
      // fuzzyFind cherche par substring/préfixe sur le champ `nom`
      const candidats = enseignants.map((e) => ({
        id: e.id,
        nom: e.user.name ?? nom,
      }));
      const matches = fuzzyFind(candidats, nomComplet);
      if (matches.length > 0) enseignantId = matches[0].id;
    }

    if (!enseignantId) {
      lignes.push({
        numero: i + 2,
        action: "ERREUR",
        donnees: { enseignantNom: nom, enseignantPrenom: prenom, enseignantEmail: email, jour, heureDebut, heureFin, etablissement, matiere, periode },
        message: `Enseignant non trouvé dans SchoolPro: ${prenom} ${nom}${email ? ` (${email})` : ""}. Ajoutez-le d'abord via l'import enseignants.`,
      });
      continue;
    }

    lignes.push({
      numero: i + 2,
      action: "CREER",
      donnees: {
        enseignantNom: nom,
        enseignantPrenom: prenom || undefined,
        enseignantEmail: email || undefined,
        enseignantId,
        jour: jourNormalise,
        heureDebut,
        heureFin,
        etablissement: etablissement || undefined,
        matiere: matiere || undefined,
        periode: periode || undefined,
      },
    });
  }

  return {
    type: "edt-externes",
    empreinte: "",
    totalLignes: rows.length,
    lignesValides: lignes.filter((l) => l.action !== "ERREUR").length,
    lignesErreurs: lignes.filter((l) => l.action === "ERREUR").length,
    lignes,
    mappingColonnes: mapping,
    headers: hs,
  };
}

/// Applique un plan d'import EDT externes en créant des IndisponibiliteEnseignant.
/// Optionnellement limité à une période (trimestre) et une année scolaire.
export async function appliquerImportEdtExternes(
  plan: PlanImport<DonneesEdtExterne>,
  tenantId: string,
  opts: { periodeId?: string; anneeLibelle?: string; siteId?: string | null } = {}
): Promise<ResultatImport> {
  let crees = 0, misAJour = 0, ignores = 0, erreurs = 0;

  for (const ligne of plan.lignes) {
    try {
      if (ligne.action !== "CREER" || !ligne.donnees.enseignantId) {
        ignores++;
        continue;
      }

      // Vérifier qu'une indispo identique n'existe pas déjà (même enseignant,
      // jour, heures, période) pour éviter les doublons à la ré-import.
      // eslint-disable-next-line ecolpro/require-site-filter -- import: dédoublonnage par clé métier
      const existant = await prisma.indisponibiliteEnseignant.findFirst({
        where: {
          tenantId,
          enseignantId: ligne.donnees.enseignantId,
          jour: ligne.donnees.jour as never,
          heureDebut: ligne.donnees.heureDebut,
          heureFin: ligne.donnees.heureFin,
          ...(opts.periodeId ? { periodeId: opts.periodeId } : { periodeId: null }),
        },
      });

      if (existant) {
        ignores++;
        continue;
      }

      await prisma.indisponibiliteEnseignant.create({
        data: {
          tenantId,
          enseignantId: ligne.donnees.enseignantId,
          jour: ligne.donnees.jour as never,
          heureDebut: ligne.donnees.heureDebut,
          heureFin: ligne.donnees.heureFin,
          source: "IMPORT_EXTERNE",
          sourceLibelle: ligne.donnees.etablissement ?? null,
          periodeId: opts.periodeId ?? null,
          anneeLibelle: opts.anneeLibelle ?? null,
          siteId: opts.siteId ?? null,
        },
      });
      crees++;
    } catch {
      erreurs++;
    }
  }

  return { crees, misAJour, ignores, erreurs };
}
