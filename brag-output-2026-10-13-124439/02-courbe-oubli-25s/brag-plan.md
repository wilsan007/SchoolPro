# Brag Plan — SchoolPro · V2 « L'oubli se prévient » (25s)

## What is this app?
SchoolPro — gestion scolaire (Djibouti) avec LEARNOS : courbe de l'oubli, demi-vie des
compétences, alerte « vacances creuses » (courbe-oubli.ts) : révisions ciblées AVANT le
départ en vacances.

## The angle
Cible : enseignants. Peur de l'IA : aucune mention technologique — c'est une histoire
**pédagogique et humaine** : l'oubli n'est pas une fatalité, il se mesure, se projette,
se prévient. On vend l'efficacité : agir avant l'échec plutôt que constater après.

## Hook (first 2-3 seconds)
« Pendant les vacances, votre classe oublie. » + une barre de maîtrise qui s'effrite
visiblement (100 → 52 → 30).

## Key moments
- La courbe exponentielle `mastery(t) = m₀ × e^(−λt)` se dessine, avec demi-vie marquée.
- L'alerte « Vacances creuses » : « 14 élèves passeront sous le seuil au retour. »
- La checklist de révisions qui se coche une à une — « avant le départ, quand c'est
  encore efficace » (courbe-oubli.ts).

## Outro / punchline
« On ne subit pas l'oubli. On l'anticipe. » + logo + tagline.

## User flow worth showing
Courbe → alerte projection vacances → liste élèves concernés → révisions ciblées.
Recréé en HTML ; prénoms fictifs (Amina, Yusuf, Hodan…).

## Tone
- Preset : cinematic (drame maîtrisé, révélation pédagogique)
- Creative direction : « le docu-science qui rend l'invisible visible »
- Interpretation : phrases déclaratives, tenues longues, courbe qui porte l'émotion

## Format: vertical — 1080×1920
## Duration: 25s

## Visual identity
Identique V1 (Midnight Bloom, #0F111A / #38BDF8 / #9B6FE0 / #14B8A6, Clash Grotesk +
Plus Jakarta Sans + JetBrains Mono). Accent émotion : la courbe passe du turquoise
(saine) à l'ambre (fragile) au rouge (sous le seuil) — semantic colors DESIGN.md.

## Share copy (draft)
« Chaque compétence a une demi-vie. SchoolPro projette l'oubli des vacances et
recommande les révisions avant le départ. On ne subit pas l'oubli. »

## Audio direction
- Role: cinematic support, sobre
- Music: happy-beats-business-moves-vol-12 (110 BPM, steady clean)
- Music treatment: lit bas, swell sur l'alerte (10.93s strongCue), fade-out final
- Music cue guidance: preset bundled (vol-12) ; strongCues 8.74 / 10.93 / 13.11
- Audio-reactive treatment: subtle — la courbe trace ses points sur les beats (rendu déterministe)
- SFX posture: sparse — tick par point de courbe, bong sur l'alerte, coches checklist
- Audio-coupled moments: décroissance de la barre (tick descendant), alerte (bong), 3 coches (card-place)
- Restraint rule: pas de SFX pendant la lecture des phrases longues

## Storyboard

### Scene 1 — Hook décroissance — 3.0s
« Pendant les vacances, » / « votre classe oublie. » Une barre turquoise pleine
s'effrite en trois crans (100 → 52 → 30), la teinte dérive vers le rouge.
Ghost text « e^(−λt) » 6% derrière.
Sequential: la barre décroît crénométrée sur 3 beats
Audio intent: inquiétude douce, constat
Audio-coupled idea: 3 ticks descendants alignés beats
Music: bed vol-12, entrée discrète
Transition mood: cut-the-curve LEFT → Scene 2

### Scene 2 — La demi-vie — 5.0s
« Chaque compétence a une demi-vie. » + courbe exponentielle SVG qui se trace point à
point (6 points), équation en JetBrains Mono : « mastery(t) = m₀ × e^(−λt) », repère
« demi-vie » sur la courbe.
Sequential: oui — 6 points de courbe sur beats successifs, équation apparaît à la fin
Audio intent: science calme, fascination
Audio-coupled idea: tick par point // beat-grid
Music: steady
Transition mood: cut-the-curve LEFT → Scene 3

### Scene 3 — Alerte vacances creuses — 5.5s
Carte d'alerte (bord violet LEARNOS) : titre « Vacances creuses » —
« 14 élèves passeront sous le seuil au retour. » + 4 chips prénoms fictifs.
Sequential: oui — carte claque, puis chips arrivent une à une
Audio intent: le moment de gravité
Audio-coupled idea: bong à l'apparition de la carte // beat-locked 10.93s
Music: swell sur l'alerte
Transition mood: cut-the-curve LEFT → Scene 4

### Scene 4 — Révisions ciblées — 5.5s
« Révisions ciblées. Avant le départ. » + checklist 3 items qui se cochent :
« Fractions ✓ » « Théorème de Thalès ✓ » « Orthographe du récit ✓ ».
Caption : « Quand c'est encore efficace. »
Sequential: oui — 3 coches sur beats, puis caption
Audio intent: reprise de contrôle, optimisme méthodique
Audio-coupled idea: card-place par coche
Music: redevient lumineuse
Transition mood: cut-the-curve LEFT → Scene 5

### Scene 5 — Outro — 6.0s
« On ne subit pas l'oubli. On l'anticipe. » (2 lignes, la 2e turquoise) →
logo SchoolPro + « La gestion scolaire de nouvelle génération. » + « © SchoolPro — Djibouti ».
Sequential: phrase → logo → tagline
Audio intent: résolution, fierté
Audio-coupled idea: cloche sur logo // beat-locked ~17.47s
Music: fade-out 23→25s

**Music mood for this video:** cinematic-docu sobre
**Audio summary:** un lit régulier, une décroissance sonore qui illustre l'oubli, un bong de gravité, des coches de reprise en main, une cloche de résolution.
*Prénoms fictifs ; zéro vocabulaire technologique — le propos est purement pédagogique.*
