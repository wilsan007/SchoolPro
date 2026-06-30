# EcolPro — Contexte de développement (reprise de session)

> **Objectif :** SaaS multi-tenant de gestion scolaire, marché africain francophone.  
> **Stack :** Next.js 15 (App Router) · Prisma 6 · PostgreSQL · NextAuth v5 · Tailwind CSS · shadcn/ui · TypeScript strict  
> **Dossier projet :** `/Users/awalehosman/Documents/logiciel EcolPro`  
> **URL démo :** `lycee-demo.ecolpro.app` — slug `lycee-demo`, pays `SN`, devise `XOF`

---

## Identifiants de démonstration

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Admin | admin@lycee-demo.ecolpro.app | Demo@2026! |
| Enseignant | enseignant@lycee-demo.ecolpro.app | Demo@2026! |
| Parent | parent@lycee-demo.ecolpro.app | Demo@2026! |

---

## Architecture clé

- **Multi-tenant** : isolation par `tenantId` (row-level) sur chaque modèle Prisma
- **Auth** : NextAuth v5 JWT, bcrypt, RBAC 11 rôles (`Role` enum)
- **Subdomain** : `lycee-demo.ecolpro.app` → slug détecté dans `src/lib/tenant.ts`
- **Middleware** : `src/middleware.ts` — routes publiques : `/login`, `/register`, `/api/auth`, `/`, `/_next`
- **Seed** : `prisma/seed.ts` — 1 tenant, 3 users, 6 matières, 3 périodes T1/T2/T3, 1 classe "Terminale A1", 10 élèves

---

## Modules TERMINÉS ✅

### Fondation
| Fichier | Description |
|---------|-------------|
| `package.json` | next@15, react@19, prisma@6, next-auth@5-beta, zod, bcryptjs, recharts, sonner, date-fns |
| `prisma/schema.prisma` | 30+ modèles complets (voir liste ci-dessous) |
| `prisma/seed.ts` | Données de démonstration complètes |
| `src/lib/auth.ts` | NextAuth v5 JWT + Credentials provider |
| `src/lib/tenant.ts` | Détection subdomain/domaine custom |
| `src/middleware.ts` | Auth guard + redirect /login |
| `src/lib/utils.ts` | cn, formatDate, timeAgo, formatCurrency (XOF), calculerMoyenne, getInitials… |

### Modèles Prisma (schema.prisma)
`Tenant`, `AnneesScolaires`, `Periode`, `User`, `Account`, `Session`, `VerificationToken`, `Classe`, `Matiere`, `Eleve`, `Parent`, `EleveParent`, `Enseignant`, `EmploiTemps`, `Absence`, `Note`, `Bulletin`, `Examen`, `SessionExamen`, `Facture`, `Paiement`, `Document`, `Evenement`, `Conversation`, `ConversationParticipant`, `Message`, `Incident`, `Sanction`, **`FicheRH`**, **`BulletinPaie`**, **`Candidature`**

### UI Components
`src/components/ui/` : `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `avatar.tsx`  
`src/components/layout/` : `Sidebar.tsx` (collapsible, avec Admissions + RH), `Header.tsx` (dark mode, notifs, user menu)

### Pages & Modules

| Module | Route | Fichiers clés |
|--------|-------|--------------|
| Landing page | `/` | `src/app/page.tsx` |
| Login | `/login` | `src/app/(auth)/login/page.tsx` |
| Dashboard | `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` + 4 composants |
| Élèves | `/eleves` | `ElevesTable.tsx`, `ElevesStats.tsx` · API `GET/POST /api/eleves` |
| Absences | `/absences` | `AbsencesList.tsx`, `AbsencesStats.tsx` |
| Appel numérique | `/absences/appel` | `AppelInterface.tsx` · API `POST /api/absences/appel` |
| Notes | `/notes` | `NotesOverview.tsx` · API `GET/POST /api/notes` |
| **Bulletins PDF** | `/notes/bulletins` | `BulletinsManager.tsx`, `BulletinPreview.tsx`, `ConseilDeClasse.tsx` |
| **Examens** | `/examens` | `ExamensManager.tsx` · API CRUD + sessions + délibérations |
| **Emploi du temps** | `/emploi-du-temps` | `EmploiDuTempsView.tsx` · grille horaire visuelle, détection chevauchement |
| **Messagerie** | `/messages` | `MessagerieView.tsx` · conversations multi-participants |
| **Vie scolaire** | `/vie-scolaire` | `VieScolaireView.tsx` · incidents, sanctions, gravité 1-3 |
| **Parents (ENT)** | `/parents` | `ParentsView.tsx` · liste parents, enfants liés, moyenne, absences, bulletins, badge ENT |
| **Admissions** | `/admissions` | `AdmissionsView.tsx` · pipeline candidatures, workflow 6 statuts |
| **RH & Paie** | `/rh` | `RHView.tsx` · fiches RH, contrats, heures, bulletins de paie |
| **Analytics** | `/analytics` | `AnalyticsView.tsx` · KPIs, graphiques Recharts, Top/Bottom 5, risque décrochage |

### APIs complètes
```
POST /api/absences/appel
GET|POST /api/eleves
GET|POST /api/notes
POST /api/bulletins/generer
POST /api/bulletins/publier
POST /api/bulletins/conseil
GET  /api/bulletins/conseil-data
GET  /api/bulletins/preview
GET|POST /api/examens
GET|PATCH|DELETE /api/examens/[id]
GET|POST /api/examens/[id]/sessions
POST /api/examens/[id]/deliberation
GET|POST /api/emploi-du-temps
DELETE|PATCH /api/emploi-du-temps/[id]
GET|POST /api/messages/conversations
GET|POST /api/messages/conversations/[id]/messages
GET|POST /api/vie-scolaire/incidents
PATCH|POST /api/vie-scolaire/incidents/[id]
GET|POST /api/admissions
PATCH|DELETE /api/admissions/[id]
GET /api/rh
PATCH|POST /api/rh/[id]
GET /api/analytics
```

---

## Modules construits depuis (désormais TERMINÉS ✅)

> ⚠️ Les 8 modules listés autrefois comme « à construire » sont **tous réalisés**.

| Module | Route | État |
|--------|-------|------|
| M25 Communication | `/communication` | ✅ + **envoi réel** email/SMS/push (voir Infra) |
| M26 Rapports & stats | `/rapports` | ✅ |
| M16 LMS e-Learning | `/cours` | ✅ (`Cours`, `ContenuCours`, `ProgressionEleve`) |
| M27 Orientation & parcours | `/orientation` | ✅ (`ParcoursScolaire`) |
| M29/M30 Offline & SMS/WhatsApp | PWA + webhooks | ✅ (SW + `/api/webhooks/sms` `/whatsapp` signés) |
| M32/M33 Alumni & Inventaire | `/alumni` `/inventaire` | ✅ |
| M35 Super Admin | `/super-admin` | ✅ (RBAC SUPER_ADMIN) |
| M36 App mobile | Capacitor | ✅ coque native iOS/Android (voir `MOBILE_DEPLOIEMENT.md`) |

---

## Infrastructure pro (sécurité & ops)

- **RBAC** — `src/lib/rbac.ts` : matrice permissions par rôle (`<module>:<action>`),
  helper `checkPermission(role, perm)` appliqué sur les routes API mutantes.
  `authorize()` / `authorizeSuperAdmin()` disponibles.
- **Notifications réelles** — `src/lib/notifications/` : `dispatch.ts` (résolution
  destinataires par cible + envoi), `email.ts` (Resend), `push.ts` (FCM HTTP v1
  signé avec `jose`, Android+iOS). Repli « simulation » si creds absents.
- **Cron** — `/api/cron/dispatch-scheduled` (protégé `CRON_SECRET`) + `vercel.json`
  (toutes les 5 min) pour les notifications `PLANIFIEE`.
- **Webhooks signés** — `src/lib/webhooks.ts` : HMAC Meta (WhatsApp) + secret
  partagé (SMS). Exemptés d'auth de session dans `src/middleware.ts`.
- **Fiche élève** — `/eleves/[id]` + `EleveDetailView` (onglets infos/notes/
  absences/discipline/finances/parcours).
- **Build prod** — `next build` vert (Next.js 15 : `params`/`searchParams` async).

## Modules RESTANTS / pistes 🔲

- **Notifications planifiées** : le cron existe mais dépend d'un ordonnanceur
  externe configuré (Vercel Cron ou autre) + `CRON_SECRET` en prod.
- **Intégrations paiement** : Wave Money / Orange Money (modèle `Paiement` prêt,
  pas d'appel API réel) ; Stripe (champs tenant présents, pas branché).
- **Déploiement & stores** : build web → Vercel ; mobile → comptes Apple (99 $/an)
  et Google Play (25 $) requis, + Xcode/Android Studio. Voir `MOBILE_DEPLOIEMENT.md`.
- **Tests automatisés** : aucun pour l'instant (pas de Jest/Playwright).

---

## Points d'attention techniques

### Schema Prisma — migration nécessaire
Depuis la dernière session, 5 nouveaux modèles ont été ajoutés au schema :
- `FicheRH`, `BulletinPaie` (module RH)
- `Candidature` (module Admissions)

**Avant de démarrer, exécuter :**
```bash
npx prisma migrate dev --name "add_rh_admissions"
npx prisma generate
```

> La migration précédente `add_messaging_incidents` est supposée déjà appliquée.  
> Si ce n'est pas le cas, exécuter d'abord :  
> `npx prisma migrate dev --name "add_messaging_incidents"`

### Sidebar — liens disponibles
Les routes sont **sans** préfixe `/dashboard` :
- ✅ `/eleves`, `/absences`, `/notes`, `/examens`, `/emploi-du-temps`
- ✅ `/messages`, `/vie-scolaire`, `/parents`
- ✅ `/admissions`, `/rh`, `/analytics`
- ✅ `/dashboard` (uniquement la page d'accueil)

### Conventions de code
- Toutes les API routes : auth via `const session = await auth()`, vérif `tenantId`
- Zod pour validation entrées API
- `toast.success/error` (sonner) pour feedback UI
- Composants Client : `"use client"` + `useTransition` pour les mutations
- Composants Server : fetch direct Prisma dans les pages `page.tsx`
- Pas de `localStorage` dans les composants
- Analytics : `AnalyticsView` est un Client Component qui fetch `/api/analytics` au montage (recharts ne fonctionne pas en SSR)

---

## Commandes utiles

```bash
# Installer les dépendances
cd "/Users/awalehosman/Documents/logiciel EcolPro"
npm install

# Générer le client Prisma + migrer
npx prisma migrate dev --name "add_rh_admissions"
npx prisma generate

# Seed la base de données
npx prisma db seed

# Démarrer le serveur de développement
npm run dev

# Vérifier les types TypeScript
node_modules/.bin/tsc --noEmit
```

---

## Prochaine instruction pour Claude

Tous les modules fonctionnels sont construits. Priorités restantes (ordre conseillé) :
1. **Déploiement web** (Vercel) + configuration des secrets prod (`CRON_SECRET`,
   `RESEND_API_KEY`, `FCM_SERVICE_ACCOUNT`, `WHATSAPP_APP_SECRET`, `AT_*`).
2. **Publication stores** via Capacitor — voir `MOBILE_DEPLOIEMENT.md` (nécessite
   comptes Apple/Google + Xcode/Android Studio sur la machine).
3. **Intégrations paiement** Wave / Orange Money (réel) et Stripe.
4. **Tests automatisés** (Jest/Playwright) — actuellement absents.

Le projet est dans `/Users/awalehosman/Documents/logiciel EcolPro`.
Vérifier après toute modif : `node_modules/.bin/tsc --noEmit` puis `npm run build`.

> ⚠️ Vérifier `npx prisma migrate status` : le schéma contient `DeviceToken`
> (mobile push) et plusieurs modèles récents — appliquer les migrations en attente.
