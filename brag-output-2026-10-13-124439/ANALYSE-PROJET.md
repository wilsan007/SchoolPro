# SchoolPro — Analyse marketing approfondie (base des 6 vidéos)

> Série : 3 × 25s + 3 × 45s · Vertical 9:16 (1080×1920) · Français · Ton « punchy startup »
> Produite avec /brag + HyperFrames · Branding : DESIGN.md (Azure Bloom / Midnight Bloom)

## 1. Qu'est-ce que SchoolPro ?

SaaS multi-tenant de gestion scolaire de nouvelle génération (Next.js 15, Prisma, PostgreSQL/Supabase,
RLS, 2FA, Turnstile) avec **LEARNOS**, un moteur d'intelligence pédagogique **100 % déterministe**.
Marché : écoles francophones — tête de pont Djibouti / MENFOP, aligné GOSE 2.0.

Tagline officielle (src/i18n/fr.json → login.heroTitle) :
**« La gestion scolaire de nouvelle génération »**
Sous-titre officiel (login.heroSubtitle) :
**« Élèves, notes, absences, IA pédagogique LEARNOS — tout réuni dans une plateforme fluide et moderne. »**
Signature : **« © SchoolPro — Djibouti »**

## 2. Les particularités (ce qu'aucun concurrent n'a)

1. **LEARNOS — l'IA qui ne devine pas.** Moteur de recommandation universel, ENTIÈREMENT
   DÉTERMINISTE — AUCUN APPEL DE MODÈLE (en-tête du code source). « Traduit un profil de
   maîtrise en **une action, ou en rien du tout**. » Règle d'or : **« L'IA propose,
   l'enseignant valide — jamais d'écriture automatique dans le graphe. »**
   4 règles fondatrices : couvrir tout le spectre (de CRITIQUE à EXCELLENCE — l'élève qui
   maîtrise vite s'ennuie en silence, c'est une perte invisible) · se taire au milieu
   (CONSOLIDE → délibérément rien) · preuve suffisante (sous le seuil de confiance :
   aucune recommandation) · l'obligation se déduit du **graphe de prérequis**, pas d'un seuil.
2. **Le jumeau d'apprentissage.** Chaque élève a un profil de maîtrise avec **deux chiffres
   jamais confondus : maîtrise et confiance**. « La récence pondère, elle ne pénalise pas. »
   Statut UNKNOWN sous seuil de preuve : « un système incapable de se taire quand il ne sait
   pas » serait inutile.
3. **La courbe de l'oubli.** Chaque compétence a une demi-vie : `mastery(t) = m₀ × e^(−λt)`.
   L'alerte « **vacances creuses** » projette la décroissance sur la durée des vacances et
   identifie les élèves qui passeront sous le seuil **au retour** → révisions ciblées
   **avant le départ**.
4. **L'exactitude n'est pas négociable.** Notes en **centièmes entiers** (14,50 → 1450) :
   en binaire `0,1 + 0,2 ≠ 0,3` ; une moyenne pondérée peut afficher « 10,00 » pour un
   9,995 réel — et basculer un rang. Cloisonnement **fail-closed** : « un `null` dans un
   filtre ne signifie pas "tous", il signifie "aucun" » (DENY_ALL par défaut, RLS PostgreSQL).
5. **Trilingue fr / en / so.** Français, anglais, somali — l'i18n natif du Djibouti réel.
6. **Pensé pour le terrain.** Mobile (Capacitor), PWA hors-ligne, webhooks WhatsApp/SMS
   signés, push FCM. 65 modules : appel numérique, bulletins PDF, conseil de classe,
   examens, emploi du temps anti-chevauchement, facturation mensuelle **automatique et
   idempotente** (le 1er du mois à 02:00 UTC, unicité garantie en base), RH, infirmerie,
   orientation, alumni…
7. **Ingénierie de confiance.** 161 fichiers de tests · 29 migrations additives ·
   audit automatique du filtre année (Time Machine) · 11 rôles RBAC · 2FA.

## 3. Les 3 promesses marketing (efficacité · productivité · efficience)

- **Efficacité** : voir les difficultés AVANT l'échec (courbe de l'oubli, jumeau, décrochage).
- **Productivité** : une plateforme, zéro double saisie (appel → bulletins → facturation).
- **Efficience** : exactitude mathématique + cloisonnement fail-closed + coûts maîtrisés
  (0 appel de LLM pour décider = reproductible, auditable, opposable).

## 4. Identité visuelle (DESIGN.md → vidéo, mode sombre « Midnight Bloom »)

- Fond : `#0F111A` (deep blue-violet charcoal, hsl 230 25% 8%) · cartes `#131622`
- Primaire turquoise : `#38BDF8` / solide `#0EA5E9` (azure-500)
- Accent LEARNOS violet : `#9B6FE0` (+ glow `rgba(155,111,224,·)`)
- Info teal : `#14B8A6` · success `#059669` · warning `#EAB308` · error `#DC2626`
- Texte : `#E6E9F0` · muted `#919AA6`
- Display : **Clash Grotesk** (500/600/700) · Body : **Plus Jakarta Sans** (variable 400–800)
  · Data/maths : **JetBrains Mono 600** · Radius 18–24px · Halos turquoise + violet
  · Motion : fade-up 300ms, insights LEARNOS 500ms, ease-out entrées / ease-in sorties

## 5. Mapping 6 vidéos

| # | Titre | Durée | Angle | Musique (Happy Beats) |
|---|-------|-------|-------|------------------------|
| 1 | Une action, ou rien du tout | 25s | Particularité : LEARNOS déterministe | vol-10 |
| 2 | La courbe de l'oubli | 25s | Efficacité : anticiper l'oubli | vol-12 |
| 3 | L'exactitude n'est pas négociable | 25s | Efficience : maths + sécurité | vol-9 |
| 4 | 65 modules. Une plateforme. | 45s | Productivité : avant/après | vol-1 |
| 5 | Le jumeau numérique | 45s | Particularité : LEARNOS en profondeur | vol-11 |
| 6 | Pensé pour Djibouti | 45s | Marché : trilingue, mobile, terrain | vol-9 |

## 6. Règle de vérité (brag step-3 : grounding)

Toute affirmation à l'écran est tracée au projet (fichiers, docs, i18n). Aucune donnée
réelle d'élève : prénoms de démonstration fictifs (Amina, Yusuf, Hodan…), signalé dans
chaque plan. Aucun secret, hôte, ni donnée personnelle réelle à l'écran.

## 7. CONTRAINTE DE PERCEPTION (brief utilisateur — prioritaire)

**La population cible n'est pas initiée à l'IA et en a peur.** Conséquences créatives :

- **Vocabulaire proscrit à l'écran** : « IA », « LLM », « algorithme », « modèle »,
  « déterministe », « génératif », « jumeau numérique » (trop sci-fi).
- **Vocabulaire de substitution** : SchoolPro comme *sujet qui agit* — « SchoolPro
  remarque », « il montre ses preuves », « il sait dire "je ne sais pas" », « il se tait
  quand tout va bien », « il propose, vous décidez ».
- **4 piliers anti-peur, tous tracés dans le code source** :
  1. *Discretion* — « Se taire au milieu » (recommendation-engine.ts) : un système qui
     recommande à tout le monde n'est plus lu.
  2. *Transparence* — « Ne rien dire sans preuve suffisante » : chaque recommandation
     s'accompagne de ses preuves.
  3. *Humilité* — statut UNKNOWN « quand il ne sait pas, il le dit » (learning-twin.ts) :
     jamais d'invention.
  4. *Contrôle* — « L'IA propose, l'enseignant valide » (AGENTS.md) : à l'écran, sans le
     mot IA : « Il propose. Vous décidez. »
- **Mention « intelligence pédagogique »** : 1 badge violet discret dans V1 et V5
  uniquement. Jamais en accroche, jamais dans un hook, jamais animé en fanfare.
- **On vend des bénéfices humains** : du temps rendu, des difficultés vues avant l'échec,
  des moyennes justes, des parents rejoints — jamais de la technologie pour la technologie.

## 8. Cibles distinctes par vidéo

| # | Vidéo | Cible principale | Objectif |
|---|-------|------------------|----------|
| 1 | Un logiciel discret | Directeurs d'établissement | Différenciation : l'assistant sobre, pas le gadget |
| 2 | L'oubli se prévient | Enseignants | Efficacité pédagogique : anticipation |
| 3 | L'exactitude n'est pas négociable | Direction, comptabilité, parents | Efficience : confiance & intégrité |
| 4 | 65 modules. Une plateforme. | Direction + secrétariat | Productivité : tout-en-un, zéro double saisie |
| 5 | Aucun élève invisible | Enseignants, conseillers | Suivi individualisé (LEARNOS, ultra subtil) |
| 6 | Pensé pour Djibouti | Parents, communauté, autorités | Ancrage local, adoption, fierté |
