/**
 * Filtres partagés sur les fiches élèves.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * Une fiche supprimée n'est pas effacée : elle est archivée (`deletedAt`
 * renseigné). Tout comptage qui oublie ce filtre inclut donc les élèves
 * archivés et affiche un effectif faux.
 *
 * C'est exactement ce qui se produisait dans Paramètres → Pédagogie : les
 * classes annonçaient 55, 45, 63 élèves quand elles en comptaient
 * réellement 37, 28 et 29 — 89 fiches archivées gonflaient les compteurs,
 * sans que rien ne le signale. Le même `_count` non filtré empêchait aussi
 * de supprimer une classe ne contenant plus que des archives.
 *
 * Ces constantes existent pour que le filtre ne puisse plus être oublié par
 * distraction : on écrit `_count: { select: { eleves: ELEVE_NON_ARCHIVE } }`
 * plutôt que `eleves: true`.
 */

import type { Prisma } from "@prisma/client";

/**
 * Fiches réellement présentes dans l'établissement, tous statuts confondus
 * (actif, transféré, diplômé…). C'est le périmètre de référence des
 * effectifs affichés, et celui de la page Élèves.
 */
export const ELEVE_NON_ARCHIVE = {
  where: { deletedAt: null },
} satisfies { where: Prisma.EleveWhereInput };

/**
 * Élèves actuellement scolarisés : ni archivés, ni sortis. À réserver aux
 * mesures pédagogiques (taux de remplissage, moyennes de classe) où un
 * élève transféré ou diplômé n'a plus sa place.
 */
export const ELEVE_SCOLARISE = {
  where: { deletedAt: null, statut: "ACTIF" as const },
} satisfies { where: Prisma.EleveWhereInput };
