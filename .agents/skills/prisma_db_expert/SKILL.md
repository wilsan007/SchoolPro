---
name: prisma_db_expert
description: Directives et meilleures pratiques pour la modélisation de données, l'optimisation des requêtes PostgreSQL avec Prisma et la gestion saine des schémas multi-tenants.
---

# Directives Prisma DB Expert

Ce skill garantit des opérations de base de données ultra-performantes et sécurisées au sein du SaaS multi-tenant EcolPro.

## 1. Isolation multi-tenant stricte
* Chaque requête affectant ou lisant des données spécifiques à un établissement doit inclure le filtre `tenantId`.
* **Règle absolue :** Ne jamais omettre `tenantId` dans les clauses `where` de vos requêtes `findMany`, `findFirst`, `update`, `delete`.

## 2. Optimisation des requêtes
* **Pas de requêtes lourdes :** Éviter les jointures globales implicites. Toujours utiliser `select` pour ne récupérer que les champs nécessaires au lieu d'importer tout l'objet.
* **Pagination obligatoire :** Toute liste potentiellement longue (élèves, absences, logs, inventaire) doit implémenter une pagination (`take` et `skip`).

## 3. Sécurité des relations
* Ne jamais mettre à jour un ID de relation à la volée sans s'assurer que l'objet lié appartient bien au même `tenantId`.
