/**
 * Le niveau scolaire d'un élève — une seule source de vérité.
 *
 * POURQUOI CE FICHIER MINUSCULE EXISTE
 * Les scripts de génération écrivent des choses différentes sur les mêmes
 * élèves : des notes, des absences, des preuves de maîtrise, des
 * recommandations, des alertes. S'ils tiraient chacun leur propre hasard, un
 * même élève serait brillant dans son bulletin, en difficulté dans son profil
 * de compétences et absent une fois sur deux — et la démonstration
 * s'effondrerait à la première question.
 *
 * Le niveau est donc DÉDUIT de l'identifiant de l'élève : même entrée, même
 * sortie, dans tous les scripts, à toutes les exécutions. Aucun stockage, rien
 * à synchroniser.
 */

/** Ramène une valeur dans l'intervalle [min, max]. */
function borner(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Niveau scolaire de l'élève, exprimé comme une moyenne sur 20.
 *
 * La distribution est centrée autour de 11,5 avec une vraie queue basse :
 * sans élèves en difficulté, il n'y a ni remédiation, ni alerte, ni
 * intervention à montrer — c'est-à-dire rien de ce qui distingue
 * l'application d'un simple cahier de notes.
 */
export function niveauEleve(eleveId: string): number {
  let h = 0;
  for (let i = 0; i < eleveId.length; i++) h = (h * 31 + eleveId.charCodeAt(i)) >>> 0;
  const u = (h % 1000) / 1000;
  return borner(6 + u * 11 + ((h >> 10) % 100) / 50, 3.5, 18.5);
}
