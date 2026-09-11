# Politique de conservation des données — SchoolPro / LEARNOS

## Principes

1. **Finalité** : les données ne sont conservées que pour la durée nécessaire à leur finalité pédagogique, administrative ou légale.
2. **Minimisation** : seules les données strictement nécessaires sont collectées et conservées.
3. **Sécurité** : les données sont protégées par RLS, chiffrement en transit (TLS) et au repos (Supabase).
4. **Transparence** : toute personne peut exercer ses droits d'accès, de rectification et d'effacement.

## Durées de conservation par catégorie

| Catégorie | Données | Durée de conservation | Action à l'expiration |
|---|---|---|---|
| **Données pédagogiques** | Notes, évaluations, bulletins, absences, devoirs | Durée de la scolarité + 5 ans | Anonymisation (remplacement des identifiants par des UUIDs) |
| **Données financières** | Factures, paiements, reçus | 10 ans (obligation légale comptable) | Archivage puis suppression |
| **Données de communication** | Messages, notifications, emails | 1 an | Suppression automatique |
| **Journaux d'audit** | AuditLog (actions sensibles) | 1 an (365 jours) | Purge automatique via cron `purge-audit-logs` |
| **Données d'authentification** | Sessions, tokens, codes 2FA | 30 jours après expiration | Suppression automatique |
| **Données LEARNOS** | Preuves, profils, recommandations, plans | Durée de la scolarité + 1 an | Suppression |
| **Données d'inscription** | Candidatures, admissions | 1 an après décision | Suppression |
| **Données de relance** | Relances de facturation | 5 ans (aligné sur les données financières) | Suppression avec la facture |

## Droits des personnes (RGPD)

- **Droit d'accès** : tout utilisateur peut consulter ses données via son profil.
- **Droit de rectification** : les données peuvent être corrigées via l'interface.
- **Droit à l'effacement** : les comptes peuvent être désactivés (soft delete) puis anonymisés après expiration du délai de conservation.
- **Droit à la portabilité** : les données peuvent être exportées au format JSON.
- **Droit d'opposition** : les notifications peuvent être désactivées dans les préférences.

## Procédure d'anonymisation

1. Le compte utilisateur est désactivé (soft delete) — `isActive = false`.
2. Les données restent accessibles pour les obligations légales (factures, bulletins).
3. À l'expiration du délai de conservation, un script d'anonymisation :
   - Remplace les noms, prénoms, emails par des valeurs anonymisées.
   - Supprime les données pédagogiques non nécessaires.
   - Conserve les enregistrements financiers et légaux.

## Responsabilités

- **TENANT_ADMIN** : responsable du traitement pour son établissement.
- **SUPER_ADMIN** : responsable technique du respect des durées de conservation.
- **Cron `purge-audit-logs`** : purge automatique des journaux d'audit > 365 jours.
