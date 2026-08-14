# LEARNOS — état d'avancement

> Point de reprise. Les décisions de conception détaillées sont dans
> [learnos-integration-plan.md](learnos-integration-plan.md) et
> [plan-progression-roles-kpi.md](plan-progression-roles-kpi.md).

## Vérification (rituel à chaque lot)

```bash
npx tsc --noEmit -p tsconfig.json && npx next lint && npx vitest run && npx next build
```

`next build` est **obligatoire** dès qu'une route ou un composant est touché :
il a attrapé deux fois ce que `tsc` et ESLint laissaient passer (export interdit
dans une `route.ts`, Prisma entraîné dans un bundle client).

Garde-fou : le nombre d'`eslint-disable` dans `src/` ne doit pas gonfler sans
justification écrite (référence 131 au départ du chantier).

## Fait

| Lot | Contenu |
|---|---|
| P0 | Isolation par site — 103 → 0 violations, tests de cohérence `SITE_PATHS` |
| P1 | LLM gratuit : Ollama (local) → Groq → GLM, routeur + cache + journal |
| P2 | Curriculum : chapitres, compétences, prérequis, rattachement évaluations |
| P3 | Event Bus (outbox `LearnosEvent`) + Evidence Engine |
| P4 | Learning Twin — maîtrise, confiance, tendance, prérequis |
| P9 | Recommandations (5 bandes) + plans de progression |
| P10 | Socle KPI + espaces `/direction`, `/mon-espace`, `/ma-classe`, `/parent`, `/eleve` |
| P11 | Bot parent : questions à la demande, alertes proactives, préférences |
| — | Proposition du graphe de prérequis par le modèle, validée arête par arête |
| P13 | Import du programme officiel : PDF ou texte → chapitres + compétences |
| — | Planification annuelle + alertes anticipatives |
| — | i18n complète : interface, textes générés (clé + params) **et erreurs d'API** |

Les routes ne renvoient plus de phrase française mais un **code** (`erreurs-api.ts`),
que le client traduit (`erreurs-client.ts` + namespace `learnos.erreurs`). Le
français reste dans la réponse comme repli pour les journaux. `erreurs-api.test.ts`
échoue si un code part sans traduction dans les trois langues.

**Validation de bout en bout**, sur données réelles, `--clean` pour retirer le
jeu de démonstration :

```bash
DATABASE_URL="$DIRECT_URL" npx tsx scripts/demo-learnos.ts
```

```bash
DATABASE_URL="$DIRECT_URL" npx tsx scripts/demo-bot-parent.ts --alertes
```

Le second couvre le bot : identification par numéro, désambiguïsation d'une
fratrie, les sept intentions, puis la chaîne d'alerte complète (détection,
idempotence sur trois passages, rendu dans la langue de la famille, envoi).

## Reste

1. **OCR** pour les PDF scannés — l'import les détecte et le dit, mais ne sait
   pas les lire. C'est le cas le plus fréquent des documents ministériels.
2. Traductions somali et arabe — `so.json` contient un repli français, et la
   locale `ar` n'existe pas (elle demanderait aussi le support RTL).
3. Messages d'erreur d'API **hors LEARNOS** (`api/eleves`, `api/facturation`,
   `api/rh`…) encore en français figé — migrer vers `erreurJson(code)`.
4. Apprentissage statistique des prérequis — **bloqué** : besoin d'une année de
   données réelles. Le substrat existe : les arêtes acceptées et refusées
   passent toutes par `AiDecisionLog`.

## Points de vigilance

- **Latence base** : ~192 ms/requête sur le pooler *session* (5432),
  ~980 ms sur le pooler *transaction* (6543, celui de `DATABASE_URL`), qui
  coupe aussi la connexion en cours de script. Les traitements de fond
  utilisent `prismaBackground` (5432).
- **Cron** : un seul point d'entrée (`/api/cron/dispatch`) qui répartit. Le
  palier Vercel plafonne le *nombre* de crons, pas leur fréquence — sur Hobby
  la granularité reste quotidienne.
- **Calibrage de notation** (KPI direction) : un écart n'est pas une faute.
  À présenter comme une question, jamais un verdict — sinon les enseignants
  cessent de tenir leur planification à jour.
- **Traduction en tâche de fond** : n'utilisez pas `getTranslations` hors d'une
  requête — il lit le cookie de l'appelant, qui n'existe pas dans un cron et qui
  serait de toute façon la mauvaise langue (celle de Meta, pas de la famille).
  Passez par `traducteurPour(langue, namespace)`.
- **Import de programme** : l'origine d'un libellé (`lu` / `deduit`) n'est
  **pas** demandée au modèle — mesuré, il se trompe dans les deux sens.
  L'application cherche elle-même chaque libellé dans le document
  (`attribuerOrigine`). Ne revenez pas à une étiquette fournie par le modèle.
- **Bot parent** : le modèle ne produit **jamais** de texte destiné à une
  famille. Sa seule sortie est une étiquette d'intention validée contre un
  ensemble fermé ; chiffres et phrases viennent de SQL et des gabarits traduits.
  Le pire défaut possible devient « on a mal compris la question ».
- Un travail parallèle sur l'**entraînement autonome** touche
  `evidence-engine.ts`, `learning-twin.ts`, `entrainement.ts`.
