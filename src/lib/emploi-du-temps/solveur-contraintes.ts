/**
 * EcolPro — Moteur d'Optimisation des Contraintes Horaires
 * ============================================================
 *
 * Algorithme de détection anticipée des impasses dans la construction
 * d'un emploi du temps :
 * - Enseignant avec 2 cours prévus en même temps
 * - Salle occupée au-delà de sa jauge
 * - Conflits de matière (ex: 2 maths en parallèle pour la même classe)
 *
 * S'appuie sur le moteur de scoring existant `src/lib/emploi-du-temps/suggest.ts`
 * mais ajoute une détection proactive des impasses avant qu'elles ne se produisent.
 */

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ============================================================
// TYPES
// ============================================================

export type TypeConflit =
  | "ENSEIGNANT_DOUBLE_BOOKED"
  | "SALLE_OCCUPEE"
  | "CLASSE_DOUBLE_BOOKED"
  | "JAUGE_SALLE_DEPASSEE"
  | "MATIERE_DOUBLE";

export interface ConflitEdt {
  type: TypeConflit;
  severite: "BLOQUANT" | "AVERTISSEMENT";
  jour: string;
  heureDebut: string;
  heureFin: string;
  seanceIds: string[];
  description: string;
  enseignantId?: string;
  enseignantNom?: string;
  classeId?: string;
  classeNom?: string;
  salleNom?: string;
}

export interface ResultatVerification {
  conflits: ConflitEdt[];
  conflitsBloquants: number;
  avertissements: number;
  estValide: boolean;
}

export interface ContrainteEdt {
  seanceId: string;
  enseignantId: string;
  enseignantNom: string;
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
  salleNom?: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  effectifClasse: number;
  capaciteSalle?: number;
}

// ============================================================
// DÉTECTION DES CONFLITS
// ============================================================

/**
 * Vérifie l'EDT d'un tenant pour détecter les conflits.
 */
export async function verifierEdt(
  tenantId: string,
  anneeLibelle?: string
): Promise<ResultatVerification> {
  const annee = anneeLibelle ?? (await getAnneeCouranteLibelle(tenantId));

  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const seances = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      ...(annee ? { annee } : {}),
    },
    include: {
      enseignant: { include: { user: { select: { name: true } } } },
      classe: { select: { id: true, nom: true, _count: { select: { eleves: true } } } },
      matiere: { select: { id: true, nom: true } },
    },
  });

  // Récupérer les salles séparément (salle est un String sur EmploiTemps, pas une relation)
  const salleNoms = [...new Set(seances.map((s) => s.salle).filter(Boolean))] as string[];
  const salles = salleNoms.length > 0
    // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
    ? await prisma.salle.findMany({
        where: { tenantId, nom: { in: salleNoms } },
        select: { nom: true, capacite: true },
      })
    : [];

  const salleMap = new Map(salles.map((s) => [s.nom, s]));

  const contraintes: ContrainteEdt[] = seances.map((s) => {
    const salle = s.salle ? salleMap.get(s.salle) : undefined;
    return {
      seanceId: s.id,
      enseignantId: s.enseignantId ?? "",
      enseignantNom: s.enseignant?.user?.name ?? "N/A",
      classeId: s.classeId,
      classeNom: s.classe?.nom ?? "N/A",
      matiereId: s.matiereId,
      matiereNom: s.matiere?.nom ?? "N/A",
      salleNom: s.salle ?? undefined,
      jour: s.jour,
      heureDebut: s.heureDebut,
      heureFin: s.heureFin,
      effectifClasse: s.classe?._count.eleves ?? 0,
      capaciteSalle: salle?.capacite,
    };
  });

  return detecterConflits(contraintes);
}

/**
 * Détecte les conflits dans un ensemble de contraintes d'EDT.
 */
export function detecterConflits(contraintes: ContrainteEdt[]): ResultatVerification {
  const conflits: ConflitEdt[] = [];

  // Grouper par jour + créneau horaire
  const groupes = new Map<string, ContrainteEdt[]>();
  for (const c of contraintes) {
    const key = `${c.jour}|${c.heureDebut}|${c.heureFin}`;
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key)!.push(c);
  }

  for (const [key, seances] of groupes) {
    const [jour, heureDebut, heureFin] = key.split("|");

    // 1. Enseignant double-booked
    const parEnseignant = new Map<string, ContrainteEdt[]>();
    for (const s of seances) {
      if (!s.enseignantId) continue;
      if (!parEnseignant.has(s.enseignantId)) parEnseignant.set(s.enseignantId, []);
      parEnseignant.get(s.enseignantId)!.push(s);
    }

    for (const [ensId, ensSeances] of parEnseignant) {
      if (ensSeances.length > 1) {
        const chevauchantes = detecterChevauchement(ensSeances);
        if (chevauchantes.length > 0) {
          conflits.push({
            type: "ENSEIGNANT_DOUBLE_BOOKED",
            severite: "BLOQUANT",
            jour,
            heureDebut,
            heureFin,
            seanceIds: chevauchantes.map((s) => s.seanceId),
            description: `L'enseignant ${chevauchantes[0].enseignantNom} a ${chevauchantes.length} cours en même temps`,
            enseignantId: ensId,
            enseignantNom: chevauchantes[0].enseignantNom,
          });
        }
      }
    }

    // 2. Classe double-booked
    const parClasse = new Map<string, ContrainteEdt[]>();
    for (const s of seances) {
      if (!parClasse.has(s.classeId)) parClasse.set(s.classeId, []);
      parClasse.get(s.classeId)!.push(s);
    }

    for (const [classeId, classeSeances] of parClasse) {
      if (classeSeances.length > 1) {
        const chevauchantes = detecterChevauchement(classeSeances);
        if (chevauchantes.length > 0) {
          conflits.push({
            type: "CLASSE_DOUBLE_BOOKED",
            severite: "BLOQUANT",
            jour,
            heureDebut,
            heureFin,
            seanceIds: chevauchantes.map((s) => s.seanceId),
            description: `La classe ${chevauchantes[0].classeNom} a ${chevauchantes.length} cours en même temps`,
            classeId,
            classeNom: chevauchantes[0].classeNom,
          });
        }
      }
    }

    // 3. Salle occupée / jauge dépassée
    const parSalle = new Map<string, ContrainteEdt[]>();
    for (const s of seances) {
      if (s.salleNom) {
        if (!parSalle.has(s.salleNom)) parSalle.set(s.salleNom, []);
        parSalle.get(s.salleNom)!.push(s);
      }
    }

    for (const [salleNom, salleSeances] of parSalle) {
      if (salleSeances.length > 1) {
        const chevauchantes = detecterChevauchement(salleSeances);
        if (chevauchantes.length > 0) {
          conflits.push({
            type: "SALLE_OCCUPEE",
            severite: "BLOQUANT",
            jour,
            heureDebut,
            heureFin,
            seanceIds: chevauchantes.map((s) => s.seanceId),
            description: `La salle ${chevauchantes[0].salleNom} est occupée par ${chevauchantes.length} cours en même temps`,
            salleNom,
          });
        }
      }

      // Vérifier la jauge
      for (const s of salleSeances) {
        if (s.capaciteSalle && s.effectifClasse > s.capaciteSalle) {
          conflits.push({
            type: "JAUGE_SALLE_DEPASSEE",
            severite: "AVERTISSEMENT",
            jour,
            heureDebut,
            heureFin,
            seanceIds: [s.seanceId],
            description: `La salle ${s.salleNom} (capacité ${s.capaciteSalle}) ne peut pas accueillir la classe ${s.classeNom} (${s.effectifClasse} élèves)`,
            classeId: s.classeId,
            classeNom: s.classeNom,
            salleNom,
          });
        }
      }
    }
  }

  const conflitsBloquants = conflits.filter((c) => c.severite === "BLOQUANT").length;
  const avertissements = conflits.filter((c) => c.severite === "AVERTISSEMENT").length;

  return {
    conflits,
    conflitsBloquants,
    avertissements,
    estValide: conflitsBloquants === 0,
  };
}

// ============================================================
// SUGGESTION DE CORRECTION
// ============================================================

export function proposerCorrections(
  conflit: ConflitEdt,
  creneauxDisponibles: { jour: string; heureDebut: string; heureFin: string }[]
): { jour: string; heureDebut: string; heureFin: string }[] {
  return creneauxDisponibles.filter(
    (c) => !(c.jour === conflit.jour && c.heureDebut === conflit.heureDebut)
  );
}

// ============================================================
// UTILITAIRES
// ============================================================

function detecterChevauchement(seances: ContrainteEdt[]): ContrainteEdt[] {
  const sorted = [...seances].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].heureFin > sorted[i + 1].heureDebut) {
      return [sorted[i], sorted[i + 1]];
    }
  }

  return [];
}
