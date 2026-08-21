import type { PrismaClient } from "@prisma/client";
import { getRlsContext } from "@/lib/rls-context";

/**
 * EcolPro — Pose du contexte RLS sur le client Prisma
 * ===================================================
 *
 * COMMENT ÇA MARCHE
 * PostgreSQL décide de la visibilité d'une ligne à partir de paramètres de
 * session (`app.tenant_id`, `app.site_ids`…). Ces paramètres sont posés
 * pour la seule durée d'une TRANSACTION (troisième argument `true` de
 * `set_config`). Chaque opération Prisma est donc emballée dans une
 * transaction qui commence par poser le contexte.
 *
 * POURQUOI LA PORTÉE TRANSACTION EST OBLIGATOIRE ICI
 * L'application passe par PgBouncer en mode transaction : une connexion
 * physique est rendue au pool à chaque fin de transaction et réattribuée à
 * la requête suivante — potentiellement celle d'un autre établissement. Un
 * paramètre de portée « session » survivrait à ce recyclage et ferait voir
 * à l'école B les données de l'école A. C'est le piège classique de la RLS
 * derrière un pooler, et la raison d'être de ce fichier.
 *
 * COÛT
 * Un aller-retour supplémentaire par opération (les deux ordres partent
 * dans la même transaction). Mesurable, assumé : c'est le prix d'une
 * seconde ligne de défense qui ne dépend plus de la vigilance du code
 * applicatif.
 *
 * DÉPLOIEMENT PROGRESSIF — variable RLS_MODE
 *   off      (défaut) aucun emballage. Comportement historique, strictement
 *            inchangé. C'est l'état sûr tant que les politiques ne sont pas
 *            déployées en base.
 *   warn     le contexte est posé ; une opération sans contexte est
 *            journalisée mais laissée passer. Étape d'observation : on
 *            découvre les chemins de code oubliés SANS casser la production.
 *   enforce  une opération sans contexte lève une erreur. État cible, à
 *            n'activer qu'une fois `warn` silencieux pendant plusieurs jours.
 *
 * L'ordre de déploiement importe : d'abord l'application en `warn`, puis
 * les politiques en base, puis `enforce`. L'inverse coupe le service.
 */

export type RlsMode = "off" | "warn" | "enforce";

export function rlsMode(): RlsMode {
  const raw = (process.env.RLS_MODE ?? "off").toLowerCase();
  return raw === "warn" || raw === "enforce" ? raw : "off";
}

/** Opérations sans contexte déjà signalées — évite d'inonder les journaux. */
const alreadyWarned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (alreadyWarned.has(key)) return;
  alreadyWarned.add(key);
  console.warn(`[rls] ${message}`);
}

/**
 * Emballe un client Prisma pour qu'il pose le contexte RLS avant chaque
 * opération de modèle.
 *
 * Limite connue : les transactions interactives (`prisma.$transaction(async
 * (tx) => …)`) ouvrent leur propre transaction, dans laquelle cette
 * extension ne peut pas s'insérer. Pour celles-là, appeler explicitement
 * `applyRlsContext(tx)` en première instruction du bloc.
 */
export function withRlsExtension<T extends PrismaClient>(client: T) {
  const mode = rlsMode();
  if (mode === "off") return client;

  return client.$extends({
    name: "rls-context",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = getRlsContext();

          if (!ctx) {
            const key = `${model}.${operation}`;
            if (mode === "enforce") {
              throw new Error(
                `[rls] ${key} exécuté hors de tout contexte RLS. ` +
                  `Envelopper l'appel dans withRlsContext(...) — ou, s'il est ` +
                  `légitimement hors tenant, dans withSystemContext("raison", ...).`
              );
            }
            warnOnce(key, `${key} exécuté sans contexte RLS (mode warn : laissé passer)`);
            return query(args);
          }

          // Les deux ordres partent dans la MÊME transaction : le contexte
          // posé est nécessairement celui que verra la requête, et il
          // disparaît au COMMIT.
          const [, result] = await client.$transaction([
            client.$executeRaw`SELECT set_app_context(
              ${ctx.tenantId},
              ${ctx.siteId},
              ${ctx.siteIds.join(",")},
              ${ctx.superAdmin}
            )`,
            query(args),
          ]);
          return result;
        },
      },
    },
  }) as unknown as T;
}

/**
 * Pose le contexte RLS à l'intérieur d'une transaction interactive déjà
 * ouverte. À appeler en première instruction du bloc `$transaction`.
 */
export async function applyRlsContext(
  tx: Pick<PrismaClient, "$executeRaw">
): Promise<void> {
  const ctx = getRlsContext();
  if (!ctx) {
    if (rlsMode() === "enforce") {
      throw new Error("[rls] transaction interactive ouverte hors de tout contexte RLS.");
    }
    return;
  }
  await tx.$executeRaw`SELECT set_app_context(
    ${ctx.tenantId},
    ${ctx.siteId},
    ${ctx.siteIds.join(",")},
    ${ctx.superAdmin}
  )`;
}
