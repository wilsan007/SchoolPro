import { describe, it, expect, vi } from "vitest";

// `src/test/setup.ts` remplace next-intl par un mock qui renvoie la clé : il
// rendrait ce test aveugle, puisque c'est précisément ce comportement que l'on
// cherche à détecter. On restaure donc le vrai module pour ce fichier.
vi.mock("next-intl", async () => await vi.importActual("next-intl"));

import { LANGUES, traducteurPour } from "@/lib/learnos/traducteur";

/**
 * Garde-fou : toute alerte parent créée par le code doit produire un message.
 *
 * POURQUOI
 * --------
 * `envoyerAlertesParent` rend le message avec `t(alerte.cle, params)` au
 * moment de l'envoi WhatsApp, longtemps après la création de l'alerte. Quand
 * la clé n'a pas de traduction — ou qu'un paramètre du modèle manque —
 * next-intl ne lève rien : il renvoie le chemin de la clé, et c'est la famille
 * qui reçoit « learnos.alertes.retards.exces » à la place du message.
 *
 * Trois clés étaient dans ce cas : `retards.exces` (stats de retards),
 * `sanction.appliquee` (workflow de sanction) et `note.baisse` (chute de
 * moyenne). Les paramètres ci-dessous sont ceux que les émetteurs passent
 * réellement — le test vérifie donc la paire clé + paramètres, pas seulement
 * l'existence du modèle.
 */

/** Clé d'alerte → paramètres passés par l'émetteur (handler ou route). */
const ALERTES: Record<string, Record<string, string | number>> = {
  // src/lib/learnos/alertes-parent.ts
  absences: { n: 3, prenom: "Deqa", jours: 30 },
  parcoursArret: { prenom: "Deqa", matiere: "Mathématiques" },
  jalonAtteint: { prenom: "Deqa", competence: "Équations du premier degré" },
  // src/lib/learnos/handlers/*.ts
  "absence.frequence": { elevePrenom: "Deqa", eleveNom: "Mahamoud", count: 3, retards: 2 },
  "prediction.difficulte": {
    chapitreId: "chap-1", competenceLibelle: "Fractions",
    elevePrenom: "Deqa", eleveNom: "Mahamoud", difficulte: "DIFFICILE", probaReussite: 0.35,
  },
  "devoir.enretard": { titre: "Exercices 4 et 5", matiereNom: "Maths", joursRetard: 2, elevePrenom: "Deqa", eleveNom: "Mahamoud" },
  "devoir.corrige": { titre: "Exercices 4 et 5", matiereNom: "Maths", elevePrenom: "Deqa", eleveNom: "Mahamoud" },
  "evaluation.publiee": { matiereNom: "Maths", intitule: "Contrôle 1", elevePrenom: "Deqa", eleveNom: "Mahamoud" },
  "bulletin.publie": { periodeNom: "Trimestre 1", elevePrenom: "Deqa", eleveNom: "Mahamoud" },
  "incident.signale": {
    elevePrenom: "Deqa", eleveNom: "Mahamoud", classeNom: "2nde D",
    type: "INDISCIPLINE", gravite: 2, description: "Bavardages répétés", date: "12/01/2026",
  },
  "candidature.acceptee": { elevePrenom: "Deqa", eleveNom: "Mahamoud", matricule: "AMB-2026-014", classeNom: "2nde D" },
  "sanction.appliquee": {
    elevePrenom: "Deqa", eleveNom: "Mahamoud", classeNom: "2nde D",
    typeSanction: "RETENUE", gravite: 2, description: "Retenue d'une heure",
    dateDebut: "12/01/2026", dateFin: "12/01/2026",
  },
  "note.baisse": { baisse: 4.5, delta: -4.5, noteId: "note-1", intitule: "Contrôle 1" },
  // src/app/api/vie-scolaire/retards-stats/route.ts
  "retards.exces": {
    retards: 6, seuil: 5, prenom: "Deqa", nom: "Mahamoud",
    classeNom: "2nde D", dernierRetard: "12/01/2026",
  },
};

describe("messages des alertes parents", () => {
  for (const langue of LANGUES) {
    describe(langue, () => {
      for (const [cle, params] of Object.entries(ALERTES)) {
        it(`rend « ${cle} »`, async () => {
          const t = await traducteurPour(langue, "learnos.alertes");
          const texte = t(cle, params);

          // Modèle absent ou paramètre manquant : next-intl renvoie le chemin
          // complet de la clé en guise de message.
          expect(texte).not.toBe(cle);
          expect(texte).not.toContain("learnos.alertes");
          // Un placeholder resté tel quel signale un paramètre oublié.
          expect(texte).not.toMatch(/\{[a-zA-Z]+\}/);
          expect(texte.length).toBeGreaterThan(10);
        });
      }
    });
  }
});
