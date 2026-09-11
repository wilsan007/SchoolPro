# Étape 8 — Pages, interface, accessibilité, traductions, conformité à DESIGN.md

**Score actuel : 6,8 / 10** (brut 6,8)
**Score cible : 9,7** · **Effort estimé : 12 à 16 jours-développeur**
Inventaire noté page par page : **annexe B** (moyenne 7,78 sur 86 pages ; aucune page ne peut dépasser 9,0 tant qu'il n'existe aucun `error.tsx`).

---

## 1. Périmètre

97 pages (`page.tsx`), dont 86 dans `(dashboard)`, 208 composants (`src/components/**`), 22 `loading.tsx`, `DESIGN.md`, `src/i18n/{fr,en,so}.json` (4 868 clés).

## 2. Ce qui est solide

- **Traductions complètes en clés** : `scripts/i18n-audit.mjs` rapporte **0 clé manquante** entre fr, en et so, et 0 clé orpheline.
- **Garde serveur** sur 78 pages sur 86 (`guardPage`) ; les 8 autres sont couvertes par le registre du middleware et par leurs API.
- **Composant `Dialog` de base sur Radix** (`src/components/ui/dialog.tsx`) : piège du focus, touche Échap et rôles ARIA fournis nativement.
- **Direction artistique documentée** (`DESIGN.md` : Azure Bloom, Clash Grotesk / Plus Jakarta Sans / Geist, jetons HSL) et polices chargées correctement (`src/app/layout.tsx:73`).
- **Mode intégré** (`?embedded=1`) propre pour l'espace de travail à fenêtres.

## 3. Constats

### UI-M1 — Moyenne — Aucune page d'erreur

`find src/app -name error.tsx` ne renvoie rien, et il n'y a pas non plus de `global-error.tsx`. Toute exception de rendu d'un Server Component (base lente, donnée inattendue) affiche l'écran d'erreur générique de Next.js, en anglais, sans bouton de reprise ni journalisation côté client.

### UI-M2 — Moyenne — Accessibilité des contrôles et des modales

- **26 boutons à icône seule sur 37** (`size="icon"`) n'ont ni `aria-label` ni `title`. Un lecteur d'écran annonce « bouton ». Il n'y a que **19** `aria-label` et **1** `sr-only` dans les 208 composants.
- **Environ 20 modales maison** (`fixed inset-0`) n'ont ni `role="dialog"`, ni `aria-modal`, ni fermeture par Échap, ni piège du focus : `EleveForm`, `ImportElevesDialog`, `AdmissionsView`, `AlumniView`, `CommunicationView`, `CoursView`, `EmploiDuTempsView`, `SmartSuggestPanel`, `ExamensManager`, `InventaireView`, `InscriptionsView`, `SuperAdminView`, `ExportMenu`, `VieScolaireView`, `Dock`, `Sidebar`, `MobileLayout`, `RequireSiteModal`… Le clavier « s'échappe » derrière la modale.
- **Aucun test d'accessibilité automatisé** (ni axe-core, ni Playwright avec `@axe-core/playwright`).

### UI-M3 — Moyenne — Forte dérive par rapport à DESIGN.md

**5 694** classes de couleurs Tailwind brutes dans **169** fichiers, au lieu des jetons définis par `DESIGN.md` (`primary`, `accent`, `info`, `muted`, `destructive`, plus `success` emerald-600 et `warning` yellow-500 autorisés). Répartition : `gray` 1 832, `red` 626, `amber` 558, `slate` 497, `green` 457, `blue` 438, `orange` 265, `indigo` 223, `purple` 125, `violet` 74… Et 128 couleurs hexadécimales en dur (`bg-[#…]`). Conséquences : le thème sombre et les futures personnalisations par établissement sont impossibles sans reprise fichier par fichier, et les contrastes ne sont pas garantis.

### UI-M4 — Moyenne — 12 % de l'interface somalie est en français

587 chaînes de `so.json` sur 4 868 sont **identiques** au français (294 pour `en.json`, dont une partie légitime : noms propres, sigles). Les familles somaliphones voient ces écrans en français. S'y ajoutent les messages envoyés directement aux parents (appel, relances), écrits en français dans le code (MET-H4, MET-H6).

### UI-B1 — Basse — Pages de test en production

`/test-telegram` et `/test-whatsapp` sont présentes dans le build de production. Elles sont réservées au SUPER_ADMIN, et leurs API (`/api/test/*`) sont bloquées en production, mais les pages restent atteignables.

### UI-B2 — Basse — États de chargement partiels

22 `loading.tsx` pour 86 pages du tableau de bord : les autres pages restent blanches pendant les requêtes lentes (le pooler transaction mesuré à environ 980 ms par requête rend ce cas fréquent).

## 4. Angles morts

1. **Aucun test visuel ni de non-régression d'interface** (captures Playwright par rôle).
2. **Aucune vérification du contraste** des combinaisons de jetons (turquoise sur azure, violet sur blanc) contre WCAG 2.2 AA.
3. **Parcours mobile web** (hors application native) : aucun test en viewport 375 px.
4. **Arabe et droite-à-gauche** : les mots-clés du bot parent gèrent l'arabe, mais l'interface n'a pas de locale `ar` (dette connue, `docs/learnos-etat.md`).

## 5. Notation

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 9 | Gardes serveur présentes | 10 |
| Exactitude (25 %) | 7 | Traductions partielles en somali ; pas de page d'erreur | 9,5 |
| Robustesse (15 %) | 6 | Pas d'`error.tsx` ; chargements partiels | 9,5 |
| Tests (15 %) | 5 | 18 specs E2E, aucune accessibilité, aucune capture | 9,5 |
| Traçabilité (10 %) | 6 | Erreurs client non remontées | 9,5 |
| Maintenabilité (10 %) | 5 | 5 694 couleurs brutes | 9,5 |
| **Brut** | **6,8** | | |

---

## 6. Cahier des charges

### UI-1 — Pages d'erreur et remontée des erreurs *(P1, 1 j)*

1. `src/app/global-error.tsx` et `src/app/(dashboard)/error.tsx` (composants client) : message traduit, bouton « Réessayer » (`reset()`), lien vers l'accueil du rôle, identifiant d'erreur (`error.digest`) affiché pour le support.
2. `src/app/(dashboard)/not-found.tsx` traduit.
3. Envoi de l'erreur au collecteur (INF-3/INF-4) avec `digest`, route, rôle, sans données personnelles.
4. Test Playwright : une page de test qui lève une exception affiche l'écran traduit, puis « Réessayer » la recharge.

### UI-2 — Accessibilité *(P1, 5 j)*

1. **Outillage** : ajouter `@axe-core/playwright` ; créer `tests/e2e/a11y.spec.ts`, qui visite les 20 pages les plus utilisées (liste validée par la direction) pour 4 rôles (TENANT_ADMIN, TEACHER, ACCOUNTANT, PARENT) et échoue sur toute violation « serious » ou « critical ».
2. **Boutons à icône** : ajouter `aria-label={t("…")}` aux 26 boutons (liste : `grep -rn 'size="icon"' src | grep -v "aria-label\|title="`). Ajouter une règle ESLint `jsx-a11y/control-has-associated-label` (paquet `eslint-plugin-jsx-a11y`, déjà inclus via `next/core-web-vitals` pour certaines règles) en erreur sur `src/components`.
3. **Modales** : remplacer chaque modale maison par `Dialog` (Radix) ou `AlertDialog`. Pour chacune, vérifier au clavier : Tab reste dans la modale, Échap ferme, le focus revient au déclencheur.
4. **Contrastes** : table des paires de jetons utilisées et de leur ratio, calculée par un script, avec correction de celles sous 4,5:1 (texte) ou 3:1 (grands textes et icônes). Toute modification de couleur est **soumise à validation** (règle du `CLAUDE.md` du projet : pas d'écart à DESIGN.md sans accord explicite).

### UI-3 — Retour aux jetons de DESIGN.md *(P2, 5 j, par lots)*

1. Dans `tailwind.config.ts`, déclarer les jetons sémantiques manquants s'ils n'existent pas : `success`, `warning`, et les niveaux d'alerte (`critique`, `fragile`…) utilisés par LEARNOS. Mapping à **faire valider** contre DESIGN.md.
2. Table de correspondance (à valider) : `gray-500` et `slate-500` → `muted-foreground` ; `gray-100` → `muted` ; `red-*` → `destructive` ; `green-*` et `emerald-*` → `success` ; `amber-*` et `yellow-*` → `warning` ; `blue-*` → `primary` ou `info` ; `purple-*` et `violet-*` → `accent`.
3. Script de codemod (`scripts/codemod-couleurs.mjs`) appliquant la table, **dossier par dossier**, avec revue visuelle (capture avant et après, voir UI-5) avant chaque fusion.
4. Garde en CI : `scripts/count-raw-colors.mjs --max <N>`, qui échoue si le nombre augmente, avec une valeur qui baisse à chaque lot. Objectif : 0 hors `src/components/ui` et hors graphiques (où une palette de données dédiée est définie).

### UI-4 — Somali complet et messages aux familles traduits *(P2, 3 j + traducteur)*

1. Extraire les 587 chaînes non traduites (script qui compare `so.json` et `fr.json`) vers un fichier de travail pour **un traducteur humain somaliphone**. Ne pas utiliser de traduction automatique non relue pour des messages officiels.
2. Ajouter au test i18n une règle : toute nouvelle clé fr doit avoir une valeur so **différente**, ou être listée dans `i18n-identiques-autorises.json` (noms propres, sigles).
3. Les messages aux familles (appel, relances, alertes) passent tous par des gabarits traduits (MET-4, MET-6).

### UI-5 — Tests de non-régression visuelle par rôle *(P2, 2 j)*

`tests/e2e/visuel.spec.ts` : capture (`toHaveScreenshot`) des 20 pages clés par rôle, en viewports 1440 px et 375 px, avec une date figée (Time Machine sur le tenant de démonstration) pour des données stables. Les références sont validées une première fois par la direction.

### UI-6 — Hygiène *(P3, 1 j)*

- Retirer `/test-telegram` et `/test-whatsapp` du build de production (dossier `(dev)` exclu par variable, ou suppression si ces pages ne servent plus).
- `loading.tsx` sur toutes les pages dont la requête principale dépasse 300 ms (mesure : INF-5).

## 7. Définition de « terminé »

- [ ] 0 violation axe « serious » ou « critical » sur les 20 pages clés × 4 rôles.
- [ ] `error.tsx`, `global-error.tsx` et `not-found.tsx` en place et testés.
- [ ] Couleurs brutes : 0 hors exceptions documentées ; revue visuelle signée.
- [ ] so.json : 0 chaîne identique au français hors liste autorisée.
- [ ] Annexe B régénérée : toutes les pages à 9,7 ou plus.
