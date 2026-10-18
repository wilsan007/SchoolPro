# Brag Plan — SchoolPro · V1 « Un logiciel discret » (25s)

## What is this app?
SchoolPro — SaaS de gestion scolaire (Djibouti) avec LEARNOS, un moteur de recommandation
pédagogique 100 % déterministe qui « traduit un profil de maîtrise en une action, ou en
rien du tout » (recommendation-engine.ts).

## The angle
La cible a peur de l'IA. On ne vend donc pas de la technologie : on vend **la sobriété**.
Un logiciel qui hurle des alertes en permanence est un logiciel qu'on ignore. SchoolPro
se tait quand tout va bien — et quand il parle, il montre ses preuves et s'incline devant
l'enseignant. La différenciation LEARNOS passe par le comportement, pas par le mot.

## Hook (first 2-3 seconds)
« Votre logiciel parle trop. » (accroche universelle, deadpan) → « Le nôtre se tait.
À dessein. »

## Key moments
- Les 5 bandes de maîtrise (EXCELLENCE→CRITIQUE) s'empilent ; la bande du milieu
  « CONSOLIDE » reçoit une étiquette « silence » — le système déclare lui-même son silence.
- « Et quand il parle, il montre ses preuves. » : carte de recommandation avec preuves
  chiffrées + « pourquoi » lisible : 3 compétences en aval dépendent de celle-ci.
- Double tampon : « Il propose. » → « Vous décidez. » — l'enseignant a le dernier mot.

## Outro / punchline
Badge violet discret « LEARNOS · intelligence pédagogique » + logo SchoolPro +
« La gestion scolaire de nouvelle génération. »

## User flow worth showing
Système de recommandation : profil de maîtrise → une seule action proposée avec ses
preuves → validation par l'enseignant. Recréé en HTML (recommandation sur « Fractions »,
prénoms fictifs de démo).

## Tone
- Preset : yc-parody (deadpan sérieux, claims assénés comme faits)
- Creative direction : « lancement startup sobre face aux gadgets bruyants »
- Interpretation : phrases courtes assénées, tenues longtemps, zéro fanfaronnance

## Format: vertical — 1080×1920
## Duration: 25s

## Visual identity (from the project — DESIGN.md, mode sombre)
- Background: #0F111A · Card: #131622
- Accent: turquoise #38BDF8 / #0EA5E9 · Violet LEARNOS: #9B6FE0 · Teal: #14B8A6
- Text: #E6E9F0 · Muted: #919AA6
- Display: Clash Grotesk · Body: Plus Jakarta Sans · Data: JetBrains Mono
- Strongest visual element: bande violet LEARNOS + halos turquoise/violet, radius 20px

## Share copy (draft)
« SchoolPro ne parle pas pour ne rien dire. Une recommandation — ou rien. Et c'est
toujours l'enseignant qui décide. »

## Audio direction
- Role: warm bed, punchy discret
- Music: happy-beats-business-moves-vol-10 (110 BPM, punchy compact)
- Music treatment: fade-in 0-1s, lit dès 0.27s, fade-out final sur le logo
- Music cue guidance: preset bundled (vol-10) ; strongCues 0.27 / 3.55 / 6.01 / 11.46 ;
  beat grid ~0.55s — séquencer les 5 bandes sur les beats 3.55-6.82
- Audio-reactive treatment: subtle — halo violet de la scène respire avec les basses
- SFX posture: sparse (3-5) — drop pour les bandes, click pour les tampons, cloche pour le logo
- Audio-coupled moments: étiquette « silence » (drop doux), double tampon (2 clicks), logo (cloche)
- Restraint rule: aucun SFX pendant les tenues de texte longues

## Storyboard

### Scene 1 — Hook — 3.0s
« Votre logiciel parle trop. » (Clash 96px, white) tient 1.2s →
« Le nôtre se tait. À dessein. » (turquoise) remplace en waterfall.
Ghost text « LEARNOS » 6% derrière, halo turquoise bas.
Sequential: oui — cascade mot à mot sur la 2e ligne
Audio intent: deadpan, la musique démarre douce
Audio-coupled idea: aucun sur le 1er mot ; beats 0.27/0.82 portent la cascade
Music: bed vol-10 fade-in
Transition mood: cut-the-curve LEFT → Scene 2

### Scene 2 — Le silence à dessein — 5.0s
« Une action, ou rien du tout. » titre. Les 5 bandes s'empilent une à une (EXCELLENCE
violet → CONSOLIDE gris → CRITIQUE rouge). Bande CONSOLIDE s'étiquette « silence ».
Caption bas : « Tout va bien ? Il n'en dit rien. »
Sequential: oui — 5 bandes sur beats consécutifs (3.55→6.01), tenue complète ensuite
Audio intent: chaque arrivée = drop discret ; l'étiquette silence = silence de SFX (le son illustre le propos)
Audio-coupled idea: beat-grid 5 bandes
Music: bed monte
Transition mood: cut-the-curve LEFT → Scene 3

### Scene 3 — Les preuves — 6.0s
« Et quand il parle, il montre ses preuves. » Carte recommandation : « Réviser les
fractions » + preuves : « 3 compétences en aval dépendent d'elle » · « confiance 0,88 »
· « 5 preuves ». Puis ligne : « Rien n'est écrit sans vous. »
Sequential: oui — la carte assemble ses 3 lignes de preuve une à une
Audio intent: crédibilité, calme méthodique
Audio-coupled idea: les 3 preuves tickent (card-place), pause 0.5s avant « Rien n'est écrit sans vous. »
Music: bed steady
Transition mood: cut-the-curve LEFT → Scene 4

### Scene 4 — Vous décidez — 5.5s
Tampon 1 : « Il propose. » (turquoise) claque. Beat.
Tampon 2 : « Vous décidez. » (violet, plus grand) claque dessus.
Sous-ligne : « Toujours. »
Sequential: oui — 2 tampons en cascade avec pause dramatique entre (stillness-before-climax 0.5s)
Audio intent: la punchline de contrôle — le moment anti-peur
Audio-coupled idea: impactSoft pour chaque tampon, cloche sur le 2e
Music: swell léger vers 20.19s (strongCue) // beat-locked: 2e tampon à 20.19s
Transition mood: cut-the-curve LEFT → Scene 5

### Scene 5 — Outro logo — 5.5s
Badge violet discret : « LEARNOS · intelligence pédagogique » (petit, 22px).
Logo SchoolPro (icône + wordmark Clash). Tagline : « La gestion scolaire de nouvelle
génération. » micro-mention « © SchoolPro — Djibouti » en bas.
Sequential: badge → logo → tagline en cascade douce
Audio intent: résolution, fierté calme
Audio-coupled idea: cloche finale sur le logo // beat-locked 22.92s, fade-out musique
Music: fade-out 23→25s

**Music mood for this video:** deadpan-punchy
**Audio summary:** un lit compact et propre, cinq arrivées de bandes sur le beat, deux tampons assénés, une cloche finale — le son respire plus que n'en fait la démonstration.
*Prénoms fictifs de démonstration uniquement ; aucune mention « IA/LLM/algorithme » à l'écran.*
