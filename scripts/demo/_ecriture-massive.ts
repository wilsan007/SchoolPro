/**
 * Écriture en masse pour les scripts de démonstration.
 *
 * POURQUOI PAS `prisma.createMany`
 * Le client Prisma passe par le pooler Supabase en mode transaction. Sur des
 * séries longues (dizaines de milliers de lignes), la connexion est fermée par
 * le pooler pendant que le client l'attend encore : le processus reste vivant,
 * à zéro pour cent de processeur, sans écrire ni lever d'erreur. Observé
 * plusieurs fois pendant la préparation de la démonstration, toujours au même
 * endroit — les preuves d'apprentissage LEARNOS.
 *
 * Le pilote `pg`, lui, ouvre une connexion par lot, écrit, puis la ferme. Une
 * connexion morte devient une erreur immédiate, donc une reprise, au lieu d'une
 * attente sans fin. C'est déjà le choix fait par `load-sql-pg.cjs` pour charger
 * le jeu de données initial.
 *
 * Les lectures restent sous Prisma : elles sont courtes et typées.
 */

import { Client } from "pg";

/** Une ligne à écrire : les clés sont les noms de colonnes, tels quels. */
export type Ligne = Record<string, unknown>;

function valeurSql(v: unknown): unknown {
  if (v === undefined) return null;
  // `jsonb` attend une chaîne JSON ; un tableau de texte (`text[]`) est passé
  // tel quel, le pilote sait l'encoder.
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return v;
}

/**
 * Insère `lignes` dans `table`, en ignorant les doublons.
 *
 * @param table    nom physique de la table (ex. `learnos_learning_evidences`)
 * @param colonnes colonnes écrites, dans l'ordre ; chaque ligne doit les porter
 * @param lignes   les données
 * @param options  `parLot` : nombre de lignes par instruction (défaut 300)
 */
export async function insererEnMasse(
  table: string,
  colonnes: string[],
  lignes: Ligne[],
  options: { parLot?: number; libelle?: string; sec?: boolean; prefixeId?: string } = {},
): Promise<number> {
  if (lignes.length === 0) return 0;
  // 800 lignes par instruction : l'ouverture d'une connexion coûte environ
  // deux secondes contre l'écoute du pooler, soit plus que l'insertion
  // elle-même. Des lots plus gros amortissent ce coût ; au-delà, on
  // s'approche de la limite de 65 535 paramètres par requête.
  const parLot = options.parLot ?? 800;
  const libelle = options.libelle ?? table;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absente");

  const listeColonnes = colonnes.map((c) => `"${c}"`).join(", ");

  // Une exécution interrompue — coupure du pooler, base saturée — laisse une
  // étape à moitié faite. Plutôt que de tout réécrire au coup suivant, on
  // compte ce qui porte déjà le préfixe d'identifiant de cette étape : si le
  // compte y est, on passe. C'est ce qui rend ces scripts rejouables sans
  // qu'une reprise coûte aussi cher que la première fois.
  if (options.prefixeId) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 20_000, query_timeout: 120_000 });
    try {
      await client.connect();
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "id" LIKE $1`,
        [`${options.prefixeId}%`],
      );
      if ((rows[0]?.n ?? 0) >= lignes.length) {
        console.log(`${libelle} : déjà écrit (${rows[0].n} ligne(s)) — étape passée`);
        return 0;
      }
    } catch {
      // Le contrôle est un confort, pas une condition : en cas d'échec on
      // écrit, les doublons étant de toute façon ignorés.
    } finally {
      await client.end().catch(() => {});
    }
  }

  let ecrites = 0;

  for (let i = 0; i < lignes.length; i += parLot) {
    const lot = lignes.slice(i, i + parLot);

    const valeurs: unknown[] = [];
    const tuples = lot.map((ligne, rang) => {
      const marqueurs = colonnes.map((col, j) => {
        valeurs.push(valeurSql(ligne[col]));
        return `$${rang * colonnes.length + j + 1}`;
      });
      return `(${marqueurs.join(", ")})`;
    });
    const instruction = `INSERT INTO "${table}" (${listeColonnes}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING`;

    // Une connexion par lot : l'échec d'une connexion reste local au lot au
    // lieu d'emporter tout le script. Trois tentatives, car le pooler ferme
    // parfois une connexion sans prévenir — et, les doublons étant ignorés,
    // rejouer un lot n'écrit jamais deux fois la même ligne.
    let derniere: unknown;
    for (let essai = 1; essai <= 3; essai++) {
      const client = new Client({ connectionString: url, connectionTimeoutMillis: 20_000, query_timeout: 120_000 });
      try {
        await client.connect();
        const resultat = await client.query(instruction, valeurs);
        ecrites += resultat.rowCount ?? 0;
        derniere = undefined;
        break;
      } catch (e) {
        derniere = e;
        const message = e instanceof Error ? e.message : String(e);
        if (essai < 3) {
          console.warn(`  ${libelle} : lot ${i}, tentative ${essai} — ${message}`);
          await new Promise((r) => setTimeout(r, 3000 * essai));
        }
      } finally {
        await client.end().catch(() => {});
      }
    }
    if (derniere) {
      const message = derniere instanceof Error ? derniere.message : String(derniere);
      throw new Error(`${libelle} : lot ${i} refusé après trois tentatives — ${message}`);
    }

    if (!options.sec && (i / parLot) % 10 === 0) {
      console.log(`  ${libelle} : ${Math.min(i + parLot, lignes.length)}/${lignes.length}`);
    }
  }

  console.log(`${libelle} : ${ecrites} écrite(s) sur ${lignes.length} proposée(s)`);
  return ecrites;
}

/**
 * Recale une colonne de date sur une liste d'identifiants, en une instruction.
 *
 * POURQUOI PAS UNE BOUCLE
 * Corriger mille cinq cents lignes une par une, c'est trois mille aller-retours
 * réseau : sur une base bridée, des heures. Un `UPDATE … FROM (VALUES …)` fait
 * le même travail en une passe, et ne touche que les lignes réellement
 * différentes — ce que la clause `IS DISTINCT FROM` garantit.
 *
 * @param table    nom physique de la table
 * @param colonne  colonne de date à recaler (ex. `date`)
 * @param valeurs  couples identifiant → date voulue
 */
export async function recalerDates(
  table: string,
  colonne: string,
  valeurs: { id: string; date: Date }[],
  libelle = table,
): Promise<number> {
  if (valeurs.length === 0) return 0;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absente");

  let modifiees = 0;
  for (let i = 0; i < valeurs.length; i += 500) {
    const lot = valeurs.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = lot.map((v, rang) => {
      params.push(v.id, v.date);
      return `($${rang * 2 + 1}, $${rang * 2 + 2}::timestamptz)`;
    });

    const client = new Client({ connectionString: url, connectionTimeoutMillis: 20_000, query_timeout: 180_000 });
    try {
      await client.connect();
      const r = await client.query(
        `UPDATE "${table}" AS t SET "${colonne}" = v.date
         FROM (VALUES ${tuples.join(", ")}) AS v(id, date)
         WHERE t."id" = v.id AND t."${colonne}" IS DISTINCT FROM v.date`,
        params,
      );
      modifiees += r.rowCount ?? 0;
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (modifiees > 0) console.log(`${libelle} : ${modifiees} date(s) recalée(s)`);
  return modifiees;
}

/**
 * Aligne la date des notes sur celle de leur évaluation.
 *
 * Une note porte sa propre date — pratique pour l'horizon de démonstration,
 * mais c'est une copie : si le rendez-vous se déplace, les notes doivent
 * suivre, sinon un contrôle passé le 11 septembre porte des notes datées du 17.
 */
export async function alignerNotesSurEvaluations(prefixeEvaluation: string): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absente");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20_000, query_timeout: 300_000 });
  try {
    await client.connect();
    const r = await client.query(
      `UPDATE notes n SET date = e.date
       FROM evaluations e
       WHERE n."evaluationId" = e.id AND e.id LIKE $1 AND n.date IS DISTINCT FROM e.date`,
      [`${prefixeEvaluation}%`],
    );
    const n = r.rowCount ?? 0;
    if (n > 0) console.log(`notes : ${n} alignée(s) sur la date de leur évaluation`);
    return n;
  } finally {
    await client.end().catch(() => {});
  }
}
