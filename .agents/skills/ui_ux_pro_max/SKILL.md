---
name: ui_ux_pro_max
description: Guide et règles de conception pour créer des interfaces utilisateur web (UI/UX) modernes, fluides et esthétiquement premium (Pro Max).
---

# Directives UI/UX Pro Max

Ce skill définit les standards esthétiques et ergonomiques pour toutes les interfaces utilisateur du projet EcolPro.

## 1. Palette de Couleurs & Thème
* **Pas de couleurs brutes :** Éviter le rouge pur (`#FF0000`), bleu pur (`#0000FF`), etc. Utiliser des palettes de couleurs harmonieuses basées sur les variables HSL du thème Tailwind de shadcn/ui.
* **Gradients premium :** Utiliser des dégradés subtils pour les boutons d'action principaux, les en-têtes et les cartes clés (ex: `bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500`).
* **Soutien du mode sombre :** Assurer un contraste optimal entre les textes et les fonds en mode sombre et clair.

## 2. Micro-Animations & Transitions
* **Interactivité vivante :** Ajouter des transitions fluides sur les hovers, les focus et les changements d'état (`transition-all duration-200 ease-in-out`).
* **Hover effects :** Les boutons et cartes cliquables doivent légèrement s'élever ou changer d'opacité au survol (ex: `hover:-translate-y-0.5 hover:shadow-md`).
* **Chargement élégant :** Utiliser des squelettes de chargement (`Skeleton` de shadcn) animés ou des spinners discrets plutôt que des écrans blancs ou du texte brut "Chargement...".

## 3. Typographie & Espacement
* **Hiérarchie claire :** Utiliser des tailles et graisses de police contrastées pour guider l'œil (ex: titre en `font-bold text-2xl tracking-tight` et sous-titre en `text-muted-foreground text-sm`).
* **Aération :** Respecter une grille d'espacement consistante (`p-6`, `space-y-6`, `gap-6`) pour éviter la surcharge cognitive.

## 4. Remplissage des Données (No Placeholders)
* **Pas de placeholders vides :** Remplir les états vides (empty states) avec des illustrations SVG légères ou des icônes descriptives, accompagnées d'un bouton d'action contextuel.
