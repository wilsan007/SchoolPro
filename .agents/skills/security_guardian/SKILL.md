---
name: security_guardian
description: Normes de sécurité strictes pour prévenir les fuites de données inter-tenant, sécuriser les rôles utilisateurs et protéger les points d'entrée de l'API.
---

# Directives Security Guardian

Ce skill définit la barrière de protection de la confidentialité et de la sécurité des utilisateurs d'EcolPro.

## 1. Isolation Hermétique des Tenants
* **Loi cardinale :** Deux établissements scolaires différents ne doivent jamais pouvoir s'échanger ou visualiser des données mutuelles.
* Valider systématiquement que le `tenantId` de la session de l'utilisateur correspond au `tenantId` de l'enregistrement demandé en base de données.

## 2. Contrôle d'Accès basé sur les Rôles (RBAC)
* Vérifier le rôle de l'utilisateur (`SUPER_ADMIN`, `ADMIN`, `ENSEIGNANT`, `ELEVE`, `PARENT`) avant d'autoriser l'affichage ou la modification d'une ressource sensible (ex: bulletins de paie, configuration globale).
* Les pages admin doivent utiliser le middleware ou une redirection explicite en cas d'absence de droits.
