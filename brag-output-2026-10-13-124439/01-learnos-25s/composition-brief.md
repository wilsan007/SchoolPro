# Hyperframes Composition Brief — V1 « Un logiciel discret » (25s)

## Objective
Vidéo de lancement verticale punchy pour SchoolPro — angle : sobriété & contrôle.
Cible directeurs. Vocabulaire « IA » proscrit à l'écran (badge LEARNOS discret en outro uniquement).

## Output
- Composition: `composition/` · Rendered: `brag.mp4` · Format: vertical 1080×1920 · Duration: 25s

## Source Material
- Project root: `/Users/awalehosman/Projects/SchoolPro`
- Primary files read: `AGENTS.md`, `DESIGN.md`, `src/lib/learnos/recommendation-engine.ts`,
  `src/lib/learnos/learning-twin.ts`, `src/i18n/fr.json`, `src/app/(auth)/login/page.tsx`
- Product name: SchoolPro · Tagline: « La gestion scolaire de nouvelle génération. »
- Copy verbatim (tracée) : « Une action, ou rien du tout. » (recommendation-engine.ts) ·
  « se taire au milieu » · « L'IA propose, l'enseignant valide » → à l'écran : « Il propose. Vous décidez. »
- Storyboard contract: `../brag-plan.md` (5 scènes, seams cut-the-curve LEFT, outro inverse-zoom interdit — cut-the-curve uniforme)

## Visual Identity
- BG #0F111A · Card #131622 · Turquoise #38BDF8/#0EA5E9 · Violet #9B6FE0 · Teal #14B8A6
- Text #E6E9F0 · Muted #919AA6 · Error #DC2626 · Success #059669
- Display: Clash Grotesk (500/600/700 @font-face locaux) · Body: Plus Jakarta Sans (variable) · Data: JetBrains Mono 600
- Radius 20-22px, halos turquoise/violet, ghost text 5-8%

## Audio
- Music: `assets/music/music.mp3` = vol-10 (110 BPM) · data-track-index 10 · volume 0.35 · duration 25
- Cue preset: bundled vol-10 — strongCues à 15.82 / 18.01 / 20.19 / 22.92 (fenêtre 0-25s)
- Beat-locks: tampon 1 @15.82, tampon 2 @18.01, logo @20.19 — marqués `// beat-locked`
- Beat-grid: 5 bandes de maîtrise sur beats consécutifs ~3.55→6.01 — marqués `// beat-grid`
- Audio-reactive: `assets/audio-data.js` (extraction vol-10, 30fps) — halo LEARNOS scale/opacity
  respire sur basses (±3-5%), aucun waveform/équalizer
- SFX (copiés dans assets/sfx/): drop_001/002 (bandes), click_001 (tampon 1), click_003 (tampon 2),
  impactBell_heavy_000 (logo), card-place-1 (preuves) — data-track-index 11+
- Restraint: aucun SFX pendant les tenues de lecture longue

## Requirements
- ≥1 élément audio-réactif branché (halo) ou échec documenté
- Seams: cut-the-curve LEFT sur inner .scene (±130px, power4.in out / power4.out in, fade trick)
- Stage ground opaque (#0F111A) sur #root — pas de flash blanc
- Tout texte lisible ≥0.8s labels / ≥1.2s phrases; entrées ≤800ms; pas d'idle wobble — staged reveals
- `npx hyperframes check` = 0 erreur (WCAG inclus) avant render
