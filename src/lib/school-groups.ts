export type SchoolGroup = "Primaire" | "Collège" | "Lycée" | "Autre";

export const SCHOOL_GROUP_ORDER: SchoolGroup[] = ["Primaire", "Collège", "Lycée", "Autre"];

export const SCHOOL_GROUP_ICONS: Record<SchoolGroup, string> = {
  Primaire: "🧒",
  Collège: "📘",
  Lycée: "🎓",
  Autre: "📋",
};

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
};

function yearToGroup(year: number): SchoolGroup {
  if (year >= 0 && year <= 5) return "Primaire"; // 0 = CI
  if (year >= 6 && year <= 9) return "Collège";
  if (year >= 10 && year <= 12) return "Lycée";
  return "Autre";
}

export function getSchoolGroup(niveau: string, nom?: string): SchoolGroup {
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

export function groupBySchoolLevel<T extends { classe?: { nom: string; niveau: string } | null }>(
  items: T[]
): GroupedClasses<T>[] {
  const groupMap = new Map<SchoolGroup, Map<string, T[]>>();

  for (const item of items) {
    const classeNom = item.classe?.nom ?? "Sans classe";
    const niveau = item.classe?.niveau ?? "";
    const group = item.classe ? getSchoolGroup(niveau, classeNom) : "Autre";

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
