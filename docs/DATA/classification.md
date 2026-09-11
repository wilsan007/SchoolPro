# Classification des données — SchoolPro / LEARNOS

## Niveaux de classification

| Niveau | Description | Exemples | Mesures de protection |
|---|---|---|---|
| **Public** | Données librement consultables | Nom de l'établissement, logo, calendrier officiel | Aucune restriction |
| **Interne** | Données accessibles à tous les membres authentifiés d'un tenant | Liste des classes, matières, emplois du temps | Authentification + RLS (tenantId) |
| **Confidentiel** | Données accessibles aux rôles autorisés uniquement | Notes, bulletins, données financières, données médicales | Authentification + RBAC + RLS (tenantId + siteId) |
| **Restreint** | Données sensibles accessibles à un nombre limité de personnes | Mots de passe (hachés), tokens 2FA, secrets API, données personnelles détaillées | Chiffrement + accès restreint + audit obligatoire |

## Classification par modèle Prisma

### Niveau Restreint
- `User.password` (bcrypt hash) — jamais exposé en lecture
- `User.twoFactorSecret` — chiffré, jamais exposé
- `Account` — tokens OAuth, jamais exposés
- `Session` — tokens de session
- `VerificationToken` — tokens de vérification
- `Invitation.token` — token d'invitation expirant

### Niveau Confidentiel
- `Note` — notes des élèves
- `Bulletin` — bulletins scolaires
- `Facture`, `Paiement` — données financières
- `Absence` — absences et retards
- `Eleve` — données personnelles des élèves
- `Parent` — données personnelles des parents
- `AlerteParent` — alertes envoyées aux parents
- `LearningEvidence` — preuves d'apprentissage LEARNOS
- `Recommandation` — recommandations pédagogiques
- `AuditLog` — journal d'audit

### Niveau Interne
- `Classe` — liste des classes
- `Matiere` — matières enseignées
- `Evaluation` — évaluations planifiées
- `EmploiTemps` — emplois du temps
- `AnneeScolaire` — années scolaires
- `Site` — établissements d'un tenant
- `Tarif` — tarifs de scolarité

### Niveau Public
- `Tenant` (nom, logo) — informations de l'établissement
- `CalendrierOfficiel` — calendrier officiel partagé
- `Module` — catalogue des modules fonctionnels

## Règles d'accès

1. **Restreint** : accès uniquement par le système ou SUPER_ADMIN avec audit obligatoire.
2. **Confidentiel** : accès par les rôles autorisés (RBAC) + filtrage RLS (tenantId + siteId).
3. **Interne** : accès par tout utilisateur authentifié du tenant + filtrage RLS (tenantId).
4. **Public** : aucun filtrage nécessaire.

## Journalisation

Toute accès à des données **Confidentielles** ou **Restreintes** doit être journalisé via `auditFire()`.
