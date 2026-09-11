# Flux de données IA — SchoolPro / LEARNOS

## 1. Principes

- L'IA est **cantonnée à la proposition** : l'enseignant valide avant toute persistance.
- Aucune décision pédagogique n'est prise par un LLM.
- Les données envoyées aux fournisseurs IA sont minimisées et anonymisées quand possible.
- Le moteur de recommandation LEARNOS est **déterministe** (statistiques pures, aucun LLM).

## 2. Fournisseurs IA utilisés

| Fournisseur | Usage | Données envoyées | Base légale |
|---|---|---|---|
| **Ollama** (local) | Génération de questions, import de programme | Contexte pédagogique (compétences, chapitres) | Consentement (pas de données personnelles envoyées) |
| **Groq** | Génération de questions, propositions de prérequis | Contexte pédagogique anonymisé | Contrat de traitement (DPA à signer) |
| **OpenRouter / GLM** | Chat d'aide, conseil augmenté | Contexte pédagogique + question utilisateur | Contrat de traitement (DPA à signer) |

## 3. Données transmises

### Ce qui est envoyé
- Intitulé de la compétence, du chapitre, de la matière
- Niveau de la classe
- Question ou demande de l'utilisateur

### Ce qui n'est **jamais** envoyé
- Noms, prénoms, emails des élèves ou parents
- Notes individuelles identifiées
- Données financières
- Données médicales
- Données de contact

## 4. Conservation côté fournisseur

- **Ollama** (local) : aucune donnée ne quitte le serveur.
- **Groq / OpenRouter** : les données sont traitées en temps réel et non conservées au-delà de la durée de la session (selon les politiques des fournisseurs).
- **Cache IA** (`AiCache`) : les réponses sont mises en cache localement, indexées par empreinte de requête, sans données personnelles.

## 5. Droits des personnes

- Les données envoyées aux fournisseurs IA ne contiennent pas de données personnelles identifiables.
- Le cache IA est vidé régulièrement et ne contient pas de données personnelles.
- Les utilisateurs peuvent désactiver l'IA dans leurs préférences.

## 6. Audit

- Toutes les requêtes IA sont journalisées dans `AuditLog` avec l'action `ai:query`.
- Les propositions générées par l'IA sont marquées comme `PROPOSEE` et nécessitent validation humaine.
