# VIDEO 1 « Les deux élèves invisibles » — Production KLING
### Étape 1 : casting images → Étape 2 : scènes images → Étape 3 : image-to-video → montage 60 s

> **Méthode** : on cast d'abord les visages en IMAGES (Text to Image), on valide,
> puis on anime en **image-to-video** — c'est ce qui garantit les mêmes visages
> d'une scène à l'autre. Monter directement en vidéo fait dériver les visages.
> **Rôles** : la fille = élève forte (voilée) · le garçon = élève en difficulté.
> **Traits** : type somalien/Afar (Corne de l'Afrique), nez et lèvres fins,
> teint marron, garçon à cheveux courts frisés, fille voilée (hijab blanc sobre).
> **Prénoms fictifs**. Zéro mot proscrit à l'écran (§8 FORCE-DE-VENTE).
> Compte Kling : **Standard mensuel** (sans watermark, usage commercial).

## Réglages Kling
- Étape 1-2 (images) : **Text to Image · 9:16**
- Étape 3 (vidéo) : **Image to Video · 9:16 · 5 s · son OFF · 720p**

## Fiches personnages (reprises telles quelles dans chaque prompt)

**FILLE** : `a Djiboutian teenage girl of Somali heritage, wearing a modest soft white hijab, warm brown skin tone, slim delicate nose, thin refined lips, high cheekbones, slim elongated face`

**GARÇON** : `a Djiboutian teenage boy of Afar heritage, short tightly curled black hair, warm brown skin tone, slim straight nose, thin refined lips, slim delicate facial features, narrow jawline`

---

## ÉTAPE 1 — Casting (3 versions de chacun, on choisit)

**C1 — La fille**
```
Portrait of a Djiboutian teenage girl of Somali heritage, wearing a modest soft white hijab neatly framing her face, warm brown skin tone, slim delicate nose, thin refined lips, high cheekbones, slim elongated face, calm confident expression, plain neutral background, soft studio lighting, natural documentary photography, sharp focus, 85mm
```

**C2 — Le garçon**
```
Portrait of a Djiboutian teenage boy of Afar heritage, short tightly curled black hair, warm brown skin tone, slim straight nose, thin refined lips, slim delicate facial features, narrow jawline, thoughtful shy expression, plain neutral background, soft studio lighting, natural documentary photography, sharp focus, 85mm
```

---

## ÉTAPE 2 — Les 5 scènes en image

**S1 — Le hook (split-screen)**
```
Split-screen vertical composition, bright Djibouti middle-school classroom. Top half: a Djiboutian teenage girl of Somali heritage wearing a modest soft white hijab, warm brown skin, slim delicate nose, thin refined lips, high cheekbones, slim face, finishing her worksheet, pen down, glancing at the wall clock, bored. Bottom half: a Djiboutian teenage boy of Afar heritage, short tightly curled black hair, warm brown skin, slim nose, thin lips, slim refined features, frozen over his paper, pencil hovering, blocked and anxious. Natural daylight, warm tones, documentary photography, 35mm
```

**S2 — La forte qui s'ennuie**
```
A Djiboutian teenage girl of Somali heritage wearing a modest soft white hijab, warm brown skin, slim delicate nose, thin refined lips, high cheekbones, slim face, sitting in a sunlit classroom in Djibouti, finished worksheet on her desk, chin on hand staring out of the window, visibly bored, other students blurred in background, warm natural light, cinematic documentary style, 35mm
```

**S3 — Le garçon qui bloque**
```
Close-up on a Djiboutian teenage boy of Afar heritage, short tightly curled black hair, warm brown skin, slim straight nose, thin refined lips, slim delicate facial features, in a Djibouti classroom, rubbing his pencil nervously over a math worksheet covered in crossed-out calculations, eyebrows knitted in frustration, the same exercise repeated five times, soft window light, warm documentary tone, 50mm, shallow focus
```

**S4 — LE TWIST : il comprend enfin**
```
Close-up on the same Djiboutian teenage boy of Afar heritage, short tightly curled black hair, warm brown skin, slim nose, thin lips, slim refined features, in a Djibouti classroom, suddenly writing fluently with a small genuine smile of relief, the answer correct on his page, warm golden light on his face, uplifting documentary cinematography, 50mm
```

**S5 — La fin : chacun avance**
```
Wide shot of a sunlit classroom in Djibouti, a Djiboutian teenage girl of Somali heritage in a modest soft white hijab advancing confidently into harder exercises, and a Djiboutian teenage boy of Afar heritage with short tightly curled black hair steadily catching up, both with warm brown skin and fine sharp facial features, focused at their desks, teacher walking between rows, warm hopeful morning light, cinematic documentary style, 35mm
```

---

## ÉTAPE 3 — ✅ CASTING VALIDÉ → animation 10 s
Les 2 images de casting (C1 fille, C2 garçon) ont été choisies. On anime via
**Image to Video + Elements** (import des 2 portraits comme références de personnage
= visages figés et cohérents).

**Réglages** : Image to Video · 9:16 · 10 s · son OFF · 720p.

**Prompt S1 (10 s, les deux élèves) :**
```
Split-screen vertical video in a bright sunlit Djibouti middle-school classroom. Top half: the girl wearing a soft white hijab finishes her worksheet, puts her pen down, glances bored at the wall clock then rests her chin on her hand. Bottom half: the boy with short curly hair rubs his pencil nervously over his worksheet, hesitates, blocked and frustrated. Both keep their exact same faces from the reference images. Subtle realistic movement, natural daylight, warm tones, documentary style, 35mm
```

**Variante sûre si le split-screen rate :**
```
In a bright sunlit Djibouti classroom, the girl wearing a soft white hijab sits at her desk in the foreground, bored, chin on hand, having finished her worksheet, while behind her the boy with short curly hair hesitates with his pencil over his paper, blocked and frustrated. Both keep their exact same faces from the reference images. Slow pan, subtle natural movement, natural daylight, documentary style, 35mm
```

**Prompts de mouvement pour les scènes suivantes (5 s, après validation) :**
- S2 : `slow subtle dolly in on her face, she sighs and looks away` (fille, hijab)
- S3 : `slow push in, his pencil hesitates over the page` (garçon)
- S4 : `slow dolly in, he starts writing fluently and smiles` (garçon)
- S5 : `slow pan across the classroom, both students working at their own pace`

⚠️ 10 s = ~2× les crédits. Réserver 10 s à la scène d'ouverture ; 5-6 s suffisent
pour les autres (montage + ralentis).

---

## Montage final (moi, ffmpeg)
Dossier : `~/Desktop/video1-clips/` → nommage `s1-hook.mp4` … `s5-fin.mp4`.
Je monte les 5 clips en **60 s exactes** : ordre du script, ralentis, cartes de
texte Midnight Bloom (titre, tampons « IL PROPOSE / VOUS DÉCIDEZ », CTA),
sous-titres, format 9:16.

## Higgsfield — abandonné
Le compte Higgsfield est en **trial** : génération bloquée (`only_mcp_usage_on_trial_is_available`),
via CLI comme via l'endpoint MCP. Voir VIDEO1-PRODUCTION-HIGGSFIELD.md (archive).
