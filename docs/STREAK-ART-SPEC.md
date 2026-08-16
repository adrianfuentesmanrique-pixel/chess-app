# Streak icon art — spec and generation brief (2026-08-14)

38 icons, rebuilt from zero. Adrian generates the art externally; this file is
the standard the art is held to, and the prompts that produce it.

Part 1 is the spec. Part 2 is the 38 prompts. Nothing in the app changes until
the files are delivered.

---

# Part 1 — The spec

## 1. Canvas

**Square. 1:1. Always.** Generate at **1024 × 1024**, deliver at 1024 × 1024,
and I will produce the 256 × 256 files the app ships.

This is the single most important line in the document. Every icon in the app
that is not this set is square, and all three CSS rules that display streak art
today (`height` fixed, `width: auto`) exist only because this set was not. When
the set is square, those rules become one line each and the header badge, the
ladder row and the popup all line up on a common baseline for the first time.

## 2. Safe margin and placement

Judged on the 1024 canvas:

| | Rule |
|---|---|
| Vertical | Flame base at **y ≈ 900px (88%) in all 38** — the shared baseline. The tip is free to rise as the flame grows, from about 20% at `flame1` to 8% at `queen5` |
| Horizontal | Flame body inside the central **560px** (55% of width) |
| Edges | **Nothing solid within 48px of any edge.** Only the outer bloom may fade out into that band |
| Axis | The flame stands on the **vertical centre line** in all 38 |

Same size, same placement, all 38. The whole point is that flipping between two
tiers should look like the flame changed, not like the camera moved.

## 3. Background — **flat pure black** (revised 2026-08-14)

Adrian's generator only exports JPEG, and JPEG cannot store transparency at all.
So the set is generated on a **solid, flat, dead-black `#000000` field** and I
rebuild the alpha channel on the way in.

This works because the art is emissive: the flame's glow genuinely falls off to
black, so pixel brightness *is* opacity. Measured end-to-end on a real icon with
known alpha (flatten to black → JPEG q92 → recover): **mean alpha error 6.3/255
(2.5%), halo on 0.53% of background pixels, 0.87% of solid art wrongly thinned.**
Clean on the white panel and the navy one.

The recovery is a flood fill inward from the canvas edge to find the background
region, then alpha from luminance *inside that region only* — so the dark navy
chess piece, which is enclosed by flame and unreachable from the edge, survives
untouched. A naive global luminance key would eat it.

Two rules the art must hold for this to work:

- **The background is flat.** No gradient, no vignette, no glow spill on the
  backdrop, no checkerboard, no texture. A gradient breaks the fill.
- **The flame's outer contour is bright.** No near-black anywhere on the outer
  edge, or the fill bites into the art.

And, as before: no baked gold ring, no navy disc, no plate, no badge, no frame,
no border, no ground plane, no cast shadow, no scenery, no text, no numbers, no
watermark. **A grey transparency checkerboard flattened into the pixels is the
one thing that cannot be rescued** — it carries no opacity information and the
soft bloom is destroyed by the blend.

## 4. The one style all 38 share

**Glossy painterly luminous — rich, saturated, wet-highlight, volumetric.**
One style, one lighting model, one flame anatomy, 38 times.

The rules that actually make it one set:

1. **Self-lit.** The flame is the only light source in the picture. There is no
   key light, no rim light from outside, no environment. Everything else in the
   image is lit *by the flame*.
2. **One flame anatomy.** A broad teardrop body with **three licking tongues**
   at the top. Every tier is that same shape, changed in colour, height, and
   detail — never redrawn as a different kind of fire.
3. **Straight-on front view.** No perspective tilt, no 3/4 rotation, no camera
   angle change between tiers.
4. **The outer silhouette is always bright glowing flame.** Never a dark shape
   at the edge. This is what makes all 38 read on white *and* on navy: the
   darkest parts of the picture are always enclosed by fire, never exposed to
   the background.
5. **The piece is always the same object.** In tiers 7–38 the chess piece is a
   solid **dark navy (#131c2b)** silhouette with a thin **gold (#f4c15d)**
   rim-light down its left edge, standing inside the lower half of the flame.
   Navy and gold — the app's own language — carried by every single icon.
6. **Mid-value rule.** Every icon must have a large area of mid-tone colour
   (roughly 30–70% brightness). **No icon may be mostly near-white or mostly
   near-black.** A near-white flame vanishes on the light-mode panel (`#ffffff`)
   and a near-black one vanishes on the dark-mode one (`#18202b`). This is why
   the silver phase is steel-blue rather than white and the top phase is deep
   amber rather than pale gold.

## 5. Colour ladder

The progression is the reward. Hue changes **between** phases; **within** a
phase the tier escalates by intensity, height, and detail — not by hue.

| Phase | Tiers | Hue | Reads as |
|---|---|---|---|
| A | flame1–6 | deep ember red → orange-gold → violet → **azure blue** | the turn from red to blue |
| B | pawn1–9 | azure → bright cyan | blue mastered |
| C | knight1–8 | indigo → electric violet | |
| D | bishop1–5 | deep teal → bright aqua-emerald | |
| E | rook1–5 | steel-blue → bright silver-blue | |
| F | queen1–5 | deep amber → radiant gold | the app's gold, at the top |

## 6. Source resolution and shipping resolution

- **Source: 1024 × 1024** from the generator. Keep them — future-proofing.
- **Shipped: 256 × 256 PNG.** The largest place the art appears is 64 CSS px, so
  256 covers a 4× device pixel ratio. 192 would be exactly enough for a 3×
  phone; 256 costs almost nothing extra and leaves headroom.

## 7. Weight budget — the number, and why

**Hard cap 24 KB per file. Target average ≤ 14 KB. Whole folder ≤ 600 KB.**

That is not a guess. I compressed three of the current icons at 256 × 256 before
picking it:

| file | 32-bit RGBA | 128-colour | 64-colour |
|---|---|---|---|
| `queen5.png` (the heaviest) | 50 KB | **11 KB** | 8 KB |
| `rook5.png` | 43 KB | **10 KB** | 7 KB |
| `flame1.png` | 24 KB | **4 KB** | 4 KB |

Quantised to 128–192 colours with a dithered alpha, a full-square 256px icon
lands at 4–11 KB. So 24 KB is a cap the art has to actively abuse to hit, and
600 KB for the folder is **a 76% cut from 2.5 MB** — in an offline-first PWA
that every user downloads on install, on phones, in Panama. Meanwhile the
effective resolution at the 64px slots goes *up*, from 160px tall to 256.

If any single icon can't reach the target without visible banding in the bloom,
I'll keep it under the 24 KB cap, tell you which one, and show you the number.

## 8. Delivery

**JPEG at maximum quality is fine** — see §3. Drop the 1024 sources in
**`C:\Users\Adrian\StreakArt\`** — outside the repo, so the full-size sources
never get committed. (`avatars/CTC new arts/` is 138 MB of committed source PNGs
already; not repeating that.) I recover the alpha and ship `.png`.

**The filename stems must be exactly these 38** — `STREAK_TIERS` in `js/app.js`
maps tiers to these strings, and renaming one breaks a tier:

```
flame1 flame2 flame3 flame4 flame5 flame6
pawn1 pawn2 pawn3 pawn4 pawn5 pawn6 pawn7 pawn8 pawn9
knight1 knight2 knight3 knight4 knight5 knight6 knight7 knight8
bishop1 bishop2 bishop3 bishop4 bishop5
rook1 rook2 rook3 rook4 rook5
queen1 queen2 queen3 queen4 queen5
```

## 9. Reject a generation if…

- it isn't square, or the flame isn't centred at the same size as its neighbours
- anything solid touches the canvas edge
- **the background isn't flat dead black** — a grey checkerboard, a dark navy, a
  gradient or a vignette all mean the background cannot be cut away
- any part of the flame's outer edge goes dark enough to sink into the black
- there's a ring, disc, plate or border behind it
- the chess piece isn't dark navy with a gold left rim
- the piece isn't *inside* the flame (in front of it, or standing on it, is wrong)
- it's mostly white or mostly black
- there's a cast shadow, a floor, or a light coming from outside the flame
- it's a different kind of fire from the tier before it

---

# Part 2 — The generation brief

## The shared preamble

**Paste this before every one of the 38 lines below.** Don't change a word of it
between tiers — it is the thing making them one set.

```
Game achievement icon. A single flame on a solid pure black (#000000)
background, square 1:1 composition, 1024x1024.

The background is completely flat, even, dead black across the whole canvas —
no gradient, no vignette, no glow spill on the backdrop, no checkerboard, no
texture, no pattern, no scenery. The flame's own soft bloom fades smoothly
down into that black.

Style: glossy painterly luminous — rich saturated colour, wet glass-like
highlights, volumetric inner glow, soft bloom. The flame is the only light
source in the image and lights itself from within. No cast shadow, no floor,
no ground, no frame, no ring, no border, no badge plate, no disc, no text, no
numbers, no watermark.

Camera: straight-on front view, no perspective tilt, no rotation.

Shape: one broad teardrop flame body with three licking tongues at the top.
It stands on the vertical centre line, base at 88% of canvas height, body
within the central 55% of the width. Nothing solid comes within 5% of any
canvas edge; only the soft outer bloom fades out there.

The flame's outer edge is a bright, clearly glowing rim — no part of the
flame's outer contour is dark or near-black, so it never blends into the
black backdrop.
```

For tiers 7–38 (every one with a chess piece), **also paste this second block**:

```
Inside the lower half of the flame, silhouetted, stands a single chess
{PIECE}: a solid dark navy (#131c2b) piece shape with a thin warm gold
(#f4c15d) rim-light down its left edge, crisp and clearly readable. It is
centred, occupies the lower 55% of the flame's height, and the flame burns
behind it and wraps around it. The piece is inside the fire, not in front of
it and not standing on it. The navy piece is completely enclosed by the
flame — it never touches or breaks the flame's outer edge, and never touches
the black backdrop.
```

Then the one line for the tier.

---

## Phase A — flame1–6 · red → blue · *no chess piece*

The whole red-to-blue turn happens here. Tier 4 is the hinge.

1. **flame1** — Small, calm flame. Deep ember red, `#7d1408` at the roots to
   `#e03a12` at the tips, a dull orange core. Dim and steady, the shortest flame
   in the set. No embers.
2. **flame2** — Same flame, a little taller and hotter. Red-orange, `#b02008` to
   `#ff6a1a`, core brightening to yellow. Two or three small embers rising.
3. **flame3** — Bright orange-gold, `#e2560d` to `#ffb43c`, with a hot
   yellow-white core. Tongues longer and livelier. A handful of embers.
4. **flame4** — The turn. Gold-orange tongues above, `#ff9b2f`, but the roots
   have gone violet, `#7b2ff7`, bleeding upward through the lower third. Warm
   above, cool below, the two colours visibly meeting in the middle.
5. **flame5** — Violet-indigo now dominant, `#5b2bd9` to `#8f6bff`, only a last
   trace of warm gold in the tallest tongue. Cooler, cleaner, glassier.
6. **flame6** — Full azure blue, `#0b4bd6` to `#4fb6ff`, white-blue core.
   Tall, bright, fully transformed. Blue embers.

---

## Phase B — pawn1–9 · azure → cyan · **PIECE = pawn**

Nine tiers, so escalate slowly and evenly. Same azure family throughout; each
step is brighter, taller and busier than the last.

7. **pawn1** — Azure blue flame, `#0d54e0` to `#49a8ff`. Calm and even, the
   plainest of the phase. Pawn silhouette plain, gold rim only.
8. **pawn2** — Slightly taller, `#0d5ae6` to `#5cb2ff`, core brightening. A few
   blue embers drifting up the right side.
9. **pawn3** — Brighter azure, `#0b62ee` to `#6dbcff`. Tongues longer and more
   separated. A thin gold ring painted around the pawn's base.
10. **pawn4** — `#0a6bf5` to `#7cc6ff`, white-blue core clearly visible through
    the flame body. More embers, spread on both sides.
11. **pawn5** — Azure-cyan, `#0a7cff` to `#8fd2ff`. Tongues taller and whipping.
    Gold ring at the base plus a small gold band at the pawn's collar.
12. **pawn6** — `#0989ff` to `#9fdcff`, glassier and glossier, strong wet
    highlight on the flame's left shoulder. Ember count noticeably higher.
13. **pawn7** — Bright cyan-blue, `#0995ff` to `#aee4ff`, hot white core. The
    three tongues reach the full canvas height allowance.
14. **pawn8** — `#09a0ff` to `#b9ebff`, faint cyan aura around the whole flame.
    Gold detailing on the pawn now includes a thin vertical gold inlay.
15. **pawn9** — Brightest of the phase. Cyan `#0aa9ff` to near-white `#d6f4ff`
    at the tips, white-hot core, dense drifting embers, a clear glow halo. The
    pawn's gold rim is at its strongest.

---

## Phase C — knight1–8 · indigo → electric violet · **PIECE = knight (horse head, facing left)**

The knight must face **left in all eight** — a flipped horse head is the easiest
way to break the set.

16. **knight1** — Deep indigo flame, `#4b2be0` to `#7d5cff`. Calm, even, the
    plainest of the phase.
17. **knight2** — `#5030e8` to `#8a6bff`, brighter core, a few violet embers.
18. **knight3** — `#5535f0` to `#9578ff`. Tongues longer. A thin gold band along
    the knight's mane.
19. **knight4** — `#5b3af8` to `#a086ff`, white-violet core showing through.
    Embers on both sides.
20. **knight5** — `#6140ff` to `#ab93ff`, glassier, strong wet highlight, gold
    detail extended down the knight's neck.
21. **knight6** — Electric violet, `#6a4bff` to `#b8a3ff`, hot white core, tall
    whipping tongues.
22. **knight7** — `#7355ff` to `#c4b2ff` with a violet aura around the whole
    flame and dense embers.
23. **knight8** — Brightest violet, `#7d60ff` to near-white lilac `#e2dbff`,
    white-hot core, glow halo, the knight's gold rim at maximum.

---

## Phase D — bishop1–5 · deep teal → aqua-emerald · **PIECE = bishop**

24. **bishop1** — Deep teal flame, `#0b8f8a` to `#2fbdb0`. Calm and even.
25. **bishop2** — `#0a9b95` to `#3fcdbe`, brighter core, a few teal embers.
26. **bishop3** — `#09a8a0` to `#4fdccd`. Taller tongues, a gold band around the
    bishop's mitre.
27. **bishop4** — `#08b5ab` to `#5fead9`, white-teal core, embers both sides,
    strong glass highlight.
28. **bishop5** — Bright aqua-emerald, `#07c2b6` to pale mint `#b9f7ee`,
    white-hot core, glow halo, dense embers, maximum gold rim.

---

## Phase E — rook1–5 · steel-blue → bright silver-blue · **PIECE = rook**

Deliberately **not white** — a white flame disappears on the light-mode panel.
Keep the flame body clearly steel-blue and let only the core go pale.

29. **rook1** — Steel-blue flame, `#3d6f9e` to `#7fa8d8`. Cool, heavy, calm.
30. **rook2** — `#3f79ad` to `#8fb6e2`, brighter core, a few pale embers.
31. **rook3** — `#4184bd` to `#9fc4ec`. Taller tongues, gold band around the
    rook's battlements.
32. **rook4** — `#438fcc` to `#afd2f4`, silver-white core, embers both sides,
    hard polished-metal highlight on the flame's left shoulder.
33. **rook5** — Bright silver-blue, `#4599db` to `#dbe9ff` at the tips — but the
    flame's mid-body stays a solid readable steel-blue. White-hot core, glow
    halo, dense silver embers, maximum gold rim.

---

## Phase F — queen1–5 · deep amber → radiant gold · **PIECE = queen (crowned)**

The top of the ladder lands on the app's own gold. Deep and rich, **not pale** —
same reason as the rook phase.

34. **queen1** — Deep amber flame, `#a86a12` to `#e0a63e`. Rich, heavy, calm.
    The queen's crown catches a single gold glint.
35. **queen2** — `#b8761a` to `#eab54e`, brighter core, a few gold embers.
36. **queen3** — `#c8811a` to `#f4c15d` — the app's gold exactly. Taller
    tongues, gold filigree across the queen's body.
37. **queen4** — `#d68f22` to `#ffd06e`, white-gold core, dense embers rising on
    both sides, strong wet highlight, a faint gold halo behind the crown.
38. **queen5** — The crown of the set. Radiant gold, `#e09a28` through `#f4c15d`
    to `#fff0c4` at the tips — the mid-body stays deep saturated amber so it
    still reads on a white panel. White-hot core, full glow halo, the densest
    ember field in the set, the queen's crown fully picked out in bright gold.
    Tallest, brightest, richest of the 38 — and still exactly the same flame
    shape, size and placement as `flame1`.
