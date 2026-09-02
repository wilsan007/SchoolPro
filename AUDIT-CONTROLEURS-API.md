# Audit des controleurs API — SchoolPro

Date : 2026-08-28

> Audit heuristique (regex v2) portant sur 262 routes API.
> Les indicateurs sont : A=auth, T=tenantId, S=siteId, N=annee scolaire, Z=validation Zod, R=rate-limit.
> O = pattern detecte, X = pattern absent, N/A = non applicable (route publique, cron, webhook).
> Score : somme des 6 controles presents (max 6).

## Resume
- TOTAL = 262
- AVEC_AUTH = 221
- AVEC_ZOD = 148
- AVEC_TENANT = 247
- AVEC_SITE = 166
- AVEC_ANNEE = 91
- AVEC_RATE = 11
- SCORE6 = 1

## Methodologie

Cet audit est un scan automatique par expression reguliere. Il detecte la presence des patterns suivants :

- Auth : appel a auth(), getServerSession, checkPermission ou authorize().
- Tenant : utilisation de tenantId (propriete shorthand incluse).
- Site : utilisation de siteFilter, siteWhere ou siteId.
- Annee : appel a getAnneeCourante, anneeActive, anneeCouranteLibelle, anneeActiveId, ou champ annee.
- Zod : import zod ou appels z.object, z.string, z.number, z.enum, etc.
- Rate : appel a rateLimit, limiter, RateLimit.

## Routes prioritaires (score <= 2)

| Fichier | Methodes | Auth | Tenant | Site | Annee | Zod | Rate | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| src/app/api/auth/[...nextauth]/route.ts |  | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/auth/forgot-password/route.ts | POST | AX | TX | SX | NX | ZO | RO | score=2 |
| src/app/api/auth/reset-password/route.ts | POST | AX | TX | SX | NX | ZO | RO | score=2 |
| src/app/api/auth/set-password/route.ts | POST | AO | TX | SX | NX | ZO | RX | score=2 |
| src/app/api/auth/verify-email/route.ts | POST | AX | TX | SX | NX | ZO | RO | score=2 |
| src/app/api/cron/dispatch-scheduled/route.ts |  | AX | TO | SX | NX | ZX | RX | score=2 |
| src/app/api/cron/dispatch/route.ts | GET | AX | TX | SX | NX | ZO | RX | score=1 |
| src/app/api/cron/learnos-events/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/cron/purge-audit-logs/route.ts | GET | AX | TO | SX | NX | ZX | RX | score=2 |
| src/app/api/demo-now/route.ts | GET,POST,DELETE | AO | TX | SX | NX | ZO | RX | score=2 |
| src/app/api/health/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/mobile/demo-now/route.ts | GET,POST,DELETE | AX | TX | SX | NX | ZX | RX | score=0 |
| src/app/api/mobile/register-device/route.ts | POST | AX | TO | SX | NX | ZO | RX | score=2 |
| src/app/api/parametres/classes/export/route.ts | GET | AX | TX | SX | NO | ZX | RX | score=2 |
| src/app/api/reinscription/confirm/route.ts | POST | AX | TO | SX | NX | ZX | RO | score=2 |
| src/app/api/reinscription/invitation/[id]/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/stripe/webhook/route.ts | POST | AX | TO | SX | NX | ZX | RX | score=1 |
| src/app/api/super-admin/impersonate/status/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/super-admin/tenants/[id]/route.ts | PATCH,DELETE | AX | TX | SX | NX | ZO | RX | score=1 |
| src/app/api/taches/sync/route.ts | POST | AO | TO | SX | NX | ZX | RX | score=2 |
| src/app/api/webhooks/sms/route.ts | GET,POST | AX | TO | SX | NX | ZX | RX | score=1 |
| src/app/api/webhooks/whatsapp/route.ts | GET,POST | AX | TX | SX | NX | ZX | RX | score=0 |

## Liste complete des non-conformites

| Fichier | Methodes | Auth | Tenant | Site | Annee | Zod | Rate | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| src/app/api/absences/justifier/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/ai/appreciation/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/ai/chat/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/alumni/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/audit/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/auth/2fa/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/auth/[...nextauth]/route.ts |  | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/auth/forgot-password/route.ts | POST | AX | TX | SX | NX | ZO | RO | score=2 |
| src/app/api/auth/mobile/route.ts | POST | AX | TO | SX | NX | ZO | RO | score=3 |
| src/app/api/auth/reset-password/route.ts | POST | AX | TX | SX | NX | ZO | RO | score=2 |
| src/app/api/auth/send-verification/route.ts | POST | AO | TO | SX | NX | ZO | RO | score=4 |
| src/app/api/auth/set-password/route.ts | POST | AO | TX | SX | NX | ZO | RX | score=2 |
| src/app/api/auth/verify-email/route.ts | POST | AX | TX | SX | NX | ZO | RO | score=2 |
| src/app/api/bulletins/[id]/historique/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/bulletins/[id]/route.ts | PUT,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/bulletins/annuel-preview/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/bulletins/annuel/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/bulletins/check-existing/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/bulletins/conseil-data/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/bulletins/list/route.ts | GET | AO | TO | SX | NO | ZX | RX | score=4 |
| src/app/api/bulletins/preview/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/bulletins/rapport-classe/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/cahier-journal/seances/[id]/commentaires/route.ts | GET,POST,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/cahier-journal/seances/[id]/fichiers/route.ts | POST,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/cahier-journal/suivi-programme/route.ts | GET | AO | TO | SX | NO | ZX | RX | score=4 |
| src/app/api/cahier-journal/tableau-bord/[seanceId]/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/classeur/route.ts | POST | AO | TO | SX | NO | ZO | RX | score=4 |
| src/app/api/communication/[id]/route.ts | PATCH | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/cours/[id]/route.ts | GET,PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/cours/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/cron/dispatch-scheduled/route.ts |  | AX | TO | SX | NX | ZX | RX | score=2 |
| src/app/api/cron/dispatch/route.ts | GET | AX | TX | SX | NX | ZO | RX | score=1 |
| src/app/api/cron/learnos-events/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/cron/purge-audit-logs/route.ts | GET | AX | TO | SX | NX | ZX | RX | score=2 |
| src/app/api/cron/purge-sites/route.ts | GET | AX | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/curriculum/chapitres/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/chapitres/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/competences/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/competences/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/evaluations/[id]/competences/route.ts | GET,PUT | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/import/route.ts | POST,PUT | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/planification/[chapitreId]/route.ts | PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/curriculum/prerequis/route.ts | POST,PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/demo-now/route.ts | GET,POST,DELETE | AO | TX | SX | NX | ZO | RX | score=2 |
| src/app/api/disponibilites/[id]/route.ts | DELETE | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/disponibilites/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/dossier-progression/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/eleves/attestation/route.ts | POST | AO | TO | SX | NO | ZO | RX | score=4 |
| src/app/api/eleves/changer-classe/route.ts | POST | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/eleves/dispenses/route.ts | POST,DELETE | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/eleves/doublons/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/eleves/generer-comptes/route.ts | POST | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/eleves/link-parent/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/eleves/upload-photo/route.ts | POST | AO | TO | SX | NX | ZX | RO | score=3 |
| src/app/api/emploi-du-temps/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/emploi-du-temps/auto-generate/route.ts | POST | AO | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/emploi-du-temps/suggest/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/enseignants/affectations/route.ts | GET,POST,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/entretiens/[id]/route.ts | GET,PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/entretiens/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/examens/[id]/deliberation/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/examens/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/examens/[id]/sessions/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/facturation/echeancier/[id]/route.ts | PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/facturation/echeancier/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/facturation/paiement/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/factures/[id]/pdf/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/gouvernance/conseils/[id]/route.ts | GET,PATCH,DELETE | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/gouvernance/conseils/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/gouvernance/resolutions/[id]/route.ts | PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/gouvernance/resolutions/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/gouvernance/reunions/[id]/route.ts | PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/gouvernance/reunions/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/health/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/import/[type]/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/import/eleves/analyze/route.ts | POST | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/import/eleves/annuler/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/import/modele/[type]/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/import/personnel-admin/apply/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/indisponibilites/[id]/route.ts | DELETE | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/indisponibilites/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/inscriptions/[id]/route.ts | GET,PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/inscriptions/upload/route.ts | POST | AO | TO | SO | NX | ZX | RO | score=4 |
| src/app/api/inventaire/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/inventaire/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/alerte-decalage/route.ts | GET | AO | TO | SX | NO | ZX | RX | score=4 |
| src/app/api/learnos/alumni-intelligence/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/attestations/[id]/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/attestations/ouvertes/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/attestations/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/learnos/chatbot-direction/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/climat-bien-etre/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/clustering-eleves/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/commentaires-bulletin/route.ts | POST | AO | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/learnos/copies/notes/route.ts | POST,PUT | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/courbe-oubli/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/couverture-remplacements/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/direction-intelligence/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/learnos/efficacite-pedagogique/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/eleves/[id]/competences/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/learnos/engagement-parental/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/entrainement/[id]/reponse/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/entrainement/[id]/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/entrainement/route.ts | POST | AO | TO | SX | NO | ZX | RX | score=3 |
| src/app/api/learnos/equite-inclusion/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/finance-intelligence/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/graphe-curriculum/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/intelligence/route.ts | GET,POST | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/learnos/plans-lecon/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/plans/[id]/route.ts | PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/preferences-parent/route.ts | GET,PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/propositions/[id]/route.ts | PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/propositions/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/questions/[id]/route.ts | PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/questions/combler/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/questions/couverture/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/learnos/questions/generer/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/questions/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/recommandations/[id]/route.ts | PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/learnos/releveling/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/revision-semaine/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/learnos/risque-decrochage/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/rubriques/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/learnos/simulation-remediation/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/learnos/trajectoires-cohortes/route.ts | GET | AO | TO | SX | NX | ZX | RX | score=3 |
| src/app/api/mentorat/[id]/route.ts | GET,PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/mentorat/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/messages/audience/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/messages/conversations/[id]/messages/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/messages/recipients/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/mobile/absences/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/analytics/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/appel/route.ts | POST | AX | TO | SO | NO | ZO | RX | score=4 |
| src/app/api/mobile/bulletins/route.ts | GET | AX | TO | SX | NO | ZX | RX | score=3 |
| src/app/api/mobile/cahier-journal/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/classes-hierarchie/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/classes/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/competences/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/dashboard/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/demo-now/route.ts | GET,POST,DELETE | AX | TX | SX | NX | ZX | RX | score=0 |
| src/app/api/mobile/eleves/[id]/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/eleves/route.ts | GET | AX | TO | SX | NO | ZO | RX | score=3 |
| src/app/api/mobile/emploi-du-temps/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/facturation-tarif/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/factures/route.ts | GET | AX | TO | SX | NO | ZX | RX | score=3 |
| src/app/api/mobile/incidents/route.ts | GET | AX | TO | SX | NO | ZX | RX | score=3 |
| src/app/api/mobile/messages/route.ts | GET | AX | TO | SO | NX | ZO | RX | score=3 |
| src/app/api/mobile/notes/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/recommandations/route.ts | GET | AX | TO | SO | NO | ZX | RX | score=4 |
| src/app/api/mobile/register-device/route.ts | POST | AX | TO | SX | NX | ZO | RX | score=2 |
| src/app/api/mobile/reinscription/route.ts | GET,POST | AX | TO | SX | NO | ZO | RX | score=3 |
| src/app/api/mobile/taches/route.ts | GET,PATCH | AX | TO | SO | NX | ZO | RX | score=3 |
| src/app/api/modules/route.ts | GET,PATCH | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/paiements/[id]/recu/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/parametres/annees-scolaires/[id]/route.ts | GET,PATCH | AO | TO | SX | NO | ZX | RX | score=3 |
| src/app/api/parametres/annees-scolaires/route.ts | GET,POST | AO | TO | SX | NO | ZO | RX | score=4 |
| src/app/api/parametres/calendrier-scolaire/[id]/route.ts | DELETE | AO | TO | SX | NO | ZO | RX | score=4 |
| src/app/api/parametres/calendrier-scolaire/route.ts | GET,POST | AO | TO | SX | NO | ZO | RX | score=4 |
| src/app/api/parametres/classes/export/route.ts | GET | AX | TX | SX | NO | ZX | RX | score=2 |
| src/app/api/parametres/periodes-cloture/route.ts | PUT | AO | TO | SX | NO | ZO | RX | score=4 |
| src/app/api/parametres/regles-appreciation/route.ts | GET,POST,PUT,DELETE | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/parametres/signature-cachet/route.ts | PUT | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/parametres/upload-signature/route.ts | POST | AO | TO | SX | NX | ZX | RO | score=3 |
| src/app/api/parents/generer-comptes/route.ts | POST | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/reinscription/confirm/route.ts | POST | AX | TO | SX | NX | ZX | RO | score=2 |
| src/app/api/reinscription/invitation/[id]/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/reinscription/invitations/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/remises-caisse/[id]/confirmer/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/remises-caisse/[id]/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/remises-caisse/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/rh/absences/[id]/route.ts | PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/rh/absences/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/rh/conges/[id]/route.ts | PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/rh/conges/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/salles/[id]/route.ts | DELETE | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/salles/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/sms/send/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/stripe/checkout/route.ts | POST | AO | TO | SO | NX | ZX | RO | score=4 |
| src/app/api/stripe/webhook/route.ts | POST | AX | TO | SX | NX | ZX | RX | score=1 |
| src/app/api/structures/route.ts | GET,POST,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/super-admin/impersonate/route.ts | POST,DELETE | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/super-admin/impersonate/status/route.ts | GET | AX | TX | SX | NX | ZX | RX | score=1 |
| src/app/api/super-admin/tenants/[id]/route.ts | PATCH,DELETE | AX | TX | SX | NX | ZO | RX | score=1 |
| src/app/api/super-admin/tenants/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/switch-role/route.ts | POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/switch-site/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/switch-tenant/route.ts | POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/sync/config/route.ts | GET,POST,PUT | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/sync/export-all/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/taches/sync/route.ts | POST | AO | TO | SX | NX | ZX | RX | score=2 |
| src/app/api/test/setup-links/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/test/telegram/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/test/whatsapp/route.ts | GET,POST | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/user-permissions/route.ts | GET,POST,DELETE | AO | TO | SX | NX | ZO | RX | score=3 |
| src/app/api/vie-scolaire/convocations/route.ts | POST | AO | TO | SO | NX | ZX | RX | score=3 |
| src/app/api/vie-scolaire/exclusions/[id]/route.ts | PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/vie-scolaire/exclusions/route.ts | GET | AO | TO | SO | NX | ZX | RX | score=4 |
| src/app/api/vie-scolaire/fiches-sanitaires/[id]/route.ts | GET,PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/vie-scolaire/fiches-sanitaires/route.ts | GET,POST | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/vie-scolaire/incidents/[id]/route.ts | POST,PATCH | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/vie-scolaire/infirmerie/[id]/route.ts | GET,PATCH,DELETE | AO | TO | SO | NX | ZO | RX | score=4 |
| src/app/api/webhooks/sms/route.ts | GET,POST | AX | TO | SX | NX | ZX | RX | score=1 |
| src/app/api/webhooks/whatsapp/route.ts | GET,POST | AX | TX | SX | NX | ZX | RX | score=0 |