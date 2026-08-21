import { Prisma } from "@prisma/client";

/**
 * Horizon de démonstration — masque le futur quand l'horloge est déplacée.
 *
 * POURQUOI CE MODULE EXISTE
 * Déplacer la date avec la Time Machine ne suffisait pas : `getDemoNow()`
 * change le « maintenant » des calculs, mais les requêtes n'avaient aucune
 * BORNE SUPÉRIEURE. En se plaçant en février, la base répondait toujours avec
 * les notes d'avril, les incidents de mai et les événements jusqu'à la fin du
 * cycle — les écrans paraissaient identiques quelle que soit la date choisie,
 * et c'était le symptôme d'« une page qui ne se met pas à jour ».
 *
 * POURQUOI DANS LE CLIENT PRISMA, ET PAS DANS CHAQUE REQUÊTE
 * Le dépôt compte ~146 filtres de date répartis sur ~85 fichiers. Les reprendre
 * un par un demanderait de n'en oublier aucun, aujourd'hui et à chaque requête
 * ajoutée ensuite. La borne est donc posée une fois, ici : toute nouvelle page
 * en hérite sans y penser.
 *
 * CE QUE L'EXTENSION NE COUVRE PAS
 * Les extensions Prisma ne s'appliquent qu'à l'opération de PREMIER NIVEAU. Un
 * `eleve.findMany({ include: { notes: true } })` ne passe donc pas par ici : ces
 * relations imbriquées portent leur propre `where`, ajouté explicitement sur les
 * pages concernées.
 */

/**
 * Modèle → champ portant la date de l'ÉVÉNEMENT.
 *
 * TROIS RÈGLES ONT PRÉSIDÉ À CETTE LISTE
 *
 * 1. Jamais `createdAt`. Le jeu de démonstration est inséré en une seule passe
 *    et n'écrit pas `createdAt` : sur les absences, les incidents, les devoirs
 *    et les passages à l'infirmerie, TOUTES les lignes portent le même instant
 *    (2024-09-15), alors que leurs dates métier s'étalent de janvier à juin.
 *    `createdAt` ne porte donc aucune information ici : filtrer dessus
 *    afficherait tout ou viderait les écrans. Seules les dates métier (`date`,
 *    `dateDonne`, `occurredAt`…) sont réparties, et ce sont elles que
 *    l'utilisateur voit à l'écran.
 *
 * 2. Aucun modèle structurel. Élèves, classes, matières, utilisateurs, périodes
 *    et années scolaires décrivent l'établissement, pas son activité : les
 *    masquer selon la date viderait les listes au lieu de remonter le temps.
 *
 * 3. Seuls les FAITS CONSTATÉS, jamais les ÉVÉNEMENTS PLANIFIÉS. C'est la
 *    distinction décisive. Une note saisie en avril ou un incident survenu en
 *    mai ne peuvent pas être connus de l'application en février : ils n'ont pas
 *    encore eu lieu, et c'est ce qui rendait les écrans identiques quelle que
 *    soit la date. Un examen programmé en avril, en revanche, est un élément de
 *    calendrier : il est légitimement visible en février, et le masquer viderait
 *    « prochain examen » et « prochaines évaluations » — l'horizon rendrait
 *    impossible ce que ces écrans doivent justement montrer.
 *    Ne sont donc PAS bornés : Examen, SessionExamen, Evaluation, Evenement,
 *    EvenementCalendaire, Réunion, SeanceMentorat, EntretienConseiller,
 *    RemplacementCours, CongePersonnel.
 *
 * `nullable` marque les champs optionnels : sur ceux-là, la borne doit laisser
 * passer les lignes à `null`, sinon un `lte` les écarte silencieusement (un
 * bulletin non publié disparaîtrait au lieu d'être simplement non publié).
 */
const HORIZON: Record<string, { champ: string; nullable?: boolean }> = {
  // Vie scolaire — faits constatés.
  Note: { champ: "date" },
  Absence: { champ: "date" },
  Incident: { champ: "date" },
  Sanction: { champ: "dateDebut" },
  ExclusionEleve: { champ: "dateDebut" },
  PassageInfirmerie: { champ: "date" },
  // La date à laquelle le devoir est DONNÉ aux élèves, pas celle du rendu : un
  // devoir préparé à l'avance n'existe pas encore pour la famille.
  Devoir: { champ: "dateDonne" },
  Bulletin: { champ: "publishedAt", nullable: true },

  // Finances — mouvements déjà passés.
  // `echeance` est optionnelle au schéma (d'où la forme « nullable »), mais
  // renseignée sur la totalité des factures : sans cette borne, « factures en
  // retard » comptait des échéances non encore arrivées.
  Facture: { champ: "echeance", nullable: true },
  Paiement: { champ: "date" },
  Depense: { champ: "date" },
  Relance: { champ: "envoyeeLe" },

  // Personnel — absences constatées et paies versées. Les congés, eux, se
  // planifient : ils restent hors horizon.
  AbsencePersonnel: { champ: "date" },
  BulletinPaie: { champ: "datePaiement", nullable: true },

  // LEARNOS — c'est ici que se joue la démonstration des prédictions : une
  // prédiction émise en mai ne doit pas être connue de l'application en février,
  // sinon la démonstration « prédit » ce qu'elle a déjà sous les yeux.
  LearnosEvent: { champ: "occurredAt" },
  LearningEvidence: { champ: "occurredAt" },
  PredictionDifficulte: { champ: "emiseLe" },
  KpiSnapshot: { champ: "periode" },
  AlerteParent: { champ: "envoyeeLe", nullable: true },
};

/**
 * Opérations bornées — lectures d'ensemble uniquement.
 *
 * `findUnique` est délibérément absent : son `where` n'accepte que des champs
 * uniques, y injecter une date produirait une requête invalide. Les écritures
 * le sont aussi : masquer le futur en lecture est une vue, le refuser en
 * écriture serait un changement de règle métier.
 */
const LECTURES = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Filtre à ajouter pour une opération donnée, ou `null` s'il n'y a rien à
 * borner (modèle hors horizon, écriture, ou lecture unitaire).
 *
 * Extrait de l'extension pour être vérifiable sans base de données : la carte
 * `HORIZON` est une décision métier — ce qui est masqué et ce qui reste visible
 * — et c'est elle que les tests doivent verrouiller.
 */
export function filtreHorizon(
  model: string | undefined,
  operation: string,
  date: Date
): Record<string, unknown> | null {
  const regle = model ? HORIZON[model] : undefined;
  if (!regle || !LECTURES.has(operation)) return null;

  return regle.nullable
    ? { OR: [{ [regle.champ]: { lte: date } }, { [regle.champ]: null }] }
    : { [regle.champ]: { lte: date } };
}

/**
 * Extension à appliquer au client Prisma des requêtes (jamais à celui des
 * traitements de fond : un cron doit voir la base entière).
 */
export function extensionHorizonDemo() {
  return Prisma.defineExtension({
    name: "demo-horizon",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Écarté avant même de lire les cookies : la très grande majorité des
          // requêtes porte sur des modèles hors horizon.
          if (!model || !HORIZON[model] || !LECTURES.has(operation)) {
            return query(args);
          }

          // Import différé : `demo-now` lit `next/headers`, absent des scripts
          // qui importent ce client. Chargé ici, il ne casse pas les exécutions
          // hors requête.
          const { getDemoDate } = await import("./demo-now");
          const date = await getDemoDate();
          if (!date) return query(args);

          const borne = filtreHorizon(model, operation, date);
          if (!borne) return query(args);

          // `AND` plutôt qu'un étalement : le filtre d'appel porte souvent déjà
          // un prédicat sur le même champ (`date: { gte: debutDuJour }`), qu'un
          // étalement écraserait. L'imbrication ne perd jamais rien.
          const filtreAppelant = (args as { where?: unknown }).where;
          return query({
            ...args,
            where: { AND: [filtreAppelant ?? {}, borne] },
          } as typeof args);
        },
      },
    },
  });
}
