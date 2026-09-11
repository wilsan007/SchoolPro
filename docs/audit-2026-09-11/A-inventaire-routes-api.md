# Annexe A — Inventaire noté des 266 routes API

Généré le 2026-09-11 sur le commit `4976316` (HEAD, hors travail non commité).

## Grille (plafond automatique, puis plafonds d'expert)

Départ 10. Retraits : pas d'authentification (−4) · mutation sans contrôle de rôle (−3) · corps non validé par Zod (−1) · mutation non auditée (−1, suppression −1,5) · aucun test dans le dossier ou un parent (−1) · message d'erreur interne renvoyé (−1) · exemption `require-site-filter` sans justification (−0,5) · fichier > 400 lignes (−0,5).
Les routes publiques par conception (`auth/*`, `webhooks/*`, `cron/*`, `health`, invitations de réinscription, webhook Stripe) ne perdent pas de points d'authentification : leur contrôle propre est jugé par un plafond d'expert.
Un **plafond d'expert** s'applique quand la lecture du code a établi un défaut (identifiant de constat entre parenthèses, détaillé dans le document d'étape).

> Une note automatique élevée n'est **pas** une certification : elle signifie seulement qu'aucun des signaux ci-dessus n'est absent. Le seuil 9,7 exige en plus une revue humaine de la route et un test couvrant ses refus (401/403/400/404).

## Synthèse par domaine

| Domaine | Routes | Moyenne | Minimum | ≥ 9,7 |
|---|---:|---:|---:|---:|
| classeur | 1 | 6.0 | 6.0 | 0 |
| webhooks | 3 | 6.0 | 6.0 | 0 |
| switch-tenant | 1 | 7.0 | 7.0 | 0 |
| stripe | 2 | 7.0 | 5.0 | 0 |
| eleves | 9 | 7.2 | 3.0 | 2 |
| test | 3 | 7.3 | 6.0 | 1 |
| parametres | 9 | 7.9 | 3.0 | 0 |
| parents | 1 | 8.0 | 8.0 | 0 |
| health | 1 | 8.0 | 8.0 | 0 |
| ai | 2 | 8.3 | 8.0 | 0 |
| admissions | 2 | 8.5 | 8.0 | 0 |
| demo-now | 1 | 8.5 | 8.5 | 0 |
| super-admin | 4 | 8.5 | 5.0 | 2 |
| structures | 1 | 8.5 | 8.5 | 0 |
| orientation | 1 | 8.5 | 8.5 | 0 |
| emploi-du-temps | 7 | 8.6 | 7.5 | 2 |
| inscriptions | 3 | 8.7 | 8.0 | 0 |
| depenses | 2 | 8.8 | 8.5 | 0 |
| cours | 2 | 8.8 | 8.5 | 0 |
| budgets | 2 | 8.8 | 8.5 | 0 |
| entretiens | 2 | 8.8 | 8.5 | 0 |
| inventaire | 2 | 8.8 | 8.5 | 0 |
| alumni | 2 | 8.8 | 8.5 | 0 |
| indisponibilites | 2 | 8.8 | 8.5 | 0 |
| disponibilites | 2 | 8.8 | 8.5 | 0 |
| salles | 2 | 8.8 | 8.5 | 0 |
| cron | 5 | 8.8 | 4.0 | 4 |
| taches | 3 | 8.8 | 8.5 | 0 |
| reinscription | 3 | 8.8 | 7.5 | 1 |
| auth | 8 | 8.9 | 3.0 | 5 |
| examens | 4 | 8.9 | 8.5 | 0 |
| curriculum | 10 | 8.9 | 8.5 | 0 |
| facturation | 5 | 8.9 | 6.5 | 2 |
| vie-scolaire | 12 | 8.9 | 5.0 | 4 |
| gouvernance | 6 | 8.9 | 8.5 | 0 |
| import | 8 | 8.9 | 8.0 | 1 |
| notes | 1 | 9.0 | 9.0 | 0 |
| devoirs | 1 | 9.0 | 9.0 | 0 |
| remplacements | 1 | 9.0 | 9.0 | 0 |
| evaluations | 2 | 9.0 | 9.0 | 0 |
| sync | 2 | 9.0 | 9.0 | 0 |
| communication | 2 | 9.0 | 9.0 | 0 |
| mentorat | 2 | 9.0 | 9.0 | 0 |
| sms | 1 | 9.0 | 9.0 | 0 |
| modules | 1 | 9.0 | 9.0 | 0 |
| rh | 6 | 9.2 | 9.0 | 1 |
| messages | 4 | 9.3 | 9.0 | 1 |
| absences | 3 | 9.3 | 9.0 | 1 |
| remises-caisse | 3 | 9.3 | 9.0 | 1 |
| learnos | 43 | 9.4 | 6.0 | 23 |
| mobile | 22 | 9.4 | 6.0 | 16 |
| bulletins | 15 | 9.4 | 5.0 | 9 |
| comparateur | 1 | 9.5 | 9.5 | 0 |
| cahier-journal | 7 | 9.6 | 8.5 | 5 |
| conseil-augmente | 1 | 10.0 | 10.0 | 1 |
| analytics | 1 | 10.0 | 10.0 | 1 |
| dossier-progression | 1 | 10.0 | 10.0 | 1 |
| finances | 2 | 10.0 | 10.0 | 2 |
| factures | 1 | 10.0 | 10.0 | 1 |
| veille-assiduite | 1 | 10.0 | 10.0 | 1 |
| enseignants | 1 | 10.0 | 10.0 | 1 |
| paiements | 1 | 10.0 | 10.0 | 1 |
| switch-role | 1 | 10.0 | 10.0 | 1 |
| switch-site | 1 | 10.0 | 10.0 | 1 |
| user-permissions | 1 | 10.0 | 10.0 | 1 |
| emails | 1 | 10.0 | 10.0 | 1 |
| rapports | 1 | 10.0 | 10.0 | 1 |
| dashboard | 1 | 10.0 | 10.0 | 1 |
| audit | 1 | 10.0 | 10.0 | 1 |

**Toutes routes :** moyenne 8.94 · 97/266 routes à 9,7 ou plus · 21 sous 7.

## Détail (du plus faible au plus fort)

| Score | Route | Méthodes | Motifs |
|---:|---|---|---|
| 3.0 | `/api/eleves/changer-classe` | POST | API-C2 : aucun contrôle de rôle ; historiqueClasse sans tenantId · mutation sans contrôle de rôle · corps non validé (Zod) · mutation non auditée |
| 3.0 | `/api/parametres/annees-scolaires/[id]` | GET,PATCH | API-C1 : tout compte connecté clôture/rouvre/archive l'année · mutation sans contrôle de rôle · corps non validé (Zod) · mutation non auditée |
| 3.0 | `/api/auth/[...nextauth]` | — | AUTH-C1 : update de session forgé → changement de tenant (prouvé) |
| 4.0 | `/api/cron/dispatch` | GET | AUT-C1 : tâches horaires exécutées 12×/h, mensuelles exécutées chaque jour · 6 exemption lint muette |
| 4.5 | `/api/eleves/dispenses` | POST,DELETE | API-H1 : aucun contrôle de rôle (création/suppression de dispenses) · mutation sans contrôle de rôle · corps non validé (Zod) · suppression non auditée |
| 5.0 | `/api/bulletins/generer` | POST | MET-H1/H2/H3 : flottants, réécriture de bulletins publiés, rang sans ex-aequo · mutation non auditée · 1 exemption lint muette |
| 5.0 | `/api/vie-scolaire/convocations` | POST | API-H1 : aucun contrôle de rôle · mutation sans contrôle de rôle · corps non validé (Zod) · mutation non auditée |
| 5.0 | `/api/stripe/checkout` | POST | mutation sans contrôle de rôle · corps non validé (Zod) · mutation non auditée |
| 5.0 | `/api/super-admin/tenants/[id]` | PATCH,DELETE | DON-H2 : suppression définitive d'un établissement sans audit ni garde · suppression non auditée |
| 5.0 | `/api/eleves/upload-photo` | POST | API-H1 : aucun contrôle de rôle · mutation sans contrôle de rôle · corps non validé (Zod) · mutation non auditée |
| 6.0 | `/api/mobile/taches` | GET,PATCH | mutation sans contrôle de rôle · mutation non auditée |
| 6.0 | `/api/classeur` | POST | API-H1 : aucun contrôle de rôle · mutation sans contrôle de rôle · mutation non auditée |
| 6.0 | `/api/eleves/attestation` | POST | API-H1 : aucun contrôle de rôle · mutation sans contrôle de rôle · mutation non auditée |
| 6.0 | `/api/webhooks/resend` | POST,GET | AUT-H3 : fail-open · mutation non auditée |
| 6.0 | `/api/test/telegram` | GET,POST | mutation sans contrôle de rôle · mutation non auditée |
| 6.0 | `/api/learnos/chatbot-direction` | POST | IA-H1 : moteur sous-jacent sans validation de select/include (désactivé) · mutation non auditée |
| 6.0 | `/api/webhooks/whatsapp` | GET,POST | AUT-H3 : signature non vérifiée si le secret manque (fail-open en prod) · mutation non auditée |
| 6.0 | `/api/test/whatsapp` | POST,GET | mutation sans contrôle de rôle · mutation non auditée |
| 6.0 | `/api/webhooks/sms` | POST,GET | AUT-H3 : fail-open · corps non validé (Zod) · mutation non auditée · 1 exemption lint muette |
| 6.0 | `/api/mobile/register-device` | POST | mutation sans contrôle de rôle · mutation non auditée |
| 6.5 | `/api/facturation/paiement` | POST | MET-H5 : contrôle du solde hors transaction (double encaissement) · mutation non auditée |
| 7.0 | `/api/switch-tenant` | POST | mutation sans contrôle de rôle |
| 7.0 | `/api/parametres/classes/export` | GET | API-M : export sans contrôle de rôle |
| 7.5 | `/api/emploi-du-temps/auto-generate` | POST | corps non validé (Zod) · mutation non auditée · 746 lignes |
| 7.5 | `/api/emploi-du-temps/import` | POST | corps non validé (Zod) · mutation non auditée · 429 lignes |
| 7.5 | `/api/emploi-du-temps/[id]` | DELETE,PATCH | corps non validé (Zod) · suppression non auditée |
| 7.5 | `/api/mobile/demo-now` | GET,POST,DELETE | corps non validé (Zod) · suppression non auditée |
| 7.5 | `/api/reinscription/invitation/[id]` | GET | API-M : l'identifiant cuid sert de jeton d'accès, sans expiration |
| 8.0 | `/api/admissions/[id]` | PATCH,DELETE | suppression non auditée · 633 lignes |
| 8.0 | `/api/ai/chat` | POST | mutation non auditée · 1 exemption lint muette · 424 lignes |
| 8.0 | `/api/parents/generer-comptes` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/learnos/intelligence` | GET,POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/learnos/commentaires-bulletin` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/eleves/generer-comptes` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/inscriptions/upload` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/parametres/upload-signature` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/import/eleves/analyze` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/learnos/entrainement` | POST | corps non validé (Zod) · mutation non auditée |
| 8.0 | `/api/health` | GET | INF-B : expose le nombre total d'utilisateurs |
| 8.5 | `/api/import/eleves` | POST | mutation non auditée · 464 lignes |
| 8.5 | `/api/cahier-journal/seances/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/depenses/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/demo-now` | GET,POST,DELETE | suppression non auditée |
| 8.5 | `/api/taches/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/mobile/appel` | POST | mutation non auditée · 1 exemption lint muette |
| 8.5 | `/api/structures` | GET,POST,DELETE | suppression non auditée |
| 8.5 | `/api/curriculum/competences/[id]` | PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/vie-scolaire/fiches-sanitaires/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/cours/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/vie-scolaire/infirmerie/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/orientation` | GET,POST | mutation non auditée · 4 exemption lint muette |
| 8.5 | `/api/budgets/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/entretiens/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/ai/appreciation` | POST | mutation non auditée · 1 exemption lint muette |
| 8.5 | `/api/learnos/questions/[id]` | PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/gouvernance/conseils/[id]` | GET,PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/parametres/regles-appreciation` | GET,POST,PUT,DELETE | suppression non auditée |
| 8.5 | `/api/learnos/preferences-parent` | GET,PATCH | mutation non auditée · 1 exemption lint muette |
| 8.5 | `/api/curriculum/chapitres/[id]` | PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/inventaire/[id]` | PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/examens/[id]` | PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/alumni/[id]` | PATCH,DELETE | suppression non auditée |
| 8.5 | `/api/parametres/calendrier-scolaire/[id]` | DELETE | suppression non auditée |
| 8.5 | `/api/indisponibilites/[id]` | DELETE | suppression non auditée |
| 8.5 | `/api/disponibilites/[id]` | DELETE | suppression non auditée |
| 8.5 | `/api/salles/[id]` | DELETE | suppression non auditée |
| 9.0 | `/api/messages/conversations` | GET,POST | mutation non auditée |
| 9.0 | `/api/notes` | GET,POST | mutation non auditée |
| 9.0 | `/api/curriculum/import` | POST,PUT | mutation non auditée |
| 9.0 | `/api/devoirs` | GET,POST,PATCH | mutation non auditée |
| 9.0 | `/api/learnos/copies/enonces` | POST,PUT | mutation non auditée |
| 9.0 | `/api/inscriptions/[id]` | GET,PATCH | mutation non auditée |
| 9.0 | `/api/remplacements` | GET,POST,PATCH | mutation non auditée |
| 9.0 | `/api/absences/appel` | POST | mutation non auditée |
| 9.0 | `/api/emploi-du-temps` | GET,POST | mutation non auditée |
| 9.0 | `/api/taches` | GET,POST | mutation non auditée |
| 9.0 | `/api/depenses` | GET,POST | mutation non auditée |
| 9.0 | `/api/evaluations/[id]/notes` | GET,PUT | mutation non auditée |
| 9.0 | `/api/learnos/copies/notes` | POST,PUT | mutation non auditée |
| 9.0 | `/api/cahier-journal/seances` | GET,POST | mutation non auditée |
| 9.0 | `/api/mobile/reinscription` | GET,POST | mutation non auditée |
| 9.0 | `/api/emploi-du-temps/bulk-apply` | POST | mutation non auditée |
| 9.0 | `/api/messages/conversations/[id]/messages` | GET,POST | mutation non auditée |
| 9.0 | `/api/eleves` | GET,POST | mutation non auditée |
| 9.0 | `/api/admissions` | GET,POST | mutation non auditée |
| 9.0 | `/api/sync/config` | GET,PUT,POST | mutation non auditée |
| 9.0 | `/api/sync/export-all` | GET | message d'erreur interne renvoyé |
| 9.0 | `/api/remises-caisse/[id]/confirmer` | POST | mutation non auditée |
| 9.0 | `/api/rh/[id]` | PATCH,POST | mutation non auditée |
| 9.0 | `/api/curriculum/evaluations/[id]/competences` | GET,PUT | mutation non auditée |
| 9.0 | `/api/evaluations` | GET,POST | mutation non auditée |
| 9.0 | `/api/vie-scolaire/incidents` | GET,POST | mutation non auditée |
| 9.0 | `/api/bulletins/publier` | POST | mutation non auditée |
| 9.0 | `/api/super-admin/tenants` | GET,POST | mutation non auditée |
| 9.0 | `/api/learnos/propositions/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/communication` | GET,POST | mutation non auditée |
| 9.0 | `/api/vie-scolaire/infirmerie` | GET,POST | mutation non auditée |
| 9.0 | `/api/learnos/questions/combler` | POST | mutation non auditée |
| 9.0 | `/api/curriculum/planification` | PUT | mutation non auditée |
| 9.0 | `/api/auth/2fa` | POST,GET | mutation non auditée |
| 9.0 | `/api/auth/mobile` | POST | mutation non auditée |
| 9.0 | `/api/curriculum/planification-competences` | PUT,GET | mutation non auditée |
| 9.0 | `/api/vie-scolaire/exclusions/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/entretiens` | GET,POST | mutation non auditée |
| 9.0 | `/api/learnos/questions` | GET,POST | mutation non auditée |
| 9.0 | `/api/vie-scolaire/fiches-sanitaires` | GET,POST | mutation non auditée |
| 9.0 | `/api/curriculum/chapitres` | GET,POST | mutation non auditée |
| 9.0 | `/api/import/[type]` | POST | mutation non auditée |
| 9.0 | `/api/remises-caisse` | GET,POST | mutation non auditée |
| 9.0 | `/api/inscriptions` | GET,POST | mutation non auditée |
| 9.0 | `/api/inventaire` | GET,POST | mutation non auditée |
| 9.0 | `/api/budgets` | GET,POST | mutation non auditée |
| 9.0 | `/api/vie-scolaire/incidents/[id]` | PATCH,POST | mutation non auditée |
| 9.0 | `/api/mentorat` | GET,POST | mutation non auditée |
| 9.0 | `/api/cours` | GET,POST | mutation non auditée |
| 9.0 | `/api/import/eleves/annuler` | POST | mutation non auditée |
| 9.0 | `/api/sms/send` | POST | mutation non auditée |
| 9.0 | `/api/alumni` | GET,POST | mutation non auditée |
| 9.0 | `/api/rh/conges/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/curriculum/prerequis` | POST,PATCH | mutation non auditée |
| 9.0 | `/api/bulletins/conseil` | POST | mutation non auditée |
| 9.0 | `/api/messages/audience` | GET,POST | mutation non auditée |
| 9.0 | `/api/curriculum/competences` | POST | mutation non auditée |
| 9.0 | `/api/indisponibilites` | GET,POST | mutation non auditée |
| 9.0 | `/api/examens` | GET,POST | mutation non auditée |
| 9.0 | `/api/facturation/echeancier` | GET,POST | mutation non auditée |
| 9.0 | `/api/import/enseignants/apply` | POST | mutation non auditée |
| 9.0 | `/api/mentorat/[id]` | GET,PATCH | mutation non auditée |
| 9.0 | `/api/parametres/calendrier-scolaire` | GET,POST | mutation non auditée |
| 9.0 | `/api/gouvernance/conseils` | GET,POST | mutation non auditée |
| 9.0 | `/api/reinscription/confirm` | POST | mutation non auditée |
| 9.0 | `/api/parametres/annees-scolaires` | GET,POST | mutation non auditée |
| 9.0 | `/api/rh/conges` | GET,POST | mutation non auditée |
| 9.0 | `/api/gouvernance/reunions` | GET,POST | mutation non auditée |
| 9.0 | `/api/rh/absences` | GET,POST | mutation non auditée |
| 9.0 | `/api/absences/justifier` | POST | mutation non auditée |
| 9.0 | `/api/examens/[id]/sessions` | POST,GET | mutation non auditée |
| 9.0 | `/api/eleves/link-parent` | POST,GET | mutation non auditée |
| 9.0 | `/api/learnos/attestations/[id]` | POST | mutation non auditée |
| 9.0 | `/api/stripe/webhook` | POST | mutation non auditée |
| 9.0 | `/api/gouvernance/resolutions` | GET,POST | mutation non auditée |
| 9.0 | `/api/import/personnel-admin/apply` | POST | mutation non auditée |
| 9.0 | `/api/disponibilites` | GET,POST | mutation non auditée |
| 9.0 | `/api/learnos/plans-lecon` | POST | mutation non auditée |
| 9.0 | `/api/modules` | GET,PATCH | mutation non auditée |
| 9.0 | `/api/gouvernance/resolutions/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/salles` | GET,POST | mutation non auditée |
| 9.0 | `/api/learnos/rubriques` | POST | mutation non auditée |
| 9.0 | `/api/learnos/recommandations/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/rh/absences/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/learnos/questions/generer` | POST | mutation non auditée |
| 9.0 | `/api/curriculum/planification/[chapitreId]` | PATCH | mutation non auditée |
| 9.0 | `/api/learnos/entrainement/[id]/reponse` | POST | mutation non auditée |
| 9.0 | `/api/gouvernance/reunions/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/parametres/periodes-cloture` | PUT | mutation non auditée |
| 9.0 | `/api/facturation/echeancier/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/learnos/plans/[id]` | PATCH | mutation non auditée |
| 9.0 | `/api/import/edt-externes/apply` | POST | mutation non auditée |
| 9.0 | `/api/learnos/releveling` | POST | mutation non auditée |
| 9.0 | `/api/communication/[id]` | PATCH | corps non validé (Zod) |
| 9.0 | `/api/examens/[id]/deliberation` | POST | mutation non auditée |
| 9.0 | `/api/taches/sync` | POST | mutation non auditée |
| 9.0 | `/api/parametres/signature-cachet` | PUT | mutation non auditée |
| 9.5 | `/api/comparateur` | GET | 537 lignes |
| 9.5 | `/api/bulletins/matrice` | GET | 1 exemption lint muette |
| 9.5 | `/api/bulletins/export-excel` | GET | 1 exemption lint muette |
| 9.5 | `/api/mobile/eleves/[id]` | GET | 4 exemption lint muette |
| 9.5 | `/api/bulletins/rapport-classe` | GET | 1 exemption lint muette |
| 9.5 | `/api/learnos/revision-semaine` | GET | 1 exemption lint muette |
| 10.0 | `/api/conseil-augmente` | GET | — |
| 10.0 | `/api/cahier-journal/generer-semaine` | POST | — |
| 10.0 | `/api/learnos/eleves/[id]/evolution` | GET | — |
| 10.0 | `/api/analytics` | GET | — |
| 10.0 | `/api/dossier-progression` | GET | — |
| 10.0 | `/api/finances/export` | GET | — |
| 10.0 | `/api/factures/[id]/pdf` | GET | — |
| 10.0 | `/api/veille-assiduite` | GET | — |
| 10.0 | `/api/enseignants/affectations` | GET,POST,DELETE | — |
| 10.0 | `/api/emploi-du-temps/export` | GET | — |
| 10.0 | `/api/learnos/classes/[id]/competences` | GET | — |
| 10.0 | `/api/super-admin/impersonate` | POST,DELETE | — |
| 10.0 | `/api/vie-scolaire/workflow-sanction` | POST | — |
| 10.0 | `/api/paiements/[id]/recu` | GET | — |
| 10.0 | `/api/bulletins/verrouiller` | POST | — |
| 10.0 | `/api/finances/comptabilite` | GET | — |
| 10.0 | `/api/cahier-journal/seances/[id]/commentaires` | GET,POST,DELETE | — |
| 10.0 | `/api/switch-role` | POST | — |
| 10.0 | `/api/cahier-journal/seances/[id]/fichiers` | POST,DELETE | — |
| 10.0 | `/api/bulletins/[id]` | PUT,DELETE | — |
| 10.0 | `/api/learnos/eleves/[id]/competences` | GET | — |
| 10.0 | `/api/vie-scolaire/exclusions` | GET | — |
| 10.0 | `/api/switch-site` | POST | — |
| 10.0 | `/api/mobile/analytics` | GET | — |
| 10.0 | `/api/learnos/questions/couverture` | GET | — |
| 10.0 | `/api/user-permissions` | GET,POST,DELETE | — |
| 10.0 | `/api/eleves/doublons` | GET | — |
| 10.0 | `/api/mobile/messages` | GET | — |
| 10.0 | `/api/vie-scolaire/historique-disciplinaire` | GET | — |
| 10.0 | `/api/learnos/attestations` | GET | — |
| 10.0 | `/api/mobile/dashboard` | GET | — |
| 10.0 | `/api/absences/feuille-presence` | GET | — |
| 10.0 | `/api/eleves/cartes-scolaires` | GET | — |
| 10.0 | `/api/facturation/tarif` | GET | — |
| 10.0 | `/api/auth/forgot-password` | POST | — |
| 10.0 | `/api/auth/set-password` | POST | — |
| 10.0 | `/api/emails/journal` | GET | — |
| 10.0 | `/api/mobile/facturation-tarif` | GET | — |
| 10.0 | `/api/mobile/competences` | GET | — |
| 10.0 | `/api/rapports` | GET | — |
| 10.0 | `/api/bulletins/annuel` | GET | — |
| 10.0 | `/api/mobile/classes-hierarchie` | GET | — |
| 10.0 | `/api/vie-scolaire/retards-stats` | GET | — |
| 10.0 | `/api/bulletins/check-existing` | GET | — |
| 10.0 | `/api/bulletins/conseil-data` | GET | — |
| 10.0 | `/api/mobile/notes` | GET | — |
| 10.0 | `/api/cron/purge-sites` | GET | — |
| 10.0 | `/api/learnos/alerte-decalage` | GET | — |
| 10.0 | `/api/mobile/cahier-journal` | GET | — |
| 10.0 | `/api/dashboard/absences-chart` | GET | — |
| 10.0 | `/api/cahier-journal/suivi-programme` | GET | — |
| 10.0 | `/api/mobile/factures` | GET | — |
| 10.0 | `/api/mobile/recommandations` | GET | — |
| 10.0 | `/api/cron/purge-audit-logs` | GET | — |
| 10.0 | `/api/bulletins/list` | GET | — |
| 10.0 | `/api/mobile/classes` | GET | — |
| 10.0 | `/api/mobile/emploi-du-temps` | GET | — |
| 10.0 | `/api/auth/reset-password` | POST | — |
| 10.0 | `/api/test/setup-links` | GET | — |
| 10.0 | `/api/mobile/bulletins` | GET | — |
| 10.0 | `/api/mobile/eleves` | GET | — |
| 10.0 | `/api/auth/send-verification` | POST | — |
| 10.0 | `/api/learnos/finance-intelligence` | GET | — |
| 10.0 | `/api/bulletins/preview` | GET | — |
| 10.0 | `/api/cron/dispatch-scheduled` | — | — |
| 10.0 | `/api/mobile/absences` | GET | — |
| 10.0 | `/api/bulletins/annuel-preview` | GET | — |
| 10.0 | `/api/mobile/incidents` | GET | — |
| 10.0 | `/api/audit` | GET | — |
| 10.0 | `/api/learnos/direction-intelligence` | GET | — |
| 10.0 | `/api/learnos/trajectoires-cohortes` | GET | — |
| 10.0 | `/api/rh` | GET | — |
| 10.0 | `/api/learnos/efficacite-pedagogique` | GET | — |
| 10.0 | `/api/bulletins/[id]/historique` | GET | — |
| 10.0 | `/api/learnos/climat-bien-etre` | GET | — |
| 10.0 | `/api/reinscription/invitations` | GET | — |
| 10.0 | `/api/auth/verify-email` | POST | — |
| 10.0 | `/api/facturation/existing` | GET | — |
| 10.0 | `/api/learnos/couverture-remplacements` | GET | — |
| 10.0 | `/api/learnos/engagement-parental` | GET | — |
| 10.0 | `/api/learnos/equite-inclusion` | GET | — |
| 10.0 | `/api/cahier-journal/tableau-bord/[seanceId]` | GET | — |
| 10.0 | `/api/import/modele/[type]` | GET | — |
| 10.0 | `/api/messages/recipients` | GET | — |
| 10.0 | `/api/learnos/alumni-intelligence` | GET | — |
| 10.0 | `/api/remises-caisse/[id]` | GET | — |
| 10.0 | `/api/learnos/propositions` | GET | — |
| 10.0 | `/api/learnos/graphe-curriculum` | GET | — |
| 10.0 | `/api/cron/learnos-events` | GET | — |
| 10.0 | `/api/learnos/risque-decrochage` | GET | — |
| 10.0 | `/api/learnos/clustering-eleves` | GET | — |
| 10.0 | `/api/learnos/entrainement/[id]` | GET | — |
| 10.0 | `/api/emploi-du-temps/suggest` | GET | — |
| 10.0 | `/api/learnos/courbe-oubli` | GET | — |
| 10.0 | `/api/learnos/attestations/ouvertes` | GET | — |
| 10.0 | `/api/learnos/simulation-remediation` | GET | — |
| 10.0 | `/api/super-admin/impersonate/status` | GET | — |
