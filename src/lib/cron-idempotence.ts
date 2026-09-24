import type { Prisma } from "@prisma/client";
import { withSystemContext } from "@/lib/rls-context";

/**
 * Journal d'idempotence des tâches planifiées.
 * ===========================================
 *
 * POURQUOI CE MODULE EXISTE
 * `dejaExecutee` a d'abord vécu dans `src/app/api/cron/dispatch/route.ts`.
 * Il y faisait son `upsert` **avant** le `withSystemContext` qui enveloppe le
 * corps des tâches (cf. ligne « ISO-4 » de la route). En mode
 * `RLS_MODE=enforce`, cet `upsert` hors contexte échouait donc
 * systématiquement, et son `catch` — écrit pour la seule course de type
 * `@@unique` — retournait `true`, c'est-à-dire « déjà exécutée, sauter ».
 *
 * Résultat : les 14 tâches gardées par `idempotenceSec` étaient sautées à
 * chaque passage, tout en renvoyant `job succeeded`. Une panne silencieuse
 * que seul le journal (`[non-fatal] Error: [rls] …`) laissait deviner.
 *
 * Deux garde-fous en découlent, et c'est tout l'objet de ce fichier :
 *   1. l'écriture du journal passe par `withSystemContext` (cron cross-tenant) ;
 *   2. une erreur technique ne peut plus être confondue avec « déjà exécutée ».
 *
 * Le module est extrait de la route pour être testable sans Next ni Prisma :
 * les dépendances sont injectées (client Prisma, horloge).
 */

/** Fenêtre d'idempotence arrondie au début de la période, en UTC. */
export function fenetreIdempotence(idempotenceSec: number, now = Date.now()): Date {
  const fenetreMs = idempotenceSec * 1000;
  return new Date(now - (now % fenetreMs));
}

/**
 * Seule erreur qui signifie réellement « un autre passage a déjà enregistré
 * cette fenêtre » : la violation de contrainte d'unicité sur `(nom, fenetre)`.
 * Prisma la signale par le code `P2002`.
 */
export function estViolationUnicite(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/** Vue minimale du client Prisma dont ce module a besoin (facilite le test). */
export interface JournalIdempotence {
  tacheCronExecution: {
    upsert: (args: {
      where: { nom_fenetre: { nom: string; fenetre: Date } };
      create: { nom: string; fenetre: Date; resultat: Prisma.InputJsonValue };
      update: Record<string, never>;
    }) => Promise<unknown>;
  };
}

/**
 * Vérifie si une tâche a déjà été exécutée dans sa fenêtre d'idempotence.
 *
 * @returns `true`  → déjà exécutée, l'appelant doit SAUTER la tâche ;
 *          `false` → à exécuter (l'exécution vient d'être enregistrée).
 */
export async function dejaExecutee(
  journal: JournalIdempotence,
  nom: string,
  idempotenceSec: number,
  now = Date.now()
): Promise<boolean> {
  const fenetre = fenetreIdempotence(idempotenceSec, now);

  try {
    // `withSystemContext` : tâche planifiée, hors session HTTP, balayant
    // volontairement tous les tenants. Sans ce contexte, l'écriture est
    // rejetée en mode `enforce` et l'idempotence devient un interrupteur
    // général d'arrêt des tâches.
    await withSystemContext("cron:idempotence", () =>
      journal.tacheCronExecution.upsert({
        where: { nom_fenetre: { nom, fenetre } },
        create: { nom, fenetre, resultat: { skipped: false } },
        update: {}, // no-op : l'enregistrement existe déjà, on ne le modifie pas
      })
    );
    return false; // pas d'enregistrement existant → exécuter
  } catch (e) {
    if (estViolationUnicite(e)) {
      // Course concurrente : une autre passe a inséré la même fenêtre.
      return true;
    }
    // NE PAS retourner `true` ici : une base indisponible, un contexte RLS
    // manquant ou une migration en retard ne veulent pas dire « déjà
    // exécutée ». On l'annonce et on exécute — un doublon éventuel est
    // préférable à des tâches qui ne tournent plus jamais.
    console.error(
      `[cron] journal d'idempotence inaccessible pour « ${nom} » — tâche exécutée malgré tout`,
      e
    );
    return false;
  }
}
