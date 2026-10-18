# Brag Plan — SchoolPro · V4 « 65 modules. Une plateforme. » (45s)

## What is this app?
SchoolPro — 65 modules de gestion scolaire (routes du dashboard) : appel numérique,
bulletins PDF, examens, emploi du temps anti-chevauchement, facturation mensuelle
automatique et idempotente (le 1er du mois, 02:00 UTC, unicité garantie en base —
AGENTS.md), communication push/email/SMS/WhatsApp.

## The angle
Cible : direction + secrétariat. Leur douleur n'est pas la technologie, c'est **le
temps** et la double saisie. Storytelling avant/après : le monde papier/Excel chaotique
vs la journée fluide. Aucune mention d'IA : ce film vend de la productivité pure.

## Hook (first 2-3 seconds)
« Excel n'est pas un logiciel scolaire. » (deadpan, sans accusation — constat)

## Key moments
- Le chaos papier : post-it, registres, « appel papier · bulletins retapés · factures
  en retard » en cascade.
- L'appel numérique : grille d'élèves qui se coche en rafale — « L'appel en 30 secondes. »
- Les bulletins : un clic → le bulletin se génère, notes alignées — « Générés. Pas retapés. »
- La facturation : le calendrier bascule sur le 1er, 02:00 — « Les factures partent
  seules. Et une seule fois. » (idempotence — jamais deux factures pour un même mois)
- L'emploi du temps : un conflit clignote rouge → se résout vert — « Zéro chevauchement. »

## Outro / punchline
« Une équipe. Un logiciel. Toute l'école. » + logo + tagline + bande de modules
(Élèves · Notes · Absences · Cours · RH · Caisse — noms de routes réelles).

## User flow worth showing
Journée d'un secrétariat : appel → notes → bulletins → facturation → emploi du temps.
Recréé en HTML avec valeurs fictives.

## Tone
- Preset : app-store (feature cards, propre) + énergie punchy startup
- Creative direction : « le matin d'un secrétariat qui respire enfin »
- Interpretation : rythme soutenu, une fonctionnalité = une carte = un beat

## Format: vertical — 1080×1920
## Duration: 45s

## Visual identity
Identique V1 (Midnight Bloom, Clash Grotesk + Plus Jakarta Sans). UI recréée style
SchoolPro : cartes #131622 radius 22px, halos turquoise au survol, pills, chips.
Accents sémantiques DESIGN.md : success #059669, warning #EAB308, error #DC2626.

## Share copy (draft)
« Appel en 30 secondes. Bulletins générés, pas retapés. Factures parties avant le
petit-déjeuner du 1er. 65 modules — une seule plateforme. »

## Audio direction
- Role: warm bed énergique (dense rhythmic layer léger)
- Music: happy-beats-business-moves-vol-1 (120 BPM, le plus énergique)
- Music treatment: plein dès 0.5s, fade-out sur le logo final
- Music cue guidance: preset bundled (vol-1) ; strongCues 16.02/17.02/18.02 (fenêtre) —
  verrouiller la facturation ~17s et le logo ~21s (hors 25s le preset liste 16-21s :
  beats continue à ~0.5s — snap grid)
- Audio-reactive treatment: subtle — halos des cartes respirent avec les basses
- SFX posture: moderate — clicks par action simulée, card-slides par carte, bong au logo
- Audio-coupled moments: rafale de l'appel (série de clicks), génération bulletin
  (card-slide), calendrier (page flip ~switch), conflit→vert (error puis success), logo (bong)
- Restraint rule: pas de SFX quand un texte long se lit

## Storyboard

### Scene 1 — Hook — 3.5s
« Excel n'est pas un logiciel scolaire. » Clash 84px, tenu. Micro-caption : « On dit
ça avec affection. » (clin d'œil deadpan qui désamorce l'agressivité)
Sequential: none — slam et tenue
Audio intent: constat souriant
Audio-coupled idea: impact doux sur le slam
Music: montée d'entrée
Transition mood: cut-the-curve LEFT → Scene 2

### Scene 2 — Le chaos — 5.5s
3 cartes-post-it de travers : « Appel papier » / « Bulletins retapés » / « Factures
en retard » + ghost text « À retaper ce soir… ».
Sequential: oui — 3 post-it tombent en cascade sur beats (warning tintées)
Audio intent: le chaos familial, comique léger
Audio-coupled idea: impactWood par post-it
Music: bed plein
Transition mood: cut-the-curve LEFT → Scene 3

### Scene 3 — Appel numérique — 6.0s
Titre : « L'appel en 30 secondes. » Grille 3×4 d'avatars élèves, présents se cochent
en rafale (vagues), 2 absences en rouge, badge « 34 présents · 2 absents ».
Sequential: oui — vague de coches turbo (10 coches en 1.2s), badge claque
Audio intent: efficacité jubilatoire
Audio-coupled idea: série clicks rapide (amincie : 1 son par vague, pas par coche)
Music: énergie monte
Transition mood: cut-the-curve LEFT → Scene 4

### Scene 4 — Bulletins — 6.5s
« Bulletins générés. Pas retapés. » Un bulletin PDF glisse hors d'une carte : notes
tnum alignées, moyenne « 12,50 » turquoise, tampon « Publié ».
Sequential: le PDF slide, les notes se remplissent, tampon
Audio intent: soulagement
Audio-coupled idea: card-slide + drop sur tampon
Music: steady
Transition mood: cut-the-curve LEFT → Scene 5

### Scene 5 — Facturation — 6.5s
« Le 1er du mois. 02:00. » horloge/mini-calendrier → rafale de factures qui s'envolent.
« Les factures partent seules. » / « Et une seule fois — jamais deux. » (tampon
« Idempotent » traduit : badge « Un mois = une facture »)
Sequential: calendrier flip → 3 factures s'envolent en cascade → badge
Audio intent: magie administrative rassurante
Audio-coupled idea: switch (flip) + card-slide par facture // beat-locked ~17.02s
Music: swell
Transition mood: cut-the-curve LEFT → Scene 6

### Scene 6 — Emploi du temps & messages — 6.5s
Grille horaire : un conflit clignote rouge « Chevauchement détecté » → glisse →
« Zéro chevauchement. » Chips communication : « Push · Email · SMS · WhatsApp ».
Sequential: flash rouge → résolution verte → 4 chips arrivent
Audio intent: contrôle retrouvé
Audio-coupled idea: error_005 discret puis success cloche courte
Music: steady
Transition mood: cut-the-curve LEFT → Scene 7

### Scene 7 — Outro — 10.5s
« Une équipe. Un logiciel. Toute l'école. » (3 lignes cascade). Bande de modules :
« Élèves · Notes · Absences · Cours · RH · Caisse » (chips défilantes). Logo SchoolPro +
« La gestion scolaire de nouvelle génération. » + « © SchoolPro — Djibouti ».
Sequential: 3 lignes → chips → logo → tagline
Audio intent: résolution fière
Audio-coupled idea: bong logo // beat-locked ~21.01s
Music: fade-out 43→45s

**Music mood for this video:** app-store énergique
**Audio summary:** le lit le plus énergique de la série, chaque module rend son bruit de métier — coches, glissements, flip de calendrier — et l'outro tombe en fanfare discrète.
*Aucune mention technologique autre que les noms de modules réels du produit.*
