# SchoolPro / LEARNOS — Analyse UX/UI Design System

**Date d'analyse :** 26 août 2026  
**Scope :** 35+ modules, workspace multi-fenêtres, design system "Azure Bloom"  
**Fichiers analysés :** `globals.css`, `tailwind.config.ts`, `DESIGN.md`, layout, workspace, dock, window-frame, dashboard, login, card/button UI, intelligence components

---

## 1. Vision d'ensemble — Ce qui fonctionne bien

### 1.1 Identité visuelle forte et différenciée
Le design system **"Azure Bloom"** est une réussite stratégique. La palette turquoise→violet sur fond brume azur crée une identité immédiatement reconnaissable, radicalement différente d'EcolPro (vert/slate). Les halos colorés, les dégradés subtils et le glassmorphisme sélectif donnent une impression de modernité et de "magie" qui correspond bien au positionnement IA (LEARNOS).

### 1.2 Architecture de couleurs par catégorie sémantique
Le système de **8 accents de carte** (azure, violet, teal, amber, rose, emerald, sky, indigo) avec :
- Bordure supérieure colorée (`border-accent-*`)
- Fond teinté (`bg-tint-*`)
- Pastille en dégradé (`pastille-*`)
- Halo vif au survol (`halo-vif-*`)
- Texte vif (`text-vif-*`)
- Badge vif (`badge-vif-*`)

…est exceptionnellement complet. C'est rare de voir un système aussi granulaire et cohérent dans un projet Next.js.

### 1.3 Workspace multi-fenêtres
Le concept de **fenêtres en iframes** avec dock, tabs, layouts (fullscreen/split/quad) et effet genie est audacieux. Pour un SaaS avec 35+ modules, c'est une solution d'architecture informationnelle intelligente qui évite la "navigation en profondeur" traditionnelle.

### 1.4 Typographie hiérarchisée
L'utilisation de **4 polices** avec des rôles clairs :
- **Clash Grotesk** → Display / titres / hero (distinctif)
- **Plus Jakarta Sans** → Body / UI (lisible, moderne)
- **Geist** → Data / tableaux (`tnum` pour alignement colonnes)
- **JetBrains Mono** → Code

C'est une architecture typographique de niveau professionnel.

### 1.5 Dark mode cohérent
Le mode sombre **"Midnight Bloom"** n'est pas un simple inverse — il repense la profondeur des bleus, garde la personnalité violette, et ajuste intelligemment les halos pour la lisibilité nocturne.

### 1.6 Attention aux détails micro-UX
- Liseré dégradé turquoise→violet sous le header
- Scrollbar custom thin (4px)
- Animation fade-up au montage des fenêtres
- Indicateurs "À l'écran" dans le dock
- Dégradé de scroll à droite des tabs
- Favicon et meta PWA bien configurés

---

## 2. Problèmes identifiés — Axes d'amélioration

### 2.1 🚨 INCOHÉRENCE — Radius non standardisé

| Valeur | Usage | Problème |
|--------|-------|----------|
| `18px` (`1.125rem`) | `--radius` base, cartes | OK — standard |
| `22px` (`1.375rem`) | Cartes large, window frames | OK — hiérarchique |
| `24px` (`1.5rem`) | Dialogs, modals | OK — hiérarchique |
| `28px` | Login card (`rounded-[28px]`) | **Incohérent** — trop grand, casse l'échelle |
| `9999px` | Avatars, pills, search bar | OK |
| `8px/12px` | Inputs, small buttons | OK |

**Impact :** Le login à `28px` alors que les dialogs sont à `24px` crée une dissonance visuelle. Le login ne devrait pas être plus arrondi qu'un modal.

**Recommandation :** Créer une échelle stricte :
```
sm: 8px   → inputs, small buttons
md: 12px  → buttons, badges
lg: 18px  → cards, containers (base)
xl: 22px  → large cards, panels, window frames
2xl: 24px → dialogs, modals, login card
3xl: 28px → hero cards UNIQUEMENT
```

### 2.2 🚨 ACCESSIBILITÉ — Contraste et focus

**Problème 2.2.1 — Halos flous et lisibilité**
Les halos décoratifs (`blur-[120px]`, opacité 0.03–0.08) sont esthétiques mais :
- Peuvent causer des problèmes de **sensibilité visuelle** (utilisateurs migraineux/épilepsie)
- N'ont pas de mécanisme de réduction (`prefers-reduced-motion` ne les couvre pas)

**Problème 2.2.2 — Focus rings incohérents**
```css
/* Dans button.tsx : */
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2

/* Dans input Header : */
focus:ring-2 focus:ring-primary/40 focus:border-primary/40

/* Manquant sur : */
- Dock items (pas de focus visible)
- Window frame title bar buttons
- Tabs du dock (sélection cliquable mais pas au clavier)
```

**Problème 2.2.3 — Couleurs sémantiques hors-palette**
Dans `IndiceComposite.tsx` :
```tsx
if (v < 0.4) return "bg-red-500";        // ← pas dans la palette bloom
if (v < 0.7) return "bg-orange-500";     // ← pas dans la palette bloom
return "bg-emerald-500";                  // ← OK (dans les pastilles)
```
Ces rouges/oranges vifs cassent l'harmonie Azure Bloom.

**Recommandation :**
```tsx
// Remplacer par la palette bloom :
if (v < 0.4) return "bg-rose-500";       // rose fait partie du DS
if (v < 0.7) return "bg-amber-500";      // amber fait partie du DS
return "bg-emerald-500";                  // emerald fait partie du DS
```

### 2.3 🚨 MOBILE — Le workspace est quasi inutilisable

**Problème 2.3.1 — Dock de 76px en bas**
Sur un mobile de 812px de haut (iPhone 14) :
- Dock : 76px
- Topbar workspace : ~40px
- Espace de travail utile : ~696px
- Si keyboard ouvert (300px) : reste ~396px

Pour une iframe contenant un tableau de données, c'est très étroit.

**Problème 2.3.2 — Multi-fenêtres sur écran tactile**
Le split/quad sur mobile est techniquement possible mais UX-ment désastreux. Les iframes de 300px de large avec des tableaux de données ne sont pas utilisables.

**Problème 2.3.3 — Touch targets du dock**
Les catégories du dock ont des zones tactiles de ~40×60px — inférieur aux 44×44px recommandés par Apple HIG.

**Recommandation :**
- Sur mobile (≤768px), basculer automatiquement en mode **"pleine page"** (pas d'iframe, navigation classique)
- Réduire le dock à **56px** sur mobile avec des icônes uniquement
- Masquer le layout switcher sur mobile (toujours fullscreen)

### 2.4 ⚠️ PERFORMANCE VISUELLE — GPU et paint

**Problème 2.4.1 — Multiple blur filters simultanés**
Dans le workspace seul :
1. `backdrop-blur-[20px]` sur la topbar
2. `backdrop-blur-[24px]` sur le panneau dock
3. `blur-[120px]` halo décoratif #1
4. `blur-[100px]` halo décoratif #2
5. `blur-[100px]` halo décoratif #3
6. `blur-3xl` dans les fenêtres
7. `backdrop-blur-[2px]` sur l'overlay du dock panel

C'est **7 passes de flou** simultanées. Sur des machines moins puissantes ou avec un GPU intégré, cela peut causer du jank (notamment pendant les animations genie).

**Recommandation :**
- Réduire les halos décoratifs de 3 à 1 (conserver le plus visible)
- Utiliser `@media (prefers-reduced-transparency)` pour désactiver les backdrops
- Remplacer `backdrop-blur-[20px]` par `backdrop-blur-[12px]` (gain significatif, perte visuelle minime)

**Problème 2.4.2 — Box-shadow complexes**
Les halos bloom combinent 3 ombres avec opacités très faibles (0.04–0.08). Le rendu GPU des box-shadows multiples est coûteux sur certains navigateurs.

### 2.5 ⚠️ COHÉRENCE DES COMPOSANTS — Certains échappent au DS

| Composant | Problème |
|-----------|----------|
| `IndiceComposite` | Utilise `rounded-lg` (Tailwind default = 8px) au lieu de `rounded-[22px]`. Pas de `AccentCard`. Pas de halo. |
| Header notifications | `rounded-2xl` sur le dropdown — pourquoi pas `rounded-[22px]` ? |
| Login card | `rounded-[28px]` — hors échelle |
| Lang dropdown | `rounded-2xl` = 16px — incohérent avec les autres dropdowns |
| TimeMachineButton | Non analysé — probablement incohérent aussi |

**Recommandation :** Créer un composant `<Dropdown>` wrapper qui impose `rounded-[22px]` et les styles glassmorphiques cohérents.

### 2.6 ⚠️ ÉTATS VIDES (Empty States)

Le workspace a un `EmptyWorkspace` bien conçu, mais :
- **DashboardStats** : pas de skeleton pendant le chargement (saut visuel)
- **AbsenceChart** : pas d'état vide si aucune donnée
- **RecentActivity** : pas d'état vide si aucune note récente
- **Dock** : message "Cliquez sur une catégorie" est fonctionnel mais pas engageant

**Recommandation :** Créer une famille de composants `<EmptyState>` avec illustrations Lottie/SVG thématiques (azure bloom style) pour chaque module.

### 2.7 ⚠️ CHARGE COGNITIVE — Information density

Le dock affiche **jusqu'à 18 catégories** dans le groupe "Accueil" et 15 dans "Pédagogie". Bien que filtrées par rôle, le nombre de modules reste élevé.

**Problème :** Le dock panel affiche les items en grille de 8 colonnes sur desktop. Avec 18 items, ça fait 2–3 rangées. L'utilisateur doit scanner visuellement 18 icônes + labels.

**Recommandation :**
- Ajouter une **barre de recherche dans le dock panel** (Cmd+K style)
- Marquer les modules "fréquents" d'un indicateur visuel
- Permettre la personnalisation de l'ordre (pin/unpin)

### 2.8 ⚠️ IFRAME UX — Problèmes connus

L'architecture iframe du workspace résout le problème de la navigation profonde, mais introduit :

1. **Double scrollbar** : la fenêtre a sa scrollbar + l'iframe a la sienne
2. **Scroll context perdu** : quand on change de fenêtre, la position de scroll dans l'iframe n'est pas persistante
3. **Keyboard trapping** : focus dans l'iframe puis Tab → reste dans l'iframe (comportement correct mais peut surprendre)
4. **History perdue** : le back button du navigateur ne fonctionne pas intuitivement
5. **Mobile Safari** : les iframes ont des comportements de scroll erratiques sur iOS

**Recommandation :** Documenter ces limitations dans un `IFRAME_ARCHITECTURE.md` et fournir des solutions (persistance de scroll via `postMessage`, gestion du history via `WindowManager`).

---

## 3. Recommandations prioritaires

### Priorité 1 — Critique (impacterait immédiatement les utilisateurs)

| # | Problème | Action concrète | Fichiers |
|---|----------|----------------|----------|
| 1.1 | Mobile workspace inutilisable | Détecter `max-width: 768px` → navigation classique sans iframe, dock réduit à 56px | `Workspace.tsx`, `Dock.tsx`, `layout.tsx` |
| 1.2 | GPU jank sur machines lentes | Réduire les blurs, ajouter `prefers-reduced-transparency` | `globals.css`, `Workspace.tsx` |
| 1.3 | Focus rings manquants | Ajouter `focus-visible` sur tous les éléments interactifs du dock | `Dock.tsx`, `WindowFrame.tsx` |

### Priorité 2 — Haute (améliore la qualité perçue)

| # | Problème | Action concrète | Fichiers |
|---|----------|----------------|----------|
| 2.1 | Incohérence radius | Standardiser l'échelle, créer des tokens Tailwind | `tailwind.config.ts`, `login/page.tsx` |
| 2.2 | Couleurs sémantiques hors-palette | Remplacer red/orange par rose/amber dans `IndiceComposite` | `IndiceComposite.tsx` |
| 2.3 | Composants sans AccentCard | Migrer `IndiceComposite` et autres vers `AccentCard` | `IndiceComposite.tsx`, autres vues intelligence |
| 2.4 | États vides manquants | Créer `<EmptyState>` réutilisable avec illustrations | Nouveau composant + pages dashboard |

### Priorité 3 — Moyenne (polish et cohérence)

| # | Problème | Action concrète | Fichiers |
|---|----------|----------------|----------|
| 3.1 | Recherche dans le dock | Ajouter un input de recherche filtrant les items | `Dock.tsx` |
| 3.2 | Persistance du scroll iframe | Utiliser `postMessage` pour sauver/restaurer `scrollTop` | `WindowManager.tsx`, `WindowFrame.tsx` |
| 3.3 | Réduction des halos décoratifs | Passer de 3 à 1 halo dans le workspace | `Workspace.tsx` |
| 3.4 | Personnalisation du dock | Permettre pin/unpin + réordonnancement | `Dock.tsx` + localStorage |

---

## 4. Opportunités d'amélioration design

### 4.1 Animation d'entrée des données
Actuellement, les stats apparaissent en `fade-in` simple. On pourrait ajouter un **compteur animé** (0 → valeur finale) avec `requestAnimationFrame` pour un effet "dashboard vivant".

### 4.2 Micro-interactions sur les KPI
Les `DashboardStats` pourraient avoir :
- Sparkline miniature (courbe de 7 jours) sous chaque valeur
- Indicateur de tendance avec flèche animée
- Pulse subtil quand la valeur change (websocket temps réel)

### 4.3 Mode "Zen" pour le workspace
Un bouton dans la topbar pour masquer :
- Les halos décoratifs
- Le dock (mode plein écran par fenêtre)
- La topbar du workspace

Utile pour les présentations et le focus profond.

### 4.4 Thème "High Contrast"
Pour les utilisateurs malvoyants, un thème avec :
- Bordures de 2px solides
- Pas de glassmorphisme
- Couleurs pleines sans dégradés
- Texte 16px minimum

### 4.5 Cartes "respirantes" pour LEARNOS
Les cartes IA pourraient avoir une animation subtile de **gradient shift** (déplacement du dégradé de fond) pour signifier "intelligence active" — sans être distrayante.

---

## 5. Matrice de décision — Que changer maintenant ?

| Changement | Effort | Impact | Risque | Verdict |
|------------|--------|--------|--------|---------|
| Mobile workspace fallback | Moyen | **Très haut** | Faible | ✅ **À faire immédiatement** |
| Standardiser radius | Faible | Moyen | Faible | ✅ À faire |
| Réduire GPU load | Faible | Haut | Faible | ✅ À faire |
| AccentCard migration | Moyen | Moyen | Faible | ⏳ Prochain sprint |
| Empty states | Moyen | Moyen | Faible | ⏳ Prochain sprint |
| Recherche dock | Moyen | Moyen | Moyen | ⏳ Prochain sprint |
| Mode Zen | Faible | Moyen | Faible | 💡 Nice-to-have |
| Thème high contrast | Moyen | Haut (a11y) | Faible | 💡 À planifier |
| Persistance scroll | Moyen | Moyen | Moyen | 💡 Technique |
| Sparklines KPI | Moyen | Haut | Moyen | 💡 Nice-to-have |

---

## 6. Métriques de succès suggérées

Pour mesurer l'impact des améliorations :

1. **Core Web Vitals** (via Lighthouse) :
   - LCP (Largest Contentful Paint) < 2.5s
   - INP (Interaction to Next Paint) < 200ms
   - CLS (Cumulative Layout Shift) < 0.1

2. **Mobile usability** :
   - Taux d'utilisation du layout switcher sur mobile (< 5% = signe qu'il faut le masquer)
   - Taux de clic sur les catégories du dock (si faible = problème de discovery)

3. **Accessibilité** :
   - Score Lighthouse a11y ≥ 95
   - Navigation complète au clavier possible

4. **Perceived performance** :
   - Temps de première interaction avec le dock < 100ms
   - Animation genie < 16ms/frame (60fps)

---

## 7. Conclusion

SchoolPro possède un **design system remarquablement abouti** pour un projet de cette envergure. La direction "Azure Bloom" est cohérente, distinctive et stratégiquement pertinente. Les halos, le glassmorphisme sélectif, et la typographie quadri-fonte créent une expérience premium.

Les problèmes majeurs sont :
1. **L'expérience mobile** — le workspace multi-fenêtres n'est pas adapté aux écrans tactiles
2. **La performance GPU** — trop de flous simultanés
3. **L'accessibilité** — focus rings et contrastes à renforcer

Les corrections prioritaires (mobile fallback, standardisation radius, réduction GPU) sont à **faible effort et haut impact**. Elles devraient être traitées avant l'ajout de nouvelles fonctionnalités.

Le potentiel pour passer de "bon" à "exceptionnel" est réel — il tient dans la **cohérence micro-UX** (tous les composants doivent suivre le DS), la **performance perceptuelle** (60fps partout), et l'**accessibilité** (tout le monde doit pouvoir utiliser SchoolPro).
