# EcolPro — Contexte de développement (reprise de session)

> **Objectif :** SaaS multi-tenant de gestion scolaire, marché africain francophone.  
> **Stack :** Next.js 15 (App Router) · Prisma 6 · PostgreSQL · NextAuth v5 · Tailwind CSS · shadcn/ui · TypeScript strict  
> **Dossier projet :** `/Users/awalehosman/Claude/Projects/logiciel EcolPro`  
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

## Modules RESTANTS à construire 🔲

> Continuer dans cet ordre de priorité :

### 1. M25 — Communication & Marketing école
- Route : `/communication`
- Envoi de notifications groupées (tous parents, toutes classes, niveau)
- Modèle Prisma : `Notification` (titre, contenu, cible, canal: email/sms/push, statut)

### 2. M26 — Reporting officiel & Statistiques
- Route : `/rapports`
- Génération de rapports PDF officiels : palmarès, statistiques annuelles, rapport d'inspection
- Utilise le skill `pdf` pour les exports

### 3. M16 — LMS intégré e-Learning
- Route : `/cours`
- Création de cours par les enseignants (titre, description, fichiers, liens vidéo)
- Accès élèves/parents
- Nouveau modèle Prisma : `Cours`, `ContenuCours`, `ProgressionEleve`

### 4. M27 — Orientation & Parcours élève
- Route : `/orientation`
- Suivi du parcours scolaire pluriannuel d'un élève
- Recommandations d'orientation par filière selon moyennes

### 5. M29+M30 — Mode hors-ligne & SMS/WhatsApp
- Service worker pour PWA offline
- Intégration Twilio/Africa's Talking pour SMS
- Intégration WhatsApp Business API

### 6. M32+M33 — Alumni & Inventaire
- Alumni : annuaire anciens élèves, suivi post-diplôme
- Inventaire : gestion matériel scolaire, bibliothèque

### 7. M35 — Super Admin & Onboarding SaaS
- Route : `/super-admin` (SUPER_ADMIN uniquement)
- Tableau de bord de tous les tenants, création école, gestion plans
- Onboarding guidé pour nouveaux établissements

### 8. M36+M37 — App mobile & Intégrations
- React Native / Expo
- Intégrations : Wave Money, Orange Money, Google Classroom

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
cd "/Users/awalehosman/Claude/Projects/logiciel EcolPro"
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

**Commencer par :** M25 Communication (notifications groupées), puis M26 Rapports PDF, puis M16 LMS.

Le projet est dans `/Users/awalehosman/Claude/Projects/logiciel EcolPro`.  
Utiliser le dossier workspace connecté pour lire/écrire les fichiers directement.
