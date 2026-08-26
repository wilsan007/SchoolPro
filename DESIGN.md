# Design System — SchoolPro

## Product Context
- **What this is:** Système de gestion scolaire multi-tenant (SaaS) avec IA pédagogique (LEARNOS)
- **Who it's for:** Écoles francophones (directeurs, enseignants, conseillers, comptables) — École Miriam, Djibouti
- **Space/industry:** EdTech, gestion scolaire, multi-tenant SaaS
- **Project type:** Web app / dashboard (35+ modules, data-heavy)
- **Languages:** fr / en / so (Français, Anglais, Somali)
- **Memorable thing:** Moderne & fluide + IA au cœur. L'utilisateur doit sentir que SchoolPro est radicalement différent d'EcolPro — la première impression doit être "ceci n'est pas le logiciel vert d'avant".

## Aesthetic Direction
- **Direction:** Azure Bloom — doux, vivant, technologique. Pas chaud comme l'ambre, pas froid comme le slate. Une palette aérée dans les bleus, turquoises et violets, avec des coins arrondis généreux et des halos subtils.
- **Decoration level:** Intentional — coins arrondis marqués, halos/auréoles colorées sur les éléments clés (stats, LEARNOS, actions), glassmorphisme sélectif.
- **Mood:** Féerique mais sérieux. Le turquoise dit "modernité", le violet dit "intelligence artificielle", le bleu clair dit "clarté et confiance".

## Differentiation from EcolPro
Cette direction est conçue pour qu'aucune comparaison visuelle avec EcolPro ne soit possible :
- **EcolPro** : vert 142°, Inter, sidebar dark slate, dégradés violet/rose, 12px radius, froid
- **SchoolPro** : turquoise 200°, violet 265°, Plus Jakarta Sans + Clash Grotesk, sidebar deep blue-violet, halos colorés, 18-22px radius, azure mist

## Typography
- **Display/Hero:** Clash Grotesk (via Fontshare) — pour titres de page, dashboard, login, headers LEARNOS. Caractère distinctif, signale "ceci n'est pas votre logiciel scolaire habituel"
- **Body:** Plus Jakarta Sans (via next/font/google) — propre, lisible, moderne. Variable CSS: `--font-jakarta`
- **UI/Labels:** Plus Jakarta Sans (same as body)
- **Data/Tables:** Geist avec `font-feature-settings: "tnum"` — pour notes, moyennes, finances. Les nombres doivent s'aligner en colonnes
- **Code:** JetBrains Mono
- **Loading:** Clash Grotesk via Fontshare CDN (`@fontsource/clash-grotesk` ou link direct), Plus Jakarta Sans via `next/font/google`, Geist via `next/font/google` ou `@fontsource/geist-sans`
- **Scale:**
  - xs: 0.75rem (12px) — captions, badges
  - sm: 0.875rem (14px) — body small, table cells
  - base: 1rem (16px) — body default
  - lg: 1.125rem (18px) — subtitles
  - xl: 1.25rem (20px) — card titles
  - 2xl: 1.5rem (24px) — page section titles
  - 3xl: 1.875rem (30px) — page titles (Clash Grotesk)
  - 4xl: 2.25rem (36px) — dashboard hero (Clash Grotesk)
  - 5xl: 3rem (48px) — login hero (Clash Grotesk)

## Color
- **Approach:** Balanced + accent expressif. Primaire turquoise (action), accent violet (IA/insight), accent tertiaire teal (data/info). Contraste froid-vif pour la fraîcheur.

### Light mode — Azure Bloom
```css
--background: 220 25% 96%;         /* soft azure mist */
--foreground: 230 20% 14%;         /* deep blue-violet */
--card: 220 25% 99%;               /* soft azure white */
--card-foreground: 230 20% 14%;
--popover: 220 25% 99%;
--popover-foreground: 230 20% 14%;
--primary: 200 60% 48%;            /* vivid turquoise #0E8FCE */
--primary-foreground: 0 0% 100%;
--secondary: 220 18% 95%;          /* soft azure gray */
--secondary-foreground: 230 20% 14%;
--muted: 220 18% 95%;
--muted-foreground: 220 15% 42%;
--accent: 265 55% 60%;             /* soft vivid purple #9B6FE0 — couleur LEARNOS/IA */
--accent-foreground: 0 0% 100%;
--destructive: 0 80% 50%;
--destructive-foreground: 0 0% 100%;
--border: 220 16% 90%;             /* soft azure border */
--input: 220 18% 95%;              /* opaque (pas glass) */
--ring: 200 60% 48%;               /* turquoise ring */
--radius: 1.25rem;                 /* 20px */
/* Cool accent tertiaire pour data/info */
--info: 175 55% 45%;               /* turquoise teal #14B8A6 */
--info-foreground: 0 0% 100%;
```

### Dark mode — Midnight Bloom
```css
--background: 230 25% 8%;          /* deep blue-violet charcoal */
--foreground: 220 20% 92%;
--card: 230 25% 10%;               /* deep midnight (opaque) */
--card-foreground: 220 20% 92%;
--popover: 230 25% 10%;
--popover-foreground: 220 20% 92%;
--primary: 200 60% 58%;            /* lighter turquoise */
--primary-foreground: 230 25% 8%;
--secondary: 230 20% 15%;
--secondary-foreground: 220 20% 92%;
--muted: 230 20% 15%;
--muted-foreground: 220 20% 60%;
--accent: 265 55% 65%;             /* lighter purple */
--accent-foreground: 0 0% 100%;
--destructive: 0 70% 45%;
--destructive-foreground: 0 0% 100%;
--border: 230 20% 18%;
--input: 230 20% 15%;              /* opaque (pas glass) */
--ring: 200 60% 58%;
--info: 175 55% 55%;               /* lighter teal */
--info-foreground: 0 0% 100%;
```

### Semantic colors
- **success:** `#059669` (emerald-600) — conservé pour le vert "ok"
- **warning:** `#EAB308` (yellow-500) — plus adapté à l'azure
- **error:** `#DC2626` (red-600)
- **info:** `#14B8A6` (teal-500) — turquoise accent

### Brand color scale — SchoolPro Azure
```ts
schoolpro: {
  50:  "#eff8ff",   // azure-50
  100: "#e0f2fe",   // azure-100
  200: "#bae6fd",   // azure-200
  300: "#7dd3fc",   // azure-300
  400: "#38bdf8",   // azure-400
  500: "#0ea5e9",   // azure-500
  600: "#0284c7",   // azure-600 (primary)
  700: "#0369a1",   // azure-700
  800: "#075985",   // azure-800
  900: "#0c4a6e",   // azure-900
}
```

### LEARNOS identity colors
- **Insight badge:** `bg-accent/10 text-accent rounded-full` (violet)
- **LEARNOS card accent:** `border-l-4 border-l-accent` (violet left border)
- **LEARNOS background tint:** `bg-purple-50/30` (light mode) / `bg-purple-900/5` (dark mode)
- **AI-generated content indicator:** pill avec icône cerveau/éclair en violet
- **LEARNOS glow:** `box-shadow: 0 0 40px rgba(155, 111, 224, 0.06)` + badge gradient violet

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Full retractable responsive sidebar + topbar + content
- **Sidebar:** 240px expanded, 68px collapsed, off-canvas drawer on mobile. Deep blue-violet. Rounded right edge (only on desktop). Grouped sections with headers.
- **Topbar:** 60px, contains toggle, title, search bar (pill, hidden on mobile), action icons, user avatar.
- **Content:** padding 28px (desktop), 16px (mobile).
- **Max content width:** fluid, min-width respected via `min-width:0` on main.
- **Grid:** 12 columns default, gap-4 to gap-6.
- **Border radius (hierarchical):**
  - sm: 8px — inputs, small buttons
  - md: 12px — buttons, badges
  - lg: 18px (1.125rem) — cards, containers (base `--radius`)
  - xl: 22px — large cards, panels
  - 2xl: 24px (1.5rem) — dialogs, modals
  - full: 9999px — avatars, pills, badges, search bar

## Halos & Glows
- **Logo:** double glow turquoise + violet `box-shadow: 0 4px 16px rgba(0,140,200,0.3), 0 0 20px rgba(140,90,220,0.15)`
- **Stat cards:** halo coloré au survol — gradient flou (filter: blur(12px)) sous la carte, opacity 0.12 → 0.2
- **LEARNOS card:** aura violette autour, badge en gradient violet, bouton d'action avec glow violet
- **Active rail item:** glow turquoise + barre/point actif
- **Buttons primary:** ombre turquoise subtile, légère élévation au hover
- **Buttons accent (LEARNOS):** double glow violet + translation Y

## Glassmorphism Rules (SELECTIVE)
**Use glassmorphism on:**
- Topbar (bg-azure-white/70 backdrop-blur-20px)
- Login card
- Some dashboard widgets

**Do NOT use glassmorphism on:**
- Data tables, lists, forms, inputs
- Sidebar (solid deep blue-violet)
- Complex data cards

## Motion
- **Approach:** Intentional — transitions douces, stat cards flottantes, LEARNOS respirant.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:**
  - micro: 100ms — hover states
  - short: 200ms — buttons, tabs, sidebar transition
  - medium: 300ms — page transitions, card entrances
  - long: 500ms — LEARNOS insights
- **Key animations:**
  - `sidebar-expand`: width 68px → 240px, 300ms ease-out
  - `stat-float`: translateY(-3px) + ombre étendue au hover
  - `halo-pulse`: opacity halo 0.12 → 0.2 au hover
  - `fade-up`: translateY(8px) → 0 + fade, 300ms

## Component Styling Guide

### Card
```tsx
// Standard data card
"rounded-[22px] border border-border bg-card"

// Dashboard stat card (with hover halo)
"rounded-[22px] border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"

// LEARNOS card (with violet aura)
"rounded-[22px] border border-purple-200/30 bg-gradient-to-br from-purple-50/90 to-cyan-50/50 shadow-[0_0_40px_rgba(155,111,224,0.06)]"
```

### Button
```tsx
// Primary
"bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"

// Accent / LEARNOS
"bg-accent text-accent-foreground rounded-xl transition-all duration-200 hover:-translate-y-0.5 shadow-[0_4px_12px_rgba(155,111,224,0.2),0_0_20px_rgba(155,111,224,0.1)]"

// Ghost
"bg-transparent text-foreground hover:bg-muted rounded-xl"
```

### Input / Textarea
```tsx
"bg-input border border-border rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
```

### Badge
```tsx
// Turquoise
"bg-[#0ea5e9]/10 text-[#0369a1] rounded-full"
// Violet
"bg-[#9b6fe0]/10 text-[#7c3aed] rounded-full"
// Teal
"bg-[#14b8a6]/10 text-[#0d9488] rounded-full"
```

### Sidebar item
```tsx
"flex items-center gap-3 px-4 py-3 rounded-2xl text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200"
// active:
"text-white bg-gradient-to-r from-primary to-[hsl(200,55%,42%)] shadow-[0_4px_16px_rgba(0,140,200,0.25)]"
```

## Responsive Behavior
- **Desktop (>1024px):** sidebar 240px, content fluid, 4 columns stats, search bar visible
- **Tablet (≤1024px):** sidebar auto-collapse to 68px, labels hidden until hover, 2 columns stats
- **Mobile (≤768px):** sidebar off-canvas drawer with overlay, toggle ☰, 1 column stats, search hidden, buttons full-width, topbar simplified
- **Small mobile (≤480px):** reduced padding, compact stats, topbar title hidden

## Login Page
- Split-screen : panneau gauche avec gradient turquoise→violet, form glassmorphique à droite
- Titre "SchoolPro" en Clash Grotesk, 48px
- Coins 24-28px, ombres colorées

## LEARNOS Visual Identity
- **Background tint:** `bg-purple-50/30` (light) / `bg-purple-900/5` (dark)
- **Card accent:** `border-l-4 border-l-accent` (violet left border)
- **AI badge:** pill gradient violet, avec icône cerveau/éclair
- **Motion:** fade-up 500ms, stat insights avec halo violet
- **Insight color:** tout ce qui est généré par l'IA utilise l'accent violet

## Navigation Architecture
- **Sidebar groups:** Pédagogie, Vie Scolaire, Intelligence (LEARNOS)
- **Topbar:** toggle, title, search, notifications, dark mode, language, user
- **Mobile:** sidebar off-canvas with overlay
- **Command palette:** Cmd+K to search modules

## PWA / Manifest
- `manifest.json`: `theme_color → #0ea5e9` (azure), `name → "SchoolPro"`

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-23 | Initial design system created | Direction Refined Tech, palette azure/turquoise/violet. But initial : ambre. |
| 2026-08-23 | Switch to Azure Bloom palette | User feedback: wanted softer, more coherent, more vivid, blue/turquoise/purple tones. |
| 2026-08-23 | Combined B+C layout | User wanted retractable sidebar (C) + full sidebar feel (B) + fully responsive. |
| 2026-08-23 | Generous rounded corners + halos | User explicitly requested rounded corners with shadows/glows. |
| 2026-08-23 | Differentiation from EcolPro | Primary changed from green to turquoise; design language changed from warm/slate to azure bloom. |
