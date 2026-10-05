/**
 * Série du graphique « Évolution de la maîtrise dans l'année ».
 *
 * Logique pure, isolée du composant pour être testable seule.
 *
 * Deux choix structurent le résultat :
 *
 *   1. PÉRIMÈTRE. Une preuve relève d'une compétence (donc d'une matière, via
 *      son chapitre) ou, à défaut, d'une matière seule. Mélanger toutes les
 *      matières sur une courbe compare des choses qui ne le sont pas : le
 *      périmètre est donc explicite, et le graphique dit toujours lequel il
 *      montre.
 *
 *   2. GRANULARITÉ. Une évaluation rattachée à vingt compétences produit vingt
 *      preuves le même jour. En vue globale ou par matière, on trace donc un
 *      point par JOUR (moyenne) ; en vue par compétence, où les preuves sont
 *      rares, un point par PREUVE.
 *
 * Chaque point porte une `cle` unique. Ce n'est pas un détail : le graphique
 * retrouve le point survolé par la valeur de son axe, et une clé partagée
 * (la date affichée, par exemple) lui fait renvoyer le premier point du jour
 * quel que soit celui qu'on survole.
 */

export interface MatiereRef {
  id: string;
  nom: string;
}

export interface PreuveChronologie {
  id: string;
  masterySignal: number | null;
  confidence: number;
  occurredAt: string;
  evidenceType: string;
  competence: {
    id: string;
    code: string;
    libelle: string;
    chapitre: { matiere: MatiereRef } | null;
  } | null;
  matiere: MatiereRef | null;
}

export interface FiltreChronologie {
  /** `null` : toutes les matières. */
  matiereId: string | null;
  /** `null` : toutes les compétences de la matière. */
  competenceId: string | null;
}

export type Granularite = "JOUR" | "PREUVE";

export interface PointChronologie {
  /** Unique dans la série — sert d'abscisse. */
  cle: string;
  timestamp: number;
  /** 0..100, arrondi. */
  mastery: number;
  /** 0..100, arrondi. */
  confidence: number;
  /** Nombre de preuves résumées par ce point (1 en granularité PREUVE). */
  nbPreuves: number;
  /** Matières distinctes couvertes par ce point, triées par nom. */
  matieres: string[];
  /** Renseignés seulement quand le point est une preuve unique. */
  competence: { code: string; libelle: string } | null;
  evidenceType: string | null;
}

/** Matière d'une preuve : la sienne, sinon celle du chapitre de sa compétence. */
export function matiereDePreuve(p: PreuveChronologie): MatiereRef | null {
  return p.matiere ?? p.competence?.chapitre?.matiere ?? null;
}

export function granularitePour(filtre: FiltreChronologie): Granularite {
  return filtre.competenceId ? "PREUVE" : "JOUR";
}

/** Matières présentes dans les preuves, triées par nom. */
export function matieresDisponibles(preuves: PreuveChronologie[]): MatiereRef[] {
  const parId = new Map<string, MatiereRef>();
  for (const p of preuves) {
    const m = matiereDePreuve(p);
    if (m && p.masterySignal != null) parId.set(m.id, { id: m.id, nom: m.nom });
  }
  return [...parId.values()].sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Compétences d'une matière présentes dans les preuves, triées par code. */
export function competencesDisponibles(
  preuves: PreuveChronologie[],
  matiereId: string
): { id: string; code: string; libelle: string }[] {
  const parId = new Map<string, { id: string; code: string; libelle: string }>();
  for (const p of preuves) {
    if (!p.competence || p.masterySignal == null) continue;
    if (matiereDePreuve(p)?.id !== matiereId) continue;
    parId.set(p.competence.id, {
      id: p.competence.id,
      code: p.competence.code,
      libelle: p.competence.libelle,
    });
  }
  return [...parId.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Jour civil local (AAAA-MM-JJ) : c'est celui que l'utilisateur lit sur l'axe. */
function cleJour(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const jj = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${jj}`;
}

function moyenne(valeurs: number[]): number {
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

function versPoint(cle: string, groupe: PreuveChronologie[]): PointChronologie {
  const seule = groupe.length === 1 ? groupe[0] : null;
  const matieres = new Set<string>();
  for (const p of groupe) {
    const m = matiereDePreuve(p);
    if (m) matieres.add(m.nom);
  }
  return {
    cle,
    timestamp: Math.min(...groupe.map((p) => new Date(p.occurredAt).getTime())),
    mastery: Math.round(moyenne(groupe.map((p) => p.masterySignal ?? 0)) * 100),
    confidence: Math.round(moyenne(groupe.map((p) => p.confidence)) * 100),
    nbPreuves: groupe.length,
    matieres: [...matieres].sort((a, b) => a.localeCompare(b)),
    competence: seule?.competence
      ? { code: seule.competence.code, libelle: seule.competence.libelle }
      : null,
    evidenceType: seule ? seule.evidenceType : null,
  };
}

/**
 * Construit la série à tracer, dans l'ordre chronologique.
 *
 * Les preuves sans signal de maîtrise sont écartées : elles n'ont pas
 * d'ordonnée, et les compter à zéro ferait chuter la moyenne du jour.
 */
export function construireChronologie(
  preuves: PreuveChronologie[],
  filtre: FiltreChronologie
): PointChronologie[] {
  const retenues = preuves
    .filter((p) => p.masterySignal != null)
    .filter((p) => !filtre.matiereId || matiereDePreuve(p)?.id === filtre.matiereId)
    .filter((p) => !filtre.competenceId || p.competence?.id === filtre.competenceId)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  if (granularitePour(filtre) === "PREUVE") {
    return retenues.map((p) => versPoint(p.id, [p]));
  }

  const parJour = new Map<string, PreuveChronologie[]>();
  for (const p of retenues) {
    const cle = cleJour(new Date(p.occurredAt));
    const groupe = parJour.get(cle);
    if (groupe) groupe.push(p);
    else parJour.set(cle, [p]);
  }
  return [...parJour.entries()].map(([cle, groupe]) => versPoint(cle, groupe));
}
