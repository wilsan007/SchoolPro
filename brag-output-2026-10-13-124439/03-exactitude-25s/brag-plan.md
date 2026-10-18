# Brag Plan — SchoolPro · V3 « L'exactitude n'est pas négociable » (25s)

## What is this app?
SchoolPro — gestion scolaire (Djibouti) : notes en centièmes entiers (classe Note,
src/lib/domain/note.ts — 14,50 → 1450), cloisonnement fail-closed (src/lib/site-scope.ts,
DENY_ALL par défaut), RLS PostgreSQL, 161 fichiers de tests, 29 migrations.

## The angle
Cible : direction, comptabilité, parents. Zéro mention technologique de l'IA — on vend
**l'intégrité** : une moyenne est un acte de justice. Une erreur d'arrondi peut faire
basculer un rang, une mention, un redoublement. SchoolPro rend cette classe d'erreur
impossible, et l'accès refusé vaut mieux que l'accès excessif.

## Hook (first 2-3 seconds)
En JetBrains Mono géant : « 0,1 + 0,2 ≠ 0,3 » — « En binaire, c'est vrai. Votre
logiciel de notes le sait-il ? »

## Key moments
- « 9,995 ou 10,00 ? » — une balance qui penche au fil d'une virgule qui bouge : « Un
  rang entier peut basculer. » (AGENTS.md : l'erreur cumulée peut faire basculer un
  rang ou afficher « 10,00 » pour un 9,995 réel.)
- La transformation « 14,50 → 1450 » : les moyennes deviennent des entiers, « L'erreur
  d'arrondi n'existe plus. »
- Le coffre fail-closed : « Un filtre vide ne veut pas dire "tous". Il veut dire
  "aucun". » — porte qui se ferme, « Accès refusé », chips « Cloisonnement par
  établissement · RLS PostgreSQL ».

## Outro / punchline
« 161 tests. 29 migrations. 0 approximation. » + logo + tagline.

## User flow worth showing
Saisie d'une note → moyenne calculée en entiers → cloisonnement par établissement.
Recréé en HTML (valeurs de démo).

## Tone
- Preset : deadpan (gravité sèche) enrichi de punchs yc-parody
- Creative direction : « l'ingénierie comme acte de justice sociale »
- Interpretation : claims mathématiques assénés, tenues longues, typographie data

## Format: vertical — 1080×1920
## Duration: 25s

## Visual identity
Identique V1/V2 (Midnight Bloom). Data font JetBrains Mono en vedette (DESIGN.md :
Geist/tnum pour les nombres — JetBrains Mono en substitution maison, même rôle).
Accent : rouge #DC2626 pour l'erreur, turquoise #38BDF8 pour la justesse, violet pour
la sécurité, emerald #059669 pour les vérifications.

## Share copy (draft)
« En binaire, 0,1 + 0,2 ≠ 0,3. Alors SchoolPro calcule vos moyennes en centièmes
entiers. L'erreur d'arrondi n'existe plus — et un accès sans périmètre est un accès
refusé. »

## Audio direction
- Role: sparse professional accents, deadpan
- Music: happy-beats-business-moves-vol-9 (115 BPM, laid-back)
- Music treatment: lit discret 0.12-0.2 de volume, fade-out final
- Music cue guidance: preset bundled (vol-9) ; strongCues 2.12 / 4.23 / 8.44 (fenêtre utile)
- Audio-reactive treatment: subtle — halo de la formule respire avec le bed
- SFX posture: very sparse — impact doux pour les équations, clac pour la porte, cloche finale
- Audio-coupled moments: slam de la formule (impact), bascule de balance (tick), porte (clac), coches (card-place)
- Restraint rule: laisser respirer les tenues — le deadpan vit dans le silence

## Storyboard

### Scene 1 — Hook mathématique — 3.0s
Slam mono géant : « 0,1 + 0,2 ≠ 0,3 » (rouir vers blanc). Sous-ligne : « En binaire,
c'est vrai. » Ghost text « IEEE 754 » 5% (clignement d'œil aux initiés, invisible pour les autres).
Sequential: la formule claque entière, le ≠ pulse
Audio intent: choc sec, constat
Audio-coupled idea: impactSoft sur le slam
Music: entrée très discrète
Transition mood: cut-the-curve LEFT → Scene 2

### Scene 2 — La balance — 5.5s
« 9,995 ou 10,00 ? » Balance SVG penche progressivement. Caption : « Un rang entier
peut basculer. »
Sequential: la balance penche par crans (3 tick), la virgule glisse d'un pixel — détail qui tue
Audio intent: gravité du détail
Audio-coupled idea: tick par cran de balance
Music: bed discret
Transition mood: cut-the-curve LEFT → Scene 3

### Scene 3 — Centièmes entiers — 5.5s
« 14,50 → 1450 » transformation mono géante (turquoise).
« Les moyennes en centièmes entiers. » / « L'erreur d'arrondi n'existe plus. »
Sequential: la virgule s'envole, les zéros se compactent — morph visuel du nombre
Audio intent: la solution, propre et définitive
Audio-coupled idea: whoosh doux sur la transformation
Music: remonte d'un cran
Transition mood: cut-the-curve LEFT → Scene 4

### Scene 4 — Fail-closed — 6.0s
« Un filtre vide ne veut pas dire "tous". » / « Il veut dire "aucun". »
Porte-coffre SVG qui se scelle : « Accès refusé » (violet). Chips :
« Cloisonnement par établissement » · « RLS PostgreSQL ».
Sequential: porte se ferme (clac), tampon « Accès refusé », chips arrivent
Audio intent: sécurité rassurante
Audio-coupled idea: clac de porte + bong sur le tampon
Music: bed steady
Transition mood: cut-the-curve LEFT → Scene 5

### Scene 5 — Outro — 5.0s
« 161 tests. 29 migrations. 0 approximation. » (les 3 nombres tombent en cascade,
turquoise/violet/rouge→blanc). Logo + « La gestion scolaire de nouvelle génération. »
+ « © SchoolPro — Djibouti ».
Sequential: 3 stats en cascade beatée, logo, tagline
Audio intent: fierté d'ingénieur, résolution
Audio-coupled idea: card-place par stat, cloche logo // beat-locked ~17.5s
Music: fade-out 23→25s

**Music mood for this video:** deadpan posé, punctuations sèches
**Audio summary:** presque du silence habité : un slam, trois ticks de balance, un clac de porte, une cascade de preuves chiffrées, une cloche.
*Zéro vocabulaire technologique ; les chiffres parlent d'eux-mêmes.*
