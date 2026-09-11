# Étape 6 — LEARNOS (intelligence pédagogique) et IA générative

**Score actuel : 6,9 / 10** (brut 6,9 — plafond de 7,0 non atteint)
**Score cible : 9,7** · **Effort estimé : 10 à 14 jours-développeur**

---

## 1. Périmètre

`src/lib/learnos/` (119 fichiers en comptant le sous-dossier `handlers/`, dont 43 fichiers de test), `src/lib/ai/` (routeur multi-fournisseur : Ollama, Groq, OpenRouter, GLM), `src/app/api/learnos/*`, `src/app/api/ai/*`, pages `/direction`, `/mon-espace`, `/ma-classe`, `/parent`, `/eleve`, `/entrainement`, `/chatbot-direction`.

## 2. Ce qui est solide

- **Décisions déterministes** : le moteur de recommandation n'utilise aucun modèle de langage (règle d'`AGENTS.md`). L'IA générative est limitée à l'import de programme, aux propositions de prérequis et à la génération de questions, et **l'enseignant valide** arête par arête (`AiDecisionLog`).
- **Bot parent sûr par construction** : le modèle ne renvoie qu'une **intention prise dans un ensemble fermé**. Chiffres et phrases viennent de SQL et de gabarits traduits (`bot-parent.ts:8-58`). Le pire défaut possible est de mal comprendre une question.
- **Import de programme** : l'origine de chaque libellé (lu ou déduit) est vérifiée par l'application dans le document, pas déclarée par le modèle (`docs/learnos-etat.md`).
- **Chat de l'emploi du temps** : outils fermés, arguments validés par Zod, limitation de débit (`api/ai/chat/route.ts`).
- **Cœur testé** : `evidence-engine`, `learning-twin`, `recommendation-engine`, `plan-engine`, `entrainement`, `exercice-selector`, `planification`, `risque-decrochage`, `prediction` (indirectement), `bot-parent`, `alertes-parent`, `import-programme`, `direction-intelligence`, ainsi que tous les gestionnaires d'événements.
- **Erreurs d'API traduites** en trois langues, avec un test de complétude.

## 3. Constats

### IA-H1 — Haute — Corriger une note fausse les profils de maîtrise *(établi par lecture de trois fichiers)*

1. `PUT /api/evaluations/[id]/notes` (`route.ts:165-168`) **supprime toutes les notes de l'évaluation puis les recrée** (`deleteMany` + `createMany`), ce qui leur donne **de nouveaux identifiants**. Il publie ensuite `note.recorded` pour **chaque** note (`:180-200`).
2. La preuve d'apprentissage a pour identifiant `evidenceId("note", noteId, competenceId)` (`evidence-engine.ts:243`). Un nouveau `noteId` donne une **nouvelle** preuve. L'ancienne n'est pas supprimée : `LearningEvidence.note` a `onDelete: SetNull`, et aucun événement `note.deleted` n'est publié.
3. Le profil agrège **toutes** les preuves de l'élève pour la compétence, sans dédoublonnage par évaluation (`learning-twin.ts:344-353`).

**Scénario.** Un enseignant saisit les notes d'un contrôle, s'aperçoit d'une erreur sur un élève et réenregistre. Les 30 élèves ont alors **deux** preuves pour ce contrôle, et l'élève corrigé garde sa **mauvaise** note parmi ses preuves. À chaque correction, le poids du contrôle augmente. Les profils, recommandations, plans, prédictions, alertes aux parents et KPI de la direction en héritent.

### IA-M1 — Moyenne (latente) — Le moteur de requêtes IA laisse passer `select`, `include` et `where` sans les valider

`src/lib/learnos/ai-query-engine.ts:514-515` transmet tels quels `select` et `include` produits par le modèle. Le `where` du modèle est combiné par `AND`, mais sans restriction sur les relations. Pour la direction, `include: { user: true }` sur `enseignant` renvoie l'empreinte du mot de passe et le secret 2FA chiffré ; un `where` sur une relation (`user: { password: { startsWith: … } }`) devient un oracle octet par octet, via `count`.

**Latente** car le seul appelant, l'assistant direction, est désactivé (`CHATBOT_DIRECTION_ACTIF = false`, `chatbot-direction.ts:120`). **À corriger avant toute réactivation.**

### IA-M2 — Moyenne — Aucune propagation des corrections et suppressions de notes

Les types `note.updated` et `note.deleted` sont réservés mais jamais publiés (`events.ts:37-41`). La fusion de doublons d'élèves (`parametres.ts:2327`, `tx.note.updateMany({ eleveId: mergeId → keepId })`) déplace les notes sans déplacer les preuves ni recalculer les profils : l'élève conservé perd son historique LEARNOS, et l'élève fusionné garde des profils orphelins.

### IA-M3 — Moyenne — 24 moteurs de plus de 300 lignes sans aucun test

Principaux fichiers : `trajectoires-cohortes.ts` (1 324 lignes), `couverture-remplacements.ts` (1 106), `finance-intelligence.ts` (1 074), `climat-bien-etre.ts` (907), `equite-inclusion.ts` (857), `generation-questions.ts` (823), `clustering-eleves.ts` (675), `engagement-parental.ts` (663), `ai-query-engine.ts` (590), `alumni-intelligence.ts` (556), `efficacite-pedagogique.ts` (553), `graphe-curriculum.ts` (519), `courbe-oubli.ts` (514), `alerte-parent-pedagogique.ts` (502), `planification-pure.ts` (501), `workflow-validation.ts` (486), `tableau-bord-enseignant.ts` (459), `suivi-programme.ts` (447), `revision-semaine.ts` (407), `prediction-engine.ts` (407), `pattern-analyzer.ts` (397), `events.ts` (328), `boucle-cahier-journal.ts` (315), `calibration.ts` (301). Ces moteurs produisent des indicateurs présentés à la direction (équité, climat, finances) : **un chiffre faux affiché à un directeur est un défaut métier**, pas une simple dette.

### IA-M4 — Moyenne — Des données d'élèves et de familles partent chez des fournisseurs externes, sans registre

Le routeur (`src/lib/ai/router.ts`) peut envoyer les requêtes à Groq (États-Unis), OpenRouter (intermédiaire vers plusieurs modèles) ou GLM (Zhipu, Chine). Contenus concernés : questions libres des parents au bot (qui peuvent citer un enfant, une maladie, un conflit), noms d'enseignants et de classes (chat EDT), documents officiels (import de programme). Aucun document ne décrit ces flux (finalité, pays, durée de conservation chez le fournisseur, base légale), et aucun réglage par établissement n'interdit l'envoi hors d'Ollama local.

### IA-M5 — Moyenne — Seuils recalibrés en continu

`calibrerSeuils` tourne 12 fois par jour au lieu d'une fois par mois (AUT-C1) : les seuils de recommandation bougent sur de petits échantillons. Voir l'étape 5.

### IA-B1 — Basse — `prismaBackground` jamais utilisé

`docs/learnos-etat.md` le signale : les traitements de fond passent par le pooler transaction (environ 980 ms par requête), contre environ 192 ms en mode session. Le gain de 5× n'est pas pris. Voir INF-7.

## 4. Angles morts

1. **Aucune évaluation de la qualité des prédictions** exposée : `verifierPredictions` calcule vraies et fausses prédictions, mais aucun tableau de bord ne montre la précision par niveau et par matière, ni son évolution. On ne sait pas si LEARNOS prédit mieux que le hasard.
2. **Explicabilité** : une recommandation affichée à un parent ou un enseignant n'indique pas quelles preuves l'ont produite.
3. **Biais et équité** : `equite-inclusion.ts` existe mais n'est pas testé. Aucun contrôle ne vérifie que les alertes de décrochage ne se concentrent pas, à niveau égal, sur un groupe (site, classe, sexe).
4. **Coût des modèles** : `AiCache` et le journal existent, mais aucun plafond de dépense par établissement ni aucune alerte de consommation.
5. **Données de démonstration et apprentissage** : `calibration` et `pattern-analyzer` apprennent de l'historique. Aucun garde-fou n'empêche d'apprendre sur les données du jeu Ambouli dans un tenant réel.

## 5. Notation détaillée

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 7 | Conception prudente ; moteur de requêtes latent ; flux externes non encadrés | 10 |
| Exactitude (25 %) | 6 | Preuves en double après chaque correction (IA-H1) ; seuils instables | 9,5 |
| Robustesse (15 %) | 7 | Événements idempotents par clé… mais clé instable | 9,5 |
| Tests (15 %) | 7 | Cœur testé ; 24 moteurs sans test | 9,5 |
| Traçabilité (10 %) | 8 | `AiDecisionLog`, `JournalApprentissage` | 9,5 |
| Maintenabilité (10 %) | 7 | Fichiers très longs (jusqu'à 1 324 lignes, `chatbot-direction` à 74 Ko) | 9,5 |
| **Brut** | **6,9** | | |

---

## 6. Cahier des charges

### IA-1 — Rendre les notes stables et les preuves exactes *(P1, 3 j)*

1. **Ne plus recréer les notes.** Dans `evaluations/[id]/notes/route.ts`, remplacer `deleteMany` + `createMany` par un **diff** :
   - lire les notes existantes de l'évaluation (`eleveId` → note) ;
   - pour chaque note reçue : si elle n'existe pas, `create` et publier `note.recorded` ; si elle existe avec une valeur différente, `update` (même `id`) et publier `note.updated` avec `valeurAvant` et `valeurApres` ; si elle est identique, ne rien faire ;
   - pour chaque note existante absente de la saisie : supprimer et publier `note.deleted` ;
   - tout cela dans une transaction (avec `applyRlsContext(tx)`), puis publication des événements après validation.
   Une contrainte `@@unique([evaluationId, eleveId])` sur `Note` est à ajouter si la règle métier le permet (**décision** : une seule note par élève et par évaluation ?). Il faut d'abord un script de détection des doublons existants.
2. **Activer `note.updated` et `note.deleted`** dans `event-bus.ts`, avec des gestionnaires **simples** :
   - `note.updated` → `ingererNoteCommePreuve` (l'`upsert` sur le même identifiant de preuve remplace la valeur), puis `recalculerProfilsApresPreuve`, puis `recalculerRecommandationsApresProfil` ;
   - `note.deleted` → supprimer les preuves `sourceType = "note" AND sourceId = noteId`, puis recalculer les profils des compétences concernées.
   > Note : l'arbre de travail contient une version en cours de ces gestionnaires (`src/lib/learnos/handlers/note-updated.ts`, `note-deleted.ts`, `evaluation-completed.ts`) qui **ne compile pas** (`tsc` : 10 erreurs, dont trois dans `evaluation-completed.ts`). Elle s'appuie sur l'ancien cahier des charges. La reprendre selon le point ci-dessus, et abandonner `evaluation-completed`, sans objet tant que personne ne publie cet événement.
3. **Réparer l'existant** : script `scripts/learnos-dedoublonner-preuves.mjs`, en **simulation par défaut** (`--appliquer` pour écrire). Il supprime les preuves dont `noteId IS NULL AND sourceType = 'note'` (preuves de notes supprimées) et, pour un même `(eleveId, evaluationId, competenceId)`, ne conserve que la preuve de la note encore existante. Il se termine par un recalcul des profils concernés via `replayEvents` ou un recalcul direct. **Exécution en production : décision humaine**, après sauvegarde.
4. **Fusion d'élèves** (`parametres.ts:2327`) : déplacer aussi `learningEvidence`, `studentLearningProfile`, `recommandation`, `planProgression`, ou les recalculer pour l'élève conservé. Publier un événement `eleve.fusionne`.

**Tests.**
- Enregistrer deux fois de suite les mêmes notes → aucun nouvel événement, aucune nouvelle preuve.
- Corriger une note de 5 à 15 → une seule preuve, avec `rawScore = 15`.
- Retirer un élève de la saisie → sa preuve est supprimée et son profil recalculé.
- Test d'invariant (`learning-twin.invariants.test.ts`) : pour tout élève et toute compétence, **au plus une preuve par note existante**, et aucune preuve de note supprimée.

### IA-2 — Verrouiller le moteur de requêtes IA avant toute réactivation *(P2, 1,5 j)*

1. `select` : liste blanche de champs par modèle (`CHAMPS_AUTORISES[modele]`) ; tout champ absent est rejeté. Interdire toujours : `password`, `twoFactor*`, `*Token*`, `*Secret*`, `resetToken*`.
2. `include` : **interdit** par défaut. Autoriser uniquement des relations listées (`RELATIONS_AUTORISEES[modele] = { classe: ["nom", "niveau"] }`), qui reçoivent elles-mêmes un `select` imposé et le filtre de tenant.
3. `where` : parcourir récursivement l'objet et refuser toute clé qui n'est ni un champ scalaire autorisé ni un opérateur Prisma connu (`equals`, `in`, `lt`, `gte`, `contains`, `AND`, `OR`, `NOT`…). Refuser toute relation.
4. `orderBy` : uniquement sur des champs autorisés. `take` borné à 100 (déjà fait).
5. Tests d'attaque : `include user`, `select password`, `where` sur une relation, modèle hors liste, opérateurs imbriqués sur 10 niveaux → tous refusés avec un motif. Ajouter un test de **réactivation** qui échoue si `CHATBOT_DIRECTION_ACTIF` passe à `true` alors que ces tests n'existent pas (garde en CI).

### IA-3 — Tester les moteurs affichés à la direction *(P2, 5 j, par priorité)*

Pour chaque moteur d'IA-M3, dans cet ordre : `finance-intelligence`, `equite-inclusion`, `climat-bien-etre`, `trajectoires-cohortes`, `couverture-remplacements`, `prediction-engine`, `calibration`, `alerte-parent-pedagogique`, puis les autres.
1. Isoler le calcul pur (fonction sans Prisma, règle n°7) de la lecture des données.
2. Écrire des tests sur un **jeu de données de référence dont les résultats sont calculés à la main** et documentés en commentaire (au moins 3 cas nominaux, cas vide, cas limite de division par zéro, cas d'un seul élève).
3. Pour les indicateurs affichés, vérifier qu'un échantillon trop petit produit « donnée insuffisante » plutôt qu'un pourcentage trompeur.

**Critère.** Couverture des branches ≥ 80 % sur `src/lib/learnos/` (ajouter le dossier à `coverage.include`).

### IA-4 — Encadrer les flux vers les fournisseurs de modèles *(P2, 1,5 j + décision)*

1. Rédiger `docs/SECURITE/flux-ia.md` : pour chaque usage (bot parent, import de programme, prérequis, questions, chat EDT), indiquer les données envoyées, le fournisseur possible, le pays, la conservation annoncée par le fournisseur et la finalité.
2. Ajouter un réglage par établissement, `Tenant.iaFournisseursAutorises: String[]` (par défaut `["ollama"]`, c'est-à-dire local seulement), respecté par `routeAi`. L'activation d'un fournisseur externe est une **décision de la direction**, horodatée et auditée.
3. Pseudonymiser avant l'envoi au bot parent : remplacer les prénoms connus des enfants du parent par `[ENFANT_1]` avant la classification d'intention, ce qui n'en change pas le résultat.

### IA-5 — Mesurer la qualité des prédictions *(P3, 2 j)*

Écran `/direction/learnos/qualite` : précision, rappel et calibration des prédictions vérifiées, par niveau × matière et par mois, avec l'effectif sous-jacent. Indiquer « non significatif » en dessous de 30 prédictions vérifiées.

### IA-6 — Explicabilité des recommandations *(P3, 1,5 j)*

Chaque recommandation stocke les identifiants des preuves et le seuil qui l'ont déclenchée. L'interface affiche « Pourquoi ? » : les trois dernières preuves, la tendance, le seuil de la compétence.

## 7. Définition de « terminé »

- [ ] Invariant « une preuve par note existante » vrai en production, contrôlé chaque nuit (tâche de vérification qui alerte en cas d'écart).
- [ ] `note.updated` et `note.deleted` publiés et traités ; évaluation réenregistrée sans effet de bord.
- [ ] Moteur de requêtes IA durci, avec tests d'attaque au vert.
- [ ] Couverture ≥ 80 % sur `src/lib/learnos/`.
- [ ] Registre des flux IA validé par la direction ; fournisseurs externes désactivés par défaut.
