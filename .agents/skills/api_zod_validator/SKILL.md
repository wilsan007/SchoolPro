---
name: api_zod_validator
description: Schémas et structures standardisées de validation des entrées pour sécuriser et uniformiser les routes API Next.js.
---

# Directives API Zod Validator

Ce skill encadre la validation de toutes les requêtes (body, query params) envoyées à nos API.

## 1. Validation Systématique
* Toutes les routes POST, PUT et PATCH doivent analyser leur contenu à l'aide d'un schéma Zod rigide avant d'interagir avec la base de données.
* Gérer les erreurs de validation proprement et retourner un statut HTTP `400 Bad Request` contenant le détail des champs invalides sous format JSON structuré.

## 2. Types Réutilisables
* Déclarer les schémas Zod dans un sous-dossier ou directement en haut du fichier de route pour documenter clairement la structure attendue des requêtes.
