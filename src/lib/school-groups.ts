export type SchoolGroup = "Maternelle" | "Primaire" | "Collège" | "Lycée" | "Autre";

export const SCHOOL_GROUP_ORDER: SchoolGroup[] = ["Maternelle", "Primaire", "Collège", "Lycée", "Autre"];

export const SCHOOL_GROUP_ICONS: Record<SchoolGroup, string> = {
  Maternelle: "🧸",
  Primaire: "🧒",
  Collège: "📘",
  Lycée: "🎓",
  Autre: "📋",
};

const MATERNELLE = -1;

const FRENCH_NIVEAU_TO_YEAR: Record<string, number> = {
  ci: 0, cp: 1,
  ce1: 2, ce2: 3, cm1: 4, cm2: 5,
  "6ème": 6, "6eme": 6, "6e": 6,
  "5ème": 7, "5eme": 7, "5e": 7,
  "4ème": 8, "4eme": 8, "4e": 8,
  "3ème": 9, "3eme": 9, "3e": 9,
  seconde: 10, "2nde": 10, "2nd": 10,
  "première": 11, "premiere": 11, "1ère": 11, "1ere": 11,
  terminale: 12, term: 12,
  // Maternelle : hors numérotation (0 est déjà pris par le CI).
  maternelle: MATERNELLE, garderie: MATERNELLE, garderies: MATERNELLE,
  "petite section": MATERNELLE, "moyenne section": MATERNELLE, "grande section": MATERNELLE,
  ps: MATERNELLE, ms: MATERNELLE, gs: MATERNELLE,
};

// La structure pédagogique enregistrée en base (`Classe.structure.type`) fait
// foi : c'est l'établissement qui a rangé la classe dans un cycle. Le nom et le
// niveau ne servent qu'aux classes sans structure.
const STRUCTURE_TYPE_TO_GROUP: Record<string, SchoolGroup> = {
  MATERNELLE: "Maternelle",
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
};

function yearToGroup(year: number): SchoolGroup {
  if (year === MATERNELLE) return "Maternelle";
  if (year >= 0 && year <= 5) return "Primaire"; // 0 = CI
  if (year >= 6 && year <= 9) return "Collège";
  if (year >= 10 && year <= 12) return "Lycée";
  return "Autre";
}

export function getSchoolGroup(niveau: string, nom?: string, structureType?: string | null): SchoolGroup {
  const fromStructure = structureType ? STRUCTURE_TYPE_TO_GROUP[structureType] : undefined;
  if (fromStructure) return fromStructure;

  const text = `${niveau} ${nom ?? ""}`.toLowerCase().trim();

  const yearWithAnnee = text.match(/(\d+)\s*(?:ème|e)?\s*(?:année|an|year|ann[eé]e)/);
  if (yearWithAnnee) {
    const year = parseInt(yearWithAnnee[1]);
    return yearToGroup(year);
  }

  for (const [key, year] of Object.entries(FRENCH_NIVEAU_TO_YEAR)) {
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(text)) {
      return yearToGroup(year);
    }
  }

  const numMatch = text.match(/\b(\d+)\b/);
  if (numMatch) {
    return yearToGroup(parseInt(numMatch[1]));
  }

  return "Autre";
}

export interface GroupedClasses<T> {
  group: SchoolGroup;
  classes: { classe: string; items: T[] }[];
}

export function groupBySchoolLevel<
  T extends { classe?: { nom: string; niveau: string; structure?: { type: string } | null } | null }
>(
  items: T[]
): GroupedClasses<T>[] {
  const groupMap = new Map<SchoolGroup, Map<string, T[]>>();

  for (const item of items) {
    const classeNom = item.classe?.nom ?? "Sans classe";
    const niveau = item.classe?.niveau ?? "";
    const group = item.classe ? getSchoolGroup(niveau, classeNom, item.classe.structure?.type) : "Autre";

    if (!groupMap.has(group)) groupMap.set(group, new Map());
    const classMap = groupMap.get(group)!;
    if (!classMap.has(classeNom)) classMap.set(classeNom, []);
    classMap.get(classeNom)!.push(item);
  }

  return SCHOOL_GROUP_ORDER.map((group) => {
    const classMap = groupMap.get(group);
    if (!classMap) return { group, classes: [] };
    return {
      group,
      classes: Array.from(classMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([classe, items]) => ({ classe, items })),
    };
  }).filter((g) => g.classes.length > 0);
}
