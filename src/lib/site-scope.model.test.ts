import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { SITE_PATHS, siteFilterForModel, type SitePath } from "@/lib/site-scope";

/**
 * Vérifie la table `SITE_PATHS` contre le schéma Prisma réel (DMMF).
 *
 * Objectif : rendre impossible la réapparition du défaut suivant — filtrer sur
 * `siteId` un modèle qui n'a pas cette colonne. Cela passait inaperçu tant que
 * le filtrage était fail-open (fragment vide), et se transformait en erreur
 * Prisma « Unknown argument » dès que les utilisateurs avaient un périmètre réel.
 *
 * Si vous ajoutez un modèle au schéma, ce test échouera jusqu'à ce que son
 * chemin d'accès au site soit déclaré.
 */

type Field = { name: string; kind: string; type: string; isList: boolean };
const models = new Map<string, Field[]>();
for (const m of Prisma.dmmf.datamodel.models) {
  models.set(m.name, m.fields as unknown as Field[]);
}

/** nom de délégué Prisma (camelCase) → nom de modèle */
function modelNameFor(delegate: string): string | undefined {
  for (const name of models.keys()) {
    if (name[0].toLowerCase() + name.slice(1) === delegate) return name;
  }
  return undefined;
}

function hasSiteIdColumn(modelName: string): boolean {
  return (models.get(modelName) ?? []).some((f) => f.name === "siteId");
}

function relation(modelName: string, field: string): Field | undefined {
  return (models.get(modelName) ?? []).find((f) => f.name === field && f.kind === "object");
}

describe("SITE_PATHS — cohérence avec le schéma Prisma", () => {
  it("ne déclare que des modèles existants", () => {
    const unknown = Object.keys(SITE_PATHS).filter((d) => !modelNameFor(d));
    expect(unknown, `délégués inconnus du schéma : ${unknown.join(", ")}`).toEqual([]);
  });

  it("couvre TOUS les modèles du schéma", () => {
    const declared = new Set(Object.keys(SITE_PATHS));
    const missing = [...models.keys()]
      .map((n) => n[0].toLowerCase() + n.slice(1))
      .filter((d) => !declared.has(d));
    expect(
      missing,
      `modèles sans chemin de site déclaré : ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("déclare `column` exactement pour les modèles portant siteId", () => {
    const wrong: string[] = [];
    for (const [delegate, path] of Object.entries(SITE_PATHS)) {
      const name = modelNameFor(delegate);
      if (!name) continue;
      const hasColumn = hasSiteIdColumn(name);
      if (hasColumn && path !== "column") {
        wrong.push(`${name} porte siteId mais est déclaré ${JSON.stringify(path)}`);
      }
      if (!hasColumn && path === "column") {
        wrong.push(`${name} ne porte PAS siteId mais est déclaré "column"`);
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("n'emprunte que des relations réellement présentes, et du bon type", () => {
    const wrong: string[] = [];
    for (const [delegate, path] of Object.entries(SITE_PATHS)) {
      const name = modelNameFor(delegate);
      if (!name || typeof path === "string") continue;

      // { chain } parcourt plusieurs sauts à-un successifs : chacun doit être
      // une relation réelle et non une liste (une liste appellerait { many }).
      const fields = "chain" in path ? path.chain : [("one" in path ? path.one : path.many)];
      let current = name;
      for (const field of fields) {
        const rel = relation(current, field);
        if (!rel) {
          wrong.push(`${current}.${field} n'existe pas (ou n'est pas une relation)`);
          break;
        }
        if (("one" in path || "chain" in path) && rel.isList) {
          wrong.push(`${current}.${field} est une liste : { one }/{ chain } ne supportent que des relations à-un`);
        }
        if ("many" in path && !rel.isList) {
          wrong.push(`${current}.${field} n'est pas une liste : utiliser { one } et non { many }`);
        }
        current = rel.type;
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("aboutit toujours à un modèle portant siteId", () => {
    const wrong: string[] = [];
    for (const [delegate, path] of Object.entries(SITE_PATHS)) {
      const name = modelNameFor(delegate);
      if (!name || typeof path === "string") continue;

      if ("chain" in path) {
        // { chain } doit résoudre en entier vers une colonne siteId réelle —
        // c'est précisément ce que siteFilterForModel suppose au runtime,
        // sans re-résolution récursive via SITE_PATHS.
        let current = name;
        let ok = true;
        for (const field of path.chain) {
          const rel = relation(current, field);
          if (!rel) { ok = false; break; }
          current = rel.type;
        }
        if (!ok || !hasSiteIdColumn(current)) {
          wrong.push(`${name}.${path.chain.join(".")} → ${current} qui ne porte pas siteId`);
        }
        continue;
      }

      const field = "one" in path ? path.one : path.many;
      const rel = relation(name, field);
      if (!rel) continue; // déjà signalé par le test précédent

      // Le modèle cible doit soit porter siteId, soit être lui-même rattaché
      // via { chain } (un { one }/{ many } imbriqué n'est PAS résolu par
      // siteFilterForModel — seul { chain } compose plusieurs sauts).
      if (!hasSiteIdColumn(rel.type)) {
        const targetDelegate = rel.type[0].toLowerCase() + rel.type.slice(1);
        const targetPath: SitePath | undefined = SITE_PATHS[targetDelegate];
        const chained = targetPath && typeof targetPath === "object" && "chain" in targetPath;
        if (!chained) {
          wrong.push(
            `${name}.${field} → ${rel.type} qui ne porte pas siteId et n'est pas déclaré via { chain }`
          );
        }
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });
});

describe("siteFilterForModel", () => {
  const scoped = { role: "TEACHER", siteId: null, siteIds: ["s1"] };

  // Pour un modèle métier, `siteId: null` signifie « non assigné », et non
  // « partagé » : ces enregistrements ne doivent PAS remonter à un compte
  // site-scopé. Seuls les modèles de référence listés dans
  // `SHARED_NULL_MODELS` (matière, structure, tarif…) font exception — voir
  // le test « filtre les matières par site » plus bas.
  it("filtre sur la colonne sans laisser passer les enregistrements non assignés", () => {
    expect(siteFilterForModel("eleve", scoped)).toEqual({
      AND: [{ siteId: { in: ["s1"] } }],
    });
  });

  // Régression directe : c'est ici que la 500 se produisait.
  it("filtre via la relation pour un modèle sans colonne siteId", () => {
    expect(siteFilterForModel("incident", scoped)).toEqual({
      AND: [{ eleve: { siteId: { in: ["s1"] } } }],
    });
    expect(siteFilterForModel("note", scoped)).toEqual({
      AND: [{ eleve: { siteId: { in: ["s1"] } } }],
    });
    expect(siteFilterForModel("paiement", scoped)).toEqual({
      AND: [{ facture: { siteId: { in: ["s1"] } } }],
    });
  });

  // Régression : ficheRH/bulletinPaie/absencePersonnel/congePersonnel/sanction/
  // bulletinMatiere n'ont pas de siteId propre — { one } aurait produit un
  // "Unknown argument siteId" Prisma dès qu'un rôle site-scopé (non
  // TENANT_ADMIN/PRINCIPAL) touchait ces modèles. { chain } compose plusieurs
  // sauts jusqu'à une colonne siteId réelle.
  it("filtre via une chaîne de relations pour un modèle à deux sauts ou plus d'une colonne siteId", () => {
    expect(siteFilterForModel("ficheRH", scoped)).toEqual({
      AND: [{ enseignant: { user: { siteId: { in: ["s1"] } } } }],
    });
    expect(siteFilterForModel("bulletinPaie", scoped)).toEqual({
      AND: [{ ficheRH: { enseignant: { user: { siteId: { in: ["s1"] } } } } }],
    });
    expect(siteFilterForModel("absencePersonnel", scoped)).toEqual({
      AND: [{ enseignant: { user: { siteId: { in: ["s1"] } } } }],
    });
    expect(siteFilterForModel("congePersonnel", scoped)).toEqual({
      AND: [{ enseignant: { user: { siteId: { in: ["s1"] } } } }],
    });
    expect(siteFilterForModel("sanction", scoped)).toEqual({
      AND: [{ incident: { eleve: { siteId: { in: ["s1"] } } } }],
    });
    expect(siteFilterForModel("bulletinMatiere", scoped)).toEqual({
      AND: [{ bulletin: { eleve: { siteId: { in: ["s1"] } } } }],
    });
  });

  // Une conversation sans site est un échange personnel, pas une donnée
  // orpheline : elle doit rester visible d'un compte site-scopé.
  it("laisse passer les conversations hors site", () => {
    expect(siteFilterForModel("conversation", scoped)).toEqual({
      AND: [{ OR: [{ siteId: { in: ["s1"] } }, { siteId: null }] }],
    });
    expect(siteFilterForModel("message", scoped)).toEqual({
      AND: [{ conversation: { siteId: { in: ["s1"] } } }],
    });
  });

  it("ne filtre pas les données de référence partagées", () => {
    expect(siteFilterForModel("periode", scoped)).toEqual({});
    expect(siteFilterForModel("anneesScolaires", scoped)).toEqual({});
  });

  it("filtre les matières par site (elles portent siteId)", () => {
    expect(siteFilterForModel("matiere", scoped)).toEqual({
      AND: [{ OR: [{ siteId: { in: ["s1"] } }, { siteId: null }] }],
    });
  });

  it("gère une relation vers-plusieurs", () => {
    expect(siteFilterForModel("enseignant", scoped)).toEqual({
      AND: [
        {
          OR: [
            { sites: { some: { siteId: { in: ["s1"] } } } },
            { sites: { none: {} } },
          ],
        },
      ],
    });
  });

  it("reste fail-closed pour un modèle inconnu", () => {
    expect(siteFilterForModel("modeleInexistant", scoped)).toHaveProperty("AND");
  });

  it("ne filtre rien pour un accès tenant complet", () => {
    expect(siteFilterForModel("note", { role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toEqual({});
  });
});
