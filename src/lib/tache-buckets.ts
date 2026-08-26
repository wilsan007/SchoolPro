/**
 * Bucketing temporel des tâches.
 *
 * Classifie une tâche en fonction de son échéance par rapport à "maintenant"
 * (qui peut être la date simulée par la Time Machine).
 *
 * Les buckets sont mutuellement exclusifs et couvrent tout l'horizon :
 *   EN_RETARD        — échéance dépassée, tâche non terminée
 *   AUJOURDHUI       — échéance = aujourd'hui
 *   SEMAINE          — échéance entre demain et la fin de cette semaine (dimanche)
 *   SEMAINE_PROCHAINE — échéance dans la semaine suivante (lundi→dimanche)
 *   PLUS_TARD        — au-delà de la semaine prochaine
 *   SANS_ECHEANCE    — pas d'échéance définie
 */

export type BucketTache =
  | "EN_RETARD"
  | "AUJOURDHUI"
  | "SEMAINE"
  | "SEMAINE_PROCHAINE"
  | "PLUS_TARD"
  | "SANS_ECHEANCE";

export const BUCKET_ORDER: BucketTache[] = [
  "EN_RETARD",
  "AUJOURDHUI",
  "SEMAINE",
  "SEMAINE_PROCHAINE",
  "PLUS_TARD",
  "SANS_ECHEANCE",
];

/** Couleurs sémantiques par bucket (pour les badges et en-têtes). */
export const BUCKET_COLORS: Record<
  BucketTache,
  { border: string; bg: string; text: string; dot: string; label: string }
> = {
  EN_RETARD: {
    border: "border-l-red-500",
    bg: "bg-red-500/5",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    label: "En retard",
  },
  AUJOURDHUI: {
    border: "border-l-orange-500",
    bg: "bg-orange-500/5",
    text: "text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
    label: "Aujourd'hui",
  },
  SEMAINE: {
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    label: "Cette semaine",
  },
  SEMAINE_PROCHAINE: {
    border: "border-l-sky-500",
    bg: "bg-sky-500/5",
    text: "text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
    label: "Semaine prochaine",
  },
  PLUS_TARD: {
    border: "border-l-slate-400",
    bg: "bg-slate-400/5",
    text: "text-slate-600 dark:text-slate-400",
    dot: "bg-slate-400",
    label: "Plus tard",
  },
  SANS_ECHEANCE: {
    border: "border-l-slate-300",
    bg: "bg-slate-300/5",
    text: "text-slate-500 dark:text-slate-500",
    dot: "bg-slate-300",
    label: "Sans échéance",
  },
};

/** Retourne le lundi de la semaine contenant `date` (à 00:00:00). */
function lundiDe(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const jour = d.getDay(); // 0 = dimanche
  const delta = jour === 0 ? 6 : jour - 1;
  d.setDate(d.getDate() - delta);
  return d;
}

/** Retourne le dimanche de la semaine contenant `date` (à 23:59:59.999). */
function dimancheDe(date: Date): Date {
  const lundi = lundiDe(date);
  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);
  dimanche.setHours(23, 59, 59, 999);
  return dimanche;
}

/**
 * Classifie une tâche dans un bucket temporel.
 *
 * @param echeance ISO string ou Date ou null
 * @param statut statut de la tâche (les FAIT/ANNULE ne sont jamais "en retard")
 * @param maintenant date de référence (Time Machine-aware)
 */
export function bucketPour(
  echeance: string | Date | null,
  statut: string,
  maintenant: Date
): BucketTache {
  // Les tâches terminées ou annulées ne sont jamais "en retard".
  if (statut === "FAIT" || statut === "ANNULE") {
    if (!echeance) return "SANS_ECHEANCE";
    const e = typeof echeance === "string" ? new Date(echeance) : echeance;
    return bucketFuture(e, maintenant);
  }

  if (!echeance) return "SANS_ECHEANCE";

  const e = typeof echeance === "string" ? new Date(echeance) : echeance;
  const now = new Date(maintenant);
  now.setHours(0, 0, 0, 0);

  const echeanceJ = new Date(e);
  echeanceJ.setHours(0, 0, 0, 0);

  // En retard : échéance strictement avant aujourd'hui.
  if (echeanceJ < now) return "EN_RETARD";

  // Aujourd'hui : même jour.
  if (echeanceJ.getTime() === now.getTime()) return "AUJOURDHUI";

  return bucketFuture(e, maintenant);
}

function bucketFuture(echeance: Date, maintenant: Date): BucketTache {
  const now = new Date(maintenant);
  now.setHours(0, 0, 0, 0);

  const finCetteSemaine = dimancheDe(maintenant);
  const lundiProchaine = new Date(finCetteSemaine);
  lundiProchaine.setDate(finCetteSemaine.getDate() + 1);
  lundiProchaine.setHours(0, 0, 0, 0);

  const finSemaineProchaine = dimancheDe(lundiProchaine);

  if (echeance <= finCetteSemaine) return "SEMAINE";
  if (echeance <= finSemaineProchaine) return "SEMAINE_PROCHAINE";
  return "PLUS_TARD";
}

/**
 * Groupe une liste de tâches par bucket temporel.
 * Retourne un objet { bucket: tâches[] } dans l'ordre de BUCKET_ORDER.
 */
export function grouperParBucket<T extends { echeance: string | Date | null; statut: string }>(
  taches: T[],
  maintenant: Date
): Record<BucketTache, T[]> {
  const groupes: Record<BucketTache, T[]> = {
    EN_RETARD: [],
    AUJOURDHUI: [],
    SEMAINE: [],
    SEMAINE_PROCHAINE: [],
    PLUS_TARD: [],
    SANS_ECHEANCE: [],
  };

  for (const t of taches) {
    const bucket = bucketPour(t.echeance, t.statut, maintenant);
    groupes[bucket].push(t);
  }

  return groupes;
}
