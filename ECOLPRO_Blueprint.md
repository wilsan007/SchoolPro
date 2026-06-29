# EcolPro — Blueprint Complet du Logiciel SaaS de Gestion Scolaire
> Version 1.0 | Architecture Multi-Tenant | Niveau Enterprise

---

## VISION PRODUIT

EcolPro est une plateforme SaaS multi-tenant de nouvelle génération pour la gestion d'établissements scolaires (écoles primaires, collèges, lycées, universités, centres de formation). Elle remplace les outils fragmentés par un écosystème unifié, sécurisé, et accessible depuis n'importe quel appareil.

**Positionnement concurrentiel :** Meilleur que PowerSchool, Skolengo, Pronote et Eduka — en termes de modernité UX, profondeur fonctionnelle, et architecture cloud-native.

---

## PARTIE 1 — ARCHITECTURE TECHNIQUE

### 1.1 Architecture Multi-Tenant

```
┌──────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└──────────────────┬───────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   CDN (CloudFront)  │  ← Assets statiques, cache global
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   API Gateway /     │  ← Rate limiting, Auth JWT/OAuth2
        │   Load Balancer     │    Tenant identification (subdomain)
        └──────────┬──────────┘
                   │
     ┌─────────────┼──────────────┐
     │             │              │
┌────▼────┐  ┌─────▼────┐  ┌─────▼────┐
│  Auth   │  │  Core    │  │ Notif.   │
│ Service │  │  API     │  │ Service  │
└─────────┘  └─────┬────┘  └──────────┘
                   │
     ┌─────────────┼──────────────┐
     │             │              │
┌────▼────┐  ┌─────▼────┐  ┌─────▼────┐
│  DB     │  │  Cache   │  │  Files   │
│Postgres │  │  Redis   │  │  S3/R2   │
│(par     │  └──────────┘  └──────────┘
│ tenant) │
└─────────┘
```

**Stratégie d'isolation des données :**
- **Schema-per-tenant** dans PostgreSQL (isolation forte, coûts raisonnables)
- Chaque établissement = un schéma dédié (`tenant_ecole_abc`)
- Un schéma `public` pour les données partagées (plans, pays, devises)
- Rotation automatique des clés de chiffrement par tenant

### 1.2 Stack Technique Recommandée

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| **Frontend** | Next.js 15 + TypeScript | SSR, App Router, performances |
| **UI Components** | shadcn/ui + Tailwind CSS | Moderne, accessible, customisable |
| **State Management** | Zustand + React Query | Léger, cache intelligent |
| **Backend API** | Node.js (Fastify) ou Go | Performances, typage fort |
| **Base de données** | PostgreSQL + Prisma ORM | ACID, multi-schema, migrations |
| **Cache** | Redis (Upstash) | Sessions, rate-limit, queues |
| **Auth** | Auth.js / Clerk | OAuth2, MFA, SSO SAML |
| **Files** | Cloudflare R2 ou AWS S3 | Documents, photos, exports |
| **Emails** | Resend + React Email | Templates HTML modernes |
| **SMS/Push** | Twilio + Firebase FCM | Notifications multicanal |
| **Paiements** | Stripe | Abonnements SaaS, frais scolaires |
| **Déploiement** | Vercel / Railway / Fly.io | CI/CD automatique |
| **Monitoring** | Sentry + Datadog | Erreurs, performances, alertes |
| **Infra as Code** | Terraform | Reproductibilité, scalabilité |

### 1.3 Sécurité (niveau bancaire)

- **Authentification :** MFA obligatoire (TOTP, SMS, Email), SSO SAML 2.0 pour les grandes institutions
- **Autorisation :** RBAC (Role-Based Access Control) granulaire + ABAC pour les règles avancées
- **Chiffrement :** AES-256 en repos, TLS 1.3 en transit, chiffrement de bout en bout pour les messages
- **Audit Log :** Toute action traçable (qui, quoi, quand, depuis quelle IP)
- **RGPD / Protection données :** Consentement parental, droit à l'oubli, export des données, DPO dashboard
- **Rate Limiting :** Par IP, par tenant, par utilisateur
- **WAF :** Cloudflare WAF contre injections SQL, XSS, CSRF
- **Pen-testing :** Cycle trimestriel + bug bounty program
- **Backups :** Automatiques toutes les heures, rétention 30 jours, restauration en 1 clic
- **SLA :** 99.9% uptime garanti contractuellement

---

## PARTIE 2 — MODULES FONCTIONNELS

### MODULE 1 — Gestion des Établissements (Super Admin)

**Tableau de bord SuperAdmin :**
- Vue globale de tous les tenants actifs
- Métriques : établissements actifs, utilisateurs totaux, revenus MRR/ARR
- Gestion des abonnements et plans tarifaires
- Création / suspension / suppression d'établissements
- Impersonation sécurisée (accès support avec log d'audit)

**Configuration par établissement :**
- Informations légales (nom, adresse, numéro d'agrément, logo)
- Année scolaire (dates de début/fin, vacances, jours fériés)
- Structure pédagogique (cycles, niveaux, filières)
- Paramètres de notation (barème /20, /100, lettres A-F, compétences)
- Langues d'interface (FR, EN, AR, ES — i18n complet)
- Fuseau horaire et devise locale
- Personnalisation de la charte graphique (couleurs, logo, domaine custom)

---

### MODULE 2 — Gestion des Élèves

**Dossier élève numérique complet :**
- Informations personnelles (nom, prénom, date/lieu de naissance, nationalité, photo)
- Numéro d'matricule unique auto-généré
- Classe actuelle + historique de scolarité complet
- Statut (actif, transféré, diplômé, exclu, décédé)
- Documents joints (acte de naissance, carnet de santé, certificat médical)
- Groupe sanguin, allergies, besoins spéciaux (handicap, PAP, PAI)
- Régime alimentaire (interne, demi-pensionnaire, externe)
- Transport scolaire (ligne, arrêt)

**Inscriptions & Réinscriptions :**
- Workflow d'inscription en ligne avec formulaire configurable
- Signature électronique des documents (règlement intérieur, autorisations)
- Paiement des frais d'inscription directement en ligne (Stripe)
- Validation par le secrétariat avec checklist documentaire
- Génération automatique des listes de classe
- Affectation manuelle ou automatique (algorithme d'équilibrage)

**Transferts inter-établissements :**
- Export du dossier numérique complet
- Système de QR Code sécurisé pour transfert de dossier entre tenants EcolPro

---

### MODULE 3 — Gestion des Absences & Présences

**Appel numérique :**
- Interface mobile optimisée pour les enseignants (tablette/smartphone)
- Appel rapide en 30 secondes par classe (tap pour présent/absent)
- Appel par QR Code ou badge NFC élève (optionnel)
- Motif d'absence : Injustifié, Justifié, Retard, Départ anticipé, Sortie médicale
- Détection automatique des absences récurrentes (alertes IA)

**Gestion des justificatifs :**
- Dépôt de justificatif par les parents depuis l'application
- Validation/refus par le secrétariat avec commentaire
- Archivage des justificatifs par année scolaire

**Alertes & Notifications :**
- SMS/Email automatique aux parents dès une absence non justifiée
- Alerte si l'élève dépasse le seuil d'absences (configurable)
- Rapport hebdomadaire envoyé aux parents
- Notification push sur l'application mobile parentale

**Statistiques & Rapports :**
- Taux de présence par classe, par matière, par élève
- Heatmap des absences sur l'année
- Export Excel/PDF pour le conseil de classe
- Suivi de l'assiduité pour les bourses et aides sociales

---

### MODULE 4 — Gestion des Notes & Évaluations

**Saisie des notes :**
- Interface de saisie rapide (tableau Excel-like en ligne)
- Import CSV/Excel des notes
- Notes par contrôle, devoir, examen, projet, oral
- Coefficients configurables par matière et par type d'évaluation
- Grilles de compétences (évaluation par socle, non-chiffrée)
- Notes provisoires vs définitives (workflow de validation)

**Calculs automatiques :**
- Moyenne par matière, par période (trimestre/semestre), annuelle
- Moyenne générale pondérée
- Classement dans la classe (rang, percentile)
- Écart-type, min/max de la classe
- Détection automatique des élèves en difficulté (< seuil configurable)

**Bulletins de notes :**
- Génération automatique en PDF (format A4, branding établissement)
- Appréciations préremplies avec suggestions IA (évite les répétitions)
- Signature électronique du chef d'établissement
- Distribution numérique aux parents via l'app + email
- Archivage 10 ans conforme aux obligations légales

**Conseil de classe :**
- Espace collaboratif pour préparer le conseil
- Tableaux de synthèse par classe (toutes matières)
- Saisie des décisions en direct (passage, redoublement, félicitations, avertissements)
- Génération automatique du compte-rendu officiel
- Gestion des vœux d'orientation

---

### MODULE 5 — Gestion des Examens

**Programmation des examens :**
- Calendrier d'examens drag-and-drop
- Gestion des conflits d'horaire automatique (même élève, même créneau)
- Attribution des salles selon capacité et besoins (surveillance, tiers-temps)
- Affichage public du planning sur l'ENT élève/parent

**Convocations :**
- Génération automatique des convocations individuelles (PDF)
- Envoi groupé par email/SMS
- QR Code unique par convocation pour contrôle à l'entrée

**Surveillance :**
- Plan de salle automatique (placement aléatoire ou alphabétique)
- Feuilles d'émargement générées automatiquement
- Application mobile de surveillance (émargement numérique)

**Résultats & Délibérations :**
- Interface de délibération du jury
- Calcul automatique des moyennes d'examen
- Gestion des rattrapages (2ème session)
- Publication des résultats sur l'ENT (avec heure de publication programmée)
- Génération des relevés de notes officiels et diplômes (avec QR Code d'authenticité)

---

### MODULE 6 — Gestion des Parents

**Espace parents (ENT) :**
- Application mobile native (iOS + Android) + Web responsive
- Tableau de bord personnalisé par enfant
- Suivi en temps réel : notes, absences, comportement, devoirs
- Messagerie sécurisée avec les enseignants et l'administration
- Prise de rendez-vous en ligne (enseignant, conseiller d'orientation, direction)
- Accès aux bulletins, emplois du temps, menus de la cantine
- Paiement des frais scolaires, sorties, activités en ligne

**Communication école-famille :**
- Cahier de liaison numérique
- Carnet de correspondance avec émargement électronique
- Diffusion d'informations ciblées (classe, niveau, toute l'école)
- Sondages & votes des parents d'élèves
- Notifications push configurables par les parents

---

### MODULE 7 — Gestion des Enseignants & Personnel

**Dossier RH enseignant :**
- Informations personnelles et professionnelles
- Diplômes, certifications, spécialités
- Contrat (CDI, CDD, vacation), ancienneté, échelon
- Emploi du temps de la semaine
- Historique des classes et matières enseignées

**Gestion des emplois du temps :**
- Générateur automatique d'emplois du temps (algorithme contraintes)
- Contraintes : disponibilités enseignants, capacité salles, volumes horaires
- Vue semaine/mois par enseignant, par classe, par salle
- Gestion des remplacements (absences enseignants)
- Export iCal / Google Calendar

**Gestion du personnel non-enseignant :**
- Administration, secrétariat, personnel d'entretien, CPE
- Pointage et gestion des présences
- Gestion des congés et absences

---

### MODULE 8 — Gestion des Cours & Ressources Pédagogiques

**Cahier de texte numérique :**
- Saisie des cours dispensés (matière, contenu, compétences travaillées)
- Devoirs et leçons à faire avec date de rendu
- Supports de cours joints (PDF, vidéos, liens)
- Visualisation par élève, parent, enseignant, direction

**Bibliothèque de ressources :**
- Dépôt de documents pédagogiques (fiches, exercices, corrigés)
- Organisation par matière, niveau, type de document
- Recherche full-text avec filtres
- Contrôle des droits (public, classe, enseignants)

**ENT Élèves :**
- Emploi du temps personnel
- Devoirs à rendre avec rappels automatiques
- Ressources pédagogiques de chaque cours
- Messagerie avec les enseignants
- Notes et bulletins consultables
- Agenda scolaire (événements, sorties, examens)

---

### MODULE 9 — Gestion Financière

**Frais scolaires :**
- Configuration des grilles tarifaires (scolarité, cantine, transport, activités)
- Réductions (boursiers, fratries, orphelins)
- Facturation automatique par période
- Paiement en ligne (carte bancaire, virement, Mobile Money)
- Suivi des impayés avec relances automatiques
- Reçus et attestations de paiement générés automatiquement

**Comptabilité simplifiée :**
- Tableau de bord financier de l'établissement
- Recettes vs dépenses
- Prévisions budgétaires
- Export comptable (compatible logiciels tiers)
- Rapports pour les autorités de tutelle

---

### MODULE 10 — Santé & Vie Scolaire

**Infirmerie :**
- Registre des passages infirmerie
- Fiche de soins et suivi médical
- Gestion des ordonnances et médicaments
- Alertes allergies/pathologies visibles par le personnel autorisé

**Vie scolaire & Discipline :**
- Registre des incidents (bagarre, incivilité, matériel cassé)
- Système de sanctions configurable (avertissement, exclusion temporaire)
- Lettres officielles générées automatiquement
- Suivi du comportement par élève
- Commission éducative (convocations, comptes-rendus)

---

### MODULE 11 — Analytics & Intelligence Artificielle

**Tableaux de bord exécutifs :**
- KPIs temps réel : effectifs, taux de réussite, assiduité, satisfaction
- Comparaison inter-niveaux, inter-classes, inter-années
- Visualisations interactives (graphiques, heatmaps, courbes)

**IA Prédictive :**
- Détection précoce des élèves à risque de décrochage (ML sur notes + absences + comportement)
- Prédiction des résultats aux examens nationaux
- Recommandations d'orientation personnalisées
- Suggestions d'appréciations pour les bulletins (NLP)
- Chatbot IA pour les parents et élèves (FAQ automatisée 24h/24)

**Rapports automatisés :**
- Rapport mensuel direction envoyé automatiquement
- Statistiques pour la remontée aux autorités académiques
- Bilan annuel par classe, par niveau, par établissement

---

### MODULE 12 — Communication & Messagerie

**Messagerie interne sécurisée :**
- Conversations privées (1:1) et groupes
- Pièces jointes, émojis, réactions
- Messages vocaux
- Chiffrement de bout en bout
- Archivage légal des communications

**Notifications multicanal :**
- Push (application mobile)
- Email (templates HTML professionnels)
- SMS (critique : absences, urgences)
- Affichage sur l'ENT

**Diffusion officielle :**
- Circulaires et notes officielles
- Accusé de lecture obligatoire
- Ciblage précis (une classe, un niveau, tous les parents)

---

## PARTIE 3 — EXPÉRIENCE UTILISATEUR (UX)

### Principes Design

- **Design System cohérent** : couleurs, typographie, composants unifiés
- **Mobile-first** : 70% des utilisateurs sont sur mobile
- **Accessibilité WCAG 2.1 AA** : contrastes, navigation clavier, lecteurs d'écran
- **Dark mode** natif
- **Temps de chargement < 2 secondes** (Lighthouse score > 90)
- **Progressive Web App (PWA)** : fonctionne hors-ligne (consultation du cahier de texte, emplois du temps)
- **Onboarding guidé** pour chaque rôle (admin, enseignant, parent, élève)
- **Raccourcis clavier** pour les utilisateurs avancés (secrétariat)

### Profils utilisateurs & interfaces dédiées

| Profil | Interface clé | Priorité UX |
|--------|--------------|-------------|
| **Super Admin** | Dashboard multi-tenant, facturation | Puissance, vue d'ensemble |
| **Direction** | Analytics, validation, communication | Décision rapide, alertes |
| **Secrétariat** | Inscriptions, dossiers, absences | Rapidité, raccourcis |
| **Enseignant** | Appel, notes, cahier de texte | Simplicité mobile |
| **Parent** | Suivi enfant, messagerie, paiement | Clarté, notifications |
| **Élève** | Emploi du temps, devoirs, notes | Jeunesse, gamification légère |

---

## PARTIE 4 — MODÈLE ÉCONOMIQUE SAAS

### Plans tarifaires

| Plan | Cible | Prix/mois | Fonctionnalités |
|------|-------|-----------|-----------------|
| **Starter** | < 200 élèves | 49€ | Modules de base (élèves, absences, notes) |
| **Pro** | 200-1000 élèves | 149€ | Tous modules + app mobile + support prioritaire |
| **Business** | 1000-5000 élèves | 399€ | Multi-campus, analytics avancés, SSO |
| **Enterprise** | > 5000 élèves | Sur devis | Déploiement on-premise, SLA 99.9%, formation |

### Revenus complémentaires
- Module SMS (pay-as-you-go)
- Stockage supplémentaire
- Intégrations premium (LMS tiers, ERP académique)
- Formation et accompagnement
- API accès tiers

---

## PARTIE 5 — INTÉGRATIONS & API

### Intégrations natives
- **Google Workspace / Microsoft 365** : SSO, synchronisation calendrier
- **Zoom / Teams / Meet** : Cours en ligne intégrés
- **LMS** : Moodle, Canvas (import/export cours)
- **Comptabilité** : Sage, QuickBooks (export automatique)
- **Mobile Money** : Orange Money, Wave, MTN (marchés africains)
- **Ministères de l'Éducation** : API de remontée de données officielles

### API publique REST + GraphQL
- Documentation OpenAPI 3.0 (Swagger UI)
- SDK officiels (JavaScript, Python, PHP)
- Webhooks configurables (événements en temps réel)
- Rate limiting par plan d'abonnement
- Sandbox de test pour les développeurs

---

## PARTIE 6 — ROADMAP DE DÉVELOPPEMENT

### Phase 1 — MVP (Mois 1-4)
- [ ] Architecture multi-tenant + Auth
- [ ] Module Élèves (inscriptions, dossiers)
- [ ] Module Absences (appel, notifications parents)
- [ ] Module Notes (saisie, calculs, bulletins basiques)
- [ ] ENT Parents (web)
- [ ] Dashboard Direction

### Phase 2 — Core Product (Mois 5-8)
- [ ] Module Examens complet
- [ ] Emplois du temps
- [ ] Messagerie interne
- [ ] Application mobile (iOS + Android)
- [ ] Module Financier (facturation + paiement)
- [ ] Cahier de texte numérique

### Phase 3 — Growth (Mois 9-12)
- [ ] IA prédictive (détection décrochage)
- [ ] Analytics avancés
- [ ] API publique + Webhooks
- [ ] Intégrations Google/Microsoft
- [ ] Module Santé & Vie scolaire
- [ ] Multi-langue (AR, EN, ES)

### Phase 4 — Scale (Mois 13-18)
- [ ] Chatbot IA (FAQ parents/élèves)
- [ ] Module e-Learning intégré
- [ ] Reconnaissance faciale (émargement optionnel)
- [ ] Application bureau (Electron)
- [ ] Expansion internationale

---

## PARTIE 7 — CONFORMITÉ & RÉGLEMENTAIRE

- **RGPD** (Europe) : DPO, registre des traitements, consentements, droit à l'oubli
- **Loi Informatique & Libertés** (France)
- **COPPA** (USA) : Protection des mineurs < 13 ans
- **FERPA** (USA) : Confidentialité dossiers étudiants
- **ISO 27001** : Certification sécurité de l'information (objectif Year 2)
- **SOC 2 Type II** : Audit de sécurité pour clients Enterprise
- **Hébergement données** : Option datacenter local (FR, Afrique, etc.) pour conformité nationale

---

## ANNEXE — NOMENCLATURE DES RÔLES

```
SUPER_ADMIN          → Accès total plateforme (équipe EcolPro)
TENANT_ADMIN         → Directeur/Propriétaire établissement
PRINCIPAL            → Chef d'établissement
SECRETARY            → Secrétariat / Administration
TEACHER              → Enseignant
CLASS_TEACHER        → Professeur principal
COUNSELOR            → Conseiller d'orientation / CPE
NURSE                → Infirmier(e)
ACCOUNTANT           → Gestionnaire financier
PARENT               → Parent / Tuteur légal
STUDENT              → Élève (accès limité selon l'âge)
SUPPORT              → Support EcolPro (accès lecture + audit log)
```

---

*Document rédigé le 26 juin 2026 — EcolPro v1.0 Blueprint*
*Ce document constitue la base de référence pour le développement du produit.*
