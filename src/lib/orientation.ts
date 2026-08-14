export type FiliereSlug =
  | "SCIENTIFIQUE"
  | "LITTERAIRE"
  | "ECONOMIQUE"
  | "TECHNOLOGIQUE"
  | "AUTRES";

export interface FiliereConfig {
  key: FiliereSlug;
  label: string;
  color: string;
  emoji: string;
  keywords: string[];
}

export const FILIERES: FiliereConfig[] = [
  {
    key: "SCIENTIFIQUE",
    label: "Filière scientifique",
    color: "bg-blue-500",
    emoji: "🔬",
    keywords: [
      "math", "mathe", "algèbre", "géométrie", "physique", "chimie", "svt",
      "sciences", "biologie", "science de la vie", "sciences de la vie",
      "sciences physiques", "physique-chimie", "physique chimie",
    ],
  },
  {
    key: "LITTERAIRE",
    label: "Filière littéraire",
    color: "bg-purple-500",
    emoji: "📚",
    keywords: [
      "français", "francais", "littérature", "litterature", "philosophie",
      "histoire", "géographie", "geographie", "histoire-géo", "histoire-geo",
      "anglais", "espagnol", "allemand", "arabe", "langue", "langues",
      "lettres", "arts du langage",
    ],
  },
  {
    key: "ECONOMIQUE",
    label: "Filière économique",
    color: "bg-emerald-500",
    emoji: "📊",
    keywords: [
      "ses", "économie", "economie", "sciences économiques", "sciences economiques",
      "gestion", "comptabilité", "comptabilite", "finance", "marketing",
      "maths appliquées", "mathematiques appliquées", "mathématiques appliquées",
    ],
  },
  {
    key: "TECHNOLOGIQUE",
    label: "Filière technologique",
    color: "bg-amber-500",
    emoji: "⚙️",
    keywords: [
      "technologie", "techno", "sti", "st2s", "stl", "sti2d", "sin",
      "informatique", "nsi", "programmation", "réseaux", "reseaux",
      "ingénierie", "genie", "génie", "arts appliqués", "arts appliques",
      "bâtiment", "batiment", "menuiserie", "électricité", "electricite",
    ],
  },
  {
    key: "AUTRES",
    label: "Autres filières",
    color: "bg-slate-500",
    emoji: "🎨",
    keywords: [
      "sport", "eps", "musique", "arts", "arts plastiques", "théâtre",
      "theatre", "cinéma", "cinema", "danse", "hotellerie", "hôtellerie",
      "tourisme", "santé", "sante", "social", "agronomie",
    ],
  },
];

export interface NoteAvecMatiere {
  valeur: number;
  noteMax: number;
  coefficient: number;
  matiere: { nom: string };
}

export interface ScoreFiliere {
  key: FiliereSlug;
  label: string;
  color: string;
  emoji: string;
  percent: number;
  weightedAverage: number;
  matchedCount: number;
  details: { matiere: string; noteSur20: number; coefficient: number }[];
}

function normalize20(valeur: number, noteMax: number): number {
  if (!noteMax || noteMax <= 0) return 0;
  return (valeur / noteMax) * 20;
}

function matchMatiere(nomMatiere: string, filiere: FiliereConfig): boolean {
  const normalized = nomMatiere
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return filiere.keywords.some((kw) =>
    kw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(" ")
      .every((part) => normalized.includes(part))
  );
}

export function computeFiliereScores(notes: NoteAvecMatiere[]): ScoreFiliere[] {
  const byFiliere: Record<FiliereSlug, { sum: number; totalCoef: number; count: number; details: { matiere: string; noteSur20: number; coefficient: number }[] }> =
    {} as any;

  for (const filiere of FILIERES) {
    byFiliere[filiere.key] = { sum: 0, totalCoef: 0, count: 0, details: [] };
  }

  for (const note of notes) {
    const nom = note.matiere.nom ?? "";
    const noteSur20 = normalize20(note.valeur, note.noteMax);
    const coef = note.coefficient || 1;
    for (const filiere of FILIERES) {
      if (matchMatiere(nom, filiere)) {
        byFiliere[filiere.key].sum += noteSur20 * coef;
        byFiliere[filiere.key].totalCoef += coef;
        byFiliere[filiere.key].count += 1;
        byFiliere[filiere.key].details.push({
          matiere: nom,
          noteSur20,
          coefficient: coef,
        });
      }
    }
  }

  return FILIERES.map((filiere) => {
    const entry = byFiliere[filiere.key];
    const weightedAverage = entry.totalCoef > 0 ? entry.sum / entry.totalCoef : 0;
    // Plus il y a de matières pertinentes, plus le score est fiable ;
    // on pénalise légèrement si moins de 2 matières correspondent.
    const relevanceBonus = Math.min(entry.count, 5) / 10; // 0 -> 0.5 max
    let percent = (weightedAverage / 20) * 100;
    if (entry.count === 0) percent = 0;
    else if (entry.count < 2) percent = percent * 0.85;
    else percent = Math.min(100, percent + relevanceBonus * 5);

    return {
      key: filiere.key,
      label: filiere.label,
      color: filiere.color,
      emoji: filiere.emoji,
      percent: Math.round(percent),
      weightedAverage: Number(weightedAverage.toFixed(2)),
      matchedCount: entry.count,
      details: entry.details,
    };
  }).sort((a, b) => b.percent - a.percent);
}

export function getRecommendedFiliere(scores: ScoreFiliere[]): ScoreFiliere | null {
  return scores.length > 0 ? scores[0] : null;
}
