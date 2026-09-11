# Étape 5 — Automatisation : cron, bus d'événements, webhooks, notifications planifiées

**Score actuel : 5,0 / 10** (brut 6,4 — plafonné à 5,0 par un constat critique)
**Score cible : 9,7** · **Effort estimé : 6 à 8 jours-développeur**

---

## 1. Inventaire des déclencheurs

### 1.1 Tâches planifiées

Déclenchées par supercronic sur chaque machine Fly.io (`crontab.txt`, `docker-entrypoint.sh`), et aussi déclarées dans `vercel.json` pour un déploiement Vercel.

| Tâche | Intention documentée | Exécution réelle (cron toutes les 5 min) | Score |
|---|---|---|---:|
| `learnos-events` (drainage) | à chaque passage | à chaque passage ✔ | 7,5 |
| `learnos-kpi` | 1 fois/jour à 1 h | **12 fois** entre 1 h et 1 h 55 (instantané idempotent par jour) | 7,0 |
| `learnos-revue-plans` | 1 fois/jour à 2 h | 12 fois | 7,0 |
| `learnos-alertes-parent` | 1 fois/jour à 6 h | 12 fois (détection idempotente par empreinte) | 7,5 |
| `relances-auto` | 1 fois/jour à 8 h | **12 fois, 12 courriels par facture** (prouvé) | 1,0 |
| `devoirs-retard-check` | 1 fois/jour à 9 h | 12 fois (idempotent d'après le commentaire) | 7,5 |
| `taches-auto-sync` | 1 fois/jour à 7 h | 12 fois | 7,0 |
| `taches-rappels` | 1 fois/jour à 6 h | 12 fois (« une notification par palier », d'après le commentaire) | 7,0 |
| `learnos-verifier-predictions` | **mensuelle**, le 1er à 3 h | **12 fois par jour, tous les jours** | 4,0 |
| `learnos-calibrer-seuils` | **mensuelle**, le 1er à 4 h | **12 fois par jour, tous les jours** : les seuils bougent en permanence | 4,0 |
| `learnos-patterns-absence` | **hebdomadaire** | 12 fois par jour, tous les jours | 5,0 |
| `dispatch-scheduled` | toutes les 5 min | ✔ ; verrou non atomique (AUT-H2) | 6,5 |
| `purge-sites` | 1 fois/jour à 3 h | ✔ | 8,5 |
| `purge-audit-logs` | 1 fois/jour à 4 h (conservation 365 jours) | ✔ | 8,5 |

### 1.2 Bus d'événements LEARNOS (boîte d'envoi `LearnosEvent`)

- **20 types publiés**, chacun associé à un gestionnaire : `note.recorded` (3 gestionnaires en séquence), `absence.recorded`, `seance.cloturee`, `curriculum.imported`, `chapitre.created`, `competence.created`, `edt.cree`, `edt.modifie`, `edt.supprime`, `facture.emise`, `periode.cloturee`, `bulletin.publie`, `evaluation.publiee`, `devoir.corrige`, `kpi.recalculer`, `devoir.enretard`, `prediction.emise`, `candidature.acceptee`, `incident.signale`, `decalage.detecte`.
- **3 types réservés et non publiés** : `note.updated`, `note.deleted`, `evaluation.completed` (`events.ts:37-43`). Ce ne sont **pas** des gestionnaires manquants, contrairement à ce qu'affirmait l'audit précédent : ces événements ne sont jamais émis. Le vrai manque est fonctionnel (IA-M2, étape 6).
- **18 fichiers de gestionnaires, tous testés** : 16 fichiers de test, dont deux regroupent chapitre et compétence d'une part, modification et suppression d'EDT d'autre part.
- **Publication depuis 21 fichiers du code métier.**

### 1.3 Webhooks entrants

| Webhook | Contrôle | Score |
|---|---|---:|
| `webhooks/whatsapp` | HMAC SHA-256 Meta en temps constant ; **accepte tout si le secret manque** | 6,0 |
| `webhooks/sms` | secret partagé en temps constant ; **accepte tout si le secret manque** ; le secret peut transiter dans l'URL | 6,0 |
| `webhooks/resend` | signature Svix ; **accepte tout si le secret manque** | 6,0 |
| `stripe/webhook` | `constructEvent` obligatoire, sans repli (pentest C-01 corrigé) | 9,0 |

## 2. Ce qui est solide

- **Boîte d'envoi transactionnellement simple** : `publishEvent` n'écrit qu'une ligne et ne lève jamais d'exception. LEARNOS ne peut donc pas faire échouer une saisie de notes (`events.ts:298-328`, règle §49-1).
- **Instantané complet dans chaque événement** : un gestionnaire ne relit pas la source, ce qui rend le rejeu fidèle.
- **Garantie « au moins une fois » assumée** et gestionnaires écrits pour être idempotents. Exemple : `bulletin.publie` → `AlerteParent` avec `empreinte` et `skipDuplicates`.
- **Rejeu disponible** (`replayEvents`, par tenant, type et date) et **file d'abandon de fait** : après 5 tentatives, l'événement reste en base avec `lastError` et `eventBacklog()` le compte. **La table de lettres mortes que l'arbre de travail est en train d'ajouter (`learnosEventDeadletter`) fait donc doublon avec l'existant.**
- **Répartiteur unique** (`cron/dispatch`) : une tâche en échec n'empêche pas les suivantes.

## 3. Constats

### AUT-C1 — Critique — Les tâches « à heure fixe » tournent 12 fois dans l'heure, les tâches mensuelles tous les jours

**Preuve.** `crontab.txt:11` appelle `/api/cron/dispatch` toutes les 5 minutes (commit `e6e086c` du 09/09). Le répartiteur ne filtre que sur l'heure UTC (`dispatch/route.ts:224-228` : `t.heures.includes(heure)`), sans mémoriser la dernière exécution. Aucune tâche n'a de notion de jour du mois ni de jour de la semaine, alors que les commentaires annoncent « Mensuelle : le 1er du mois » et « Hebdomadaire ».

**Effets.**
- `relances-auto` : 12 courriels par facture échue et par jour, escalade jusqu'à la « dernière relance avant mise en recouvrement » en 10 minutes. **Prouvé par exécution** (`C-preuves/relances-cron.test.ts`).
- `learnos-calibrer-seuils` et `learnos-verifier-predictions` tournent 12 fois par jour au lieu d'une fois par mois : les seuils de recommandation sont recalibrés en continu sur de petits échantillons, ce qui fausse la boucle d'apprentissage.
- Charge base de données inutile : 11 passages sur 12 refont un travail déjà fait, pour chaque tenant.

### AUT-H1 — Haute — Chaque machine exécute ses propres tâches, sans verrou

`docker-entrypoint.sh` lance supercronic dans **chaque** conteneur, et `fly.toml` autorise plusieurs machines (`min_machines_running = 1`, sans maximum). Dès que Fly démarre une deuxième machine (montée en charge, déploiement progressif), **toutes** les tâches s'exécutent deux fois. Le drainage `drainEvents` n'utilise ni `FOR UPDATE SKIP LOCKED` ni verrou consultatif : deux drainages traitent les mêmes événements en même temps (acceptable pour des gestionnaires idempotents, mais coûteux). Les envois non idempotents (relances, appel) partent en double.

### AUT-H2 — Haute — Le « verrou » des notifications planifiées n'en est pas un

`cron/dispatch-scheduled/route.ts:27-41` : `findMany({ statut: "PLANIFIEE" })` **puis** `updateMany(… "EN_ENVOI")`. Entre les deux, un autre passage peut sélectionner les mêmes lignes, d'où un double envoi. Une notification passée en `EN_ENVOI` puis interrompue par un plantage ou un redémarrage n'est **jamais** reprise : aucun délai d'expiration.

### AUT-H3 — Haute — Webhooks ouverts si un secret manque, y compris en production

`src/lib/webhooks.ts:23-26` et `:47-51`, et `webhooks/resend/route.ts:43-46` : sans secret, `return true`. Un oubli de variable d'environnement ouvre :
- `webhooks/whatsapp` : de faux messages de parents entrent dans le bot, avec le numéro de téléphone comme identité ;
- `webhooks/resend` : falsification des statuts d'envoi (`EmailLog`) ;
- `webhooks/sms` : injection de réponses SMS.

Par ailleurs, `verifyWebhookSecret` accepte le secret dans la chaîne de requête (`?secret=`), qui finit dans les journaux d'accès.

### AUT-M1 — Moyenne — Aucune reprise progressive et aucune alerte sur les abandons

`drainEvents` retente un événement en échec à chaque passage, donc toutes les 5 minutes, puis l'abandonne à la 5ᵉ tentative. Une indisponibilité de la base de 25 minutes fait abandonner des événements, et la seule trace est un `console.error`. `eventBacklog` existe, mais aucun écran ni aucune alerte ne le consulte.

### AUT-M2 — Moyenne — supercronic n'est pas relancé

`docker-entrypoint.sh` affirme en commentaire : *« Si supercronic meurt, il est relancé par la boucle »*. Il n'y a **pas de boucle** : le processus est lancé une fois en arrière-plan (`"$SUPERCRONIC" /app/crontab.txt &`). S'il s'arrête, plus aucune tâche ne tourne, et rien ne le signale : `/api/health` ne vérifie pas la fraîcheur du dernier drainage.

### AUT-M3 — Moyenne — Débit de drainage limité et non mesuré

200 événements toutes les 5 minutes, soit 2 400 par heure. Chaque `note.recorded` enchaîne 3 gestionnaires, chacun faisant plusieurs requêtes à environ 980 ms sur le pooler transaction (mesure de `docs/learnos-etat.md`). Un import d'un trimestre de notes (plusieurs milliers d'événements) crée plusieurs heures de retard, sans visibilité. Et si un drainage dure plus de 5 minutes, le suivant démarre en parallèle (AUT-H1).

### AUT-B1 — Basse — Double déclaration Vercel et Fly

`vercel.json` déclare les mêmes crons que `crontab.txt`. Si les deux plateformes pointent sur la même base, tout s'exécute deux fois. Il faut une seule source.

## 4. Angles morts

1. **Aucun test du répartiteur** (`cron/dispatch`) : ni de la sélection des tâches, ni de leur fréquence.
2. **Aucun journal d'exécution des tâches** (début, fin, durée, résultat) consultable. On ne sait pas quand `relances-auto` a tourné pour la dernière fois.
3. **Aucune gestion des fuseaux** : les heures sont en UTC dans le code, avec des commentaires « = heure de Djibouti ». Un établissement dans un autre pays (les modèles partagés par pays existent déjà) recevrait ses alertes à des heures inadaptées.
4. **Fin d'année et vacances** : les tâches tournent sans consulter `EvenementCalendaire`. Des relances ou des alertes d'absence peuvent partir pendant les vacances.

## 5. Notation détaillée

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 6 | Webhooks ouverts si le secret manque | 10 |
| Exactitude (25 %) | 5 | Fréquences fausses (AUT-C1) | 9,5 |
| Robustesse (15 %) | 6 | Aucun verrou entre machines ; notifications bloquées jamais reprises | 9,5 |
| Tests (15 %) | 8 | Gestionnaires tous testés ; répartiteur et relances non testés | 9,5 |
| Traçabilité (10 %) | 6 | Aucun journal des tâches ; abandons silencieux | 9,5 |
| Maintenabilité (10 %) | 9 | Architecture claire et documentée | 9,5 |
| **Brut** | **6,4** | | |
| **Plafond** | **5,0** | | |

---

## 6. Cahier des charges

### AUT-1 — Planification exacte et exécution unique *(P0, 1,5 j — PR d'urgence)*

**Correctif immédiat, avant tout le reste.** Dans `TACHES`, passer temporairement `relances-auto` à `heures: []` (tâche désactivée) et le déployer. Cela arrête l'hémorragie pendant que MET-4 et la suite d'AUT-1 sont développés.

**Refonte.**
1. Migration additive :
   ```prisma
   model TacheCronExecution {
     id        String   @id @default(cuid())
     nom       String
     creneau   String   // ex. "2026-09-11T08" (quotidienne), "2026-09" (mensuelle), "2026-W37" (hebdomadaire)
     debut     DateTime @default(now())
     fin       DateTime?
     statut    String   // EN_COURS | OK | ECHEC
     resultat  Json?
     erreur    String?
     @@unique([nom, creneau])
     @@map("taches_cron_executions")
   }
   ```
   C'est une table **globale**, sans `tenantId`. L'ajouter à `SITE_PATHS` (`src/lib/site-scope.ts`) avec la valeur `"tenant"`, comme les autres modèles globaux (`calendrierOfficiel`, `module`, lignes 474 et 504), sinon `site-scope.model.test.ts` échoue. Dans `scripts/rls/generate-policies.cjs`, la déclarer accessible au seul contexte système, puis lancer `pnpm rls:generate`.
2. Remplacer `heures: number[] | null` par une **périodicité** explicite :
   ```ts
   type Periodicite =
     | { type: "continue" }
     | { type: "quotidienne"; heureUTC: number }
     | { type: "hebdomadaire"; jourISO: 1|2|3|4|5|6|7; heureUTC: number }
     | { type: "mensuelle"; jour: number; heureUTC: number };
   ```
   Fonction pure `creneauDu(p: Periodicite, maintenant: Date): string | null`, qui renvoie la clé du créneau si la tâche est due, `null` sinon. **Tests unitaires exhaustifs** : bornes d'heure, 1er du mois, semaine ISO, passage d'année.
3. Réclamation atomique : avant d'exécuter une tâche due, `INSERT INTO taches_cron_executions (nom, creneau, statut) VALUES (…, 'EN_COURS') ON CONFLICT (nom, creneau) DO NOTHING RETURNING id`. Pas de ligne renvoyée : la tâche a déjà été prise (par ce passage ou par une autre machine), on l'ignore. En fin d'exécution, mettre à jour `fin`, `statut` et `resultat`. C'est ce qui garantit l'exécution unique **même avec plusieurs machines**.
4. Récupération : une ligne `EN_COURS` depuis plus de 30 minutes est considérée comme morte. Elle passe en `ECHEC` et peut être reprise au passage suivant, avec une nouvelle clé `creneau#reprise1`.
5. Réécrire les périodicités selon l'intention documentée : `verifier-predictions` et `calibrer-seuils` mensuelles le 1er, `patterns-absence` hebdomadaire le lundi, les autres quotidiennes.
6. Supprimer les crons de `vercel.json` si Fly.io est la plateforme retenue (AUT-B1) : **décision d'exploitation**. Sinon, désactiver supercronic sur Vercel. L'essentiel est qu'une seule source déclenche.
7. Comparer `CRON_SECRET` en temps constant (AUTH-7).

**Tests** (`src/app/api/cron/dispatch/dispatch.test.ts`) :
- 12 appels dans la même heure → chaque tâche quotidienne exécutée exactement 1 fois ;
- deux appels simultanés (`Promise.all`) → 1 exécution ;
- le 2 du mois, aucune tâche mensuelle ; le 1er à 3 h, `verifier-predictions` s'exécute ;
- une exécution restée `EN_COURS` pendant 31 minutes est reprise.

**Critère de production.** Requête d'observation après 48 h : `SELECT nom, count(*) FROM taches_cron_executions WHERE debut > now() - interval '24 hours' GROUP BY nom`, puis vérification qu'aucune tâche quotidienne n'a plus d'une exécution `OK` par jour.

### AUT-2 — Drainage sûr et observable *(P1, 1,5 j)*

1. Réclamation des événements par lot, sans collision : dans une transaction, `SELECT id FROM learnos_events WHERE "processedAt" IS NULL AND attempts < 5 AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()) ORDER BY "occurredAt" LIMIT $1 FOR UPDATE SKIP LOCKED`, puis `UPDATE … SET "lockedUntil" = now() + interval '10 minutes'`. Migration additive : `nextAttemptAt`, `lockedUntil`. Vérifier les noms réels des tables et colonnes dans le `@@map` du modèle `LearnosEvent`.
2. Reprise progressive : `nextAttemptAt = now() + 2^tentatives minutes` (1, 2, 4, 8, 16).
3. Alerte : un événement qui atteint 5 tentatives appelle `alerterExploitation("learnos.abandon", { eventId, type, lastError })` (voir INF-4, canal Slack, Telegram ou courriel à l'administrateur de la plateforme).
4. **Abandonner la table `learnosEventDeadletter`** en cours d'ajout dans l'arbre de travail : les événements abandonnés **sont** la file. Ajouter plutôt une page d'administration `/super-admin/learnos` qui liste `eventBacklog()` par tenant, les abandonnés avec `lastError`, et un bouton « rejouer » (`replayEvents` ciblé sur un identifiant, avec audit).
5. `/api/health` renvoie `drainageEnRetard: true` si le plus vieil événement en attente a plus de 15 minutes (voir INF-5).

**Tests.** Deux `drainEvents()` simultanés sur 100 événements → chaque gestionnaire est appelé exactement une fois par événement. Échec transitoire → `nextAttemptAt` respecté. Cinquième échec → alerte appelée.

### AUT-3 — Notifications planifiées : réclamation atomique et reprise *(P1, 0,5 j)*

Remplacer le couple `findMany` + `updateMany` par une seule requête : `UPDATE notifications SET statut = 'EN_ENVOI', "enEnvoiDepuis" = now() WHERE id IN (SELECT id FROM notifications WHERE statut = 'PLANIFIEE' AND "planifieeAt" <= now() ORDER BY "planifieeAt" LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id, "tenantId"`. Remettre en `PLANIFIEE` les lignes `EN_ENVOI` depuis plus de 15 minutes, avec un compteur de tentatives (3 au maximum, puis `ECHEC` et alerte).

**Test.** Deux passages simultanés : chaque notification est envoyée une fois.

### AUT-4 — Webhooks fermés par défaut *(P0, 0,5 j — PR d'urgence)*

1. `verifyMetaSignature`, `verifyWebhookSecret` et `verifySvixSignature` : si le secret manque et `NODE_ENV === "production"`, renvoyer `false` et journaliser une **erreur** (plus un simple avertissement). Garder l'acceptation uniquement si `NODE_ENV !== "production"` **et** `WEBHOOK_DEV_INSECURE=true` (activation explicite).
2. `verifyWebhookSecret` : ne plus lire `?secret=` en production, seulement l'en-tête `x-webhook-secret`. Vérifier auprès du fournisseur SMS qu'il sait envoyer un en-tête. Sinon, conserver le paramètre d'URL mais masquer la chaîne de requête dans les journaux (INF-3).
3. Resend / Svix : vérifier aussi l'horodatage (tolérance de 5 minutes) pour empêcher le rejeu, si ce n'est pas déjà fait dans la suite de `verifySvixSignature`.
4. Démarrage refusé si les secrets manquent (INF-2).

**Tests.** Pour chaque webhook : sans secret en production → 401 ; signature fausse → 401 ; signature juste → 200 ; horodatage de plus de 5 minutes → 401 (Resend).

### AUT-5 — supercronic supervisé *(P2, 0,5 j)*

Remplacer le lancement unique par une boucle de relance dans `docker-entrypoint.sh` :
```sh
( while true; do "$SUPERCRONIC" /app/crontab.txt; echo "[entrypoint] supercronic arrêté (code $?), relance dans 5 s" >&2; sleep 5; done ) &
```
Mieux encore, sur Fly.io : une machine dédiée aux tâches (process group `cron` dans `fly.toml`, avec `[processes] app = "node server.js"` et `cron = "supercronic /app/crontab.txt"`), qui supprime aussi la duplication AUT-H1. Vérifier l'intégrité du binaire au build (`sha1sum -c`), avec l'empreinte publiée par le projet supercronic (INF-6).

### AUT-6 — Calendrier et fuseau des tâches *(P3, 1 j)*

Ajouter `Tenant.fuseauHoraire` (par défaut `Africa/Djibouti`). Les heures d'envoi des tâches tournées vers les familles (alertes, relances, rappels) s'expriment dans le fuseau du tenant. Ne pas envoyer de relance ni d'alerte non urgente pendant une période de vacances (`EvenementCalendaire`).

## 7. Définition de « terminé »

- [ ] Journal `taches_cron_executions` en production : une exécution par créneau, toutes machines confondues, sur 14 jours.
- [ ] Drainage avec `SKIP LOCKED`, reprise progressive, alerte sur abandon, et page d'administration.
- [ ] Webhooks fermés sans secret ; tests au vert.
- [ ] Tests du répartiteur au vert en CI.
