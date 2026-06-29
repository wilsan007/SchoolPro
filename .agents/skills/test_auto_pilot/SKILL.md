---
name: test_auto_pilot
description: Guide pour la mise en place, la rédaction et l'exécution automatisée de tests unitaires et d'intégration de bout en bout sur Next.js 15.
---

# Directives Test Auto Pilot

Ce skill fournit un framework méthodologique pour implémenter des tests résilients dans le projet.

## 1. Tests d'API (Next.js Routes)
* Simuler systématiquement les sessions utilisateurs en injectant un token fictif ou en mockant le module `next-auth`.
* Valider les codes de retour HTTP standards (200 pour le succès, 400 pour les requêtes incorrectes, 401 pour non autorisé, 403 pour accès interdit).

## 2. Structure des Tests
* Placer les fichiers de tests à côté des éléments testés avec l'extension `.test.ts` ou `.test.tsx`.
* Utiliser un environnement de base de données de test isolé (`sqlite` en mémoire ou base de données de test PostgreSQL éphémère) pour ne pas polluer les données de production.
