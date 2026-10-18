# VIDEO 1 « Les deux élèves invisibles » — Production Higgsfield
### Plans réalistes (Seedance 2.5) · 2 formats : **9:16** (social, natif) + **16:9** (YouTube/site, via reframe)

> **Chaîne** : Seedance 2.5 (`seedance_2_5`) génère le B-roll réaliste en 9:16 →
> workflow `reframe` produit le 16:9. Les HUD, constellations, tampons et typographies
> sont posés ensuite en HyperFrames (identité Midnight Bloom) — jamais générés par le
> modèle vidéo (règle : pas de texte généré à l'écran).
> **Prénoms fictifs** uniquement. Zéro mot proscrit à l'écran (§8 FORCE-DE-VENTE).

## Prérequis (une fois)
```bash
export PATH="$HOME/.local/bin:$PATH"
higgsfield auth login          # interactif — navigateur
higgsfield workspace set <id>  # si demandé
```

## Scènes à générer (B-roll réaliste)

### S1 — Le hook : deux élèves, un écran (le plus important)
Durée 6 s · 9:16 natif · Seedance 2.5
```bash
higgsfield generate create seedance_2_5 \
  --prompt "Split-screen vertical composition, two Djiboutian teenagers of Somali and Afar heritage with fine sharp facial features, in a bright Djibouti middle-school classroom. Top half: a confident girl with delicate Somali features, high cheekbones, finishing her worksheet, pen down, looking at the wall clock, bored and restless. Bottom half: a boy with fine Afar features frozen over his paper, pencil hovering, blocked and anxious. Static frozen moment, natural daylight through windows, warm tones, shallow depth of field, documentary photography, 35mm lens" \
  --aspect_ratio 9:16 \
  --duration 6 \
  --wait
```

### S2 — L'oublié n°1 : celui qui s'ennuie
Durée 5 s · 9:16
```bash
higgsfield generate create seedance_2_5 \
  --prompt "A confident Djiboutian teenage girl of Somali heritage with fine delicate facial features, high cheekbones and narrow jawline, sitting in a sunlit classroom in Djibouti, finished worksheet on her desk, she stares out of the window, chin on hand, visibly bored and disengaged, other students working in the blurred background, slow subtle dolly in on her face, warm natural light, cinematic documentary style, 35mm" \
  --aspect_ratio 9:16 \
  --duration 5 \
  --wait
```

### S3 — L'oublié n°2 : celui qui bloque
Durée 5 s · 9:16
```bash
higgsfield generate create seedance_2_5 \
  --prompt "Close-up on a Djiboutian teenage boy of Afar heritage with fine sharp facial features and narrow jawline, in a Djibouti classroom, rubbing his pencil tip nervously over a math worksheet covered in crossed-out calculations, eyebrows knitted in frustration, the same exercise repeated five times on the page, slow push in, soft window light, warm documentary tone, 50mm lens, shallow focus" \
  --aspect_ratio 9:16 \
  --duration 5 \
  --wait
```

### S4 — LE TWIST : il comprend enfin (le payoff)
Durée 6 s · 9:16
```bash
higgsfield generate create seedance_2_5 \
  --prompt "The same Djiboutian teenage boy of Afar heritage with fine sharp facial features, in a Djibouti classroom suddenly writing fluently, a small genuine smile of relief, the answer coming out correct, pen moving with confidence, warm golden light intensifying slightly on his face, slow dolly in, uplifting documentary cinematography, 50mm" \
  --aspect_ratio 9:16 \
  --duration 6 \
  --wait
```

### S5 — La fin : les deux avancent, chacun à son rythme
Durée 6 s · 9:16
```bash
higgsfield generate create seedance_2_5 \
  --prompt "Wide shot of a sunlit classroom in Djibouti, two Djiboutian teenagers of Somali and Afar heritage with fine sharp facial features, at their desks working at their own pace, the girl advancing confidently into harder exercises, the boy steadily catching up, both focused and calm, teacher walking between rows in the background, warm hopeful morning light, cinematic documentary style, 35mm" \
  --aspect_ratio 9:16 \
  --duration 6 \
  --wait
```

## Format 2 — le 16:9 (après chaque clip 9:16)
```bash
higgsfield generate workflow reframe \
  --video <url_ou_id_du_clip_9_16> \
  --aspect-ratio 16:9 \
  --resolution 1080p \
  --wait
```

## Chaîne complète (une fois les clips validés)
1. Assemblage + typographies + HUD + constellations + tampons → **HyperFrames** (60 s, 9:16).
2. Reframe de la vidéo finale → **16:9** (ou reframe des clips + montage 16:9 dédié si le cadrage split-screen l'exige).
3. Score de viralité (optionnel) : `higgsfield generate create brain_activity --video <final.mp4> --wait`.

## Notes
- Seedance 2.5 plafonne à 30 s par clip : d'où la génération par scènes de 5-6 s.
- Le texte écran (« LES 2 ÉLÈVES INVISIBLES », tampons…) n'est JAMAIS généré par le
  modèle : posé en HyperFrames pour garantir la typo Clash Grotesk et le brand.
- Cost check : `higgsfield generate cost create --model seedance_2_5 --duration 6 --resolution 1080p`.
