# Where every sound in `sounds/` comes from

Last changed 2026-10-10 (v183). Keep this file in step with `sounds/`.

## Board sounds - CC0 recordings, chosen by Adrian by ear

Each source page was opened on 2026-10-10 and shows the licence **Creative Commons 0**
(https://creativecommons.org/publicdomain/zero/1.0/): public domain, no credit required,
commercial use allowed. Credit is given here anyway.

| File | Cut from | Uploader | Source page | What was done |
|---|---|---|---|---|
| `move.wav` | "chess pieces.wav", the knock at 18.72 s | simone_ds | https://freesound.org/s/366065/ | 0.32 s cut, 80 ms fade-out, +5.4 dB |
| `capture.wav` | "Piece Capture.mp3", whole (0.24 s) | el_boss | https://freesound.org/s/546120/ | -12.6 dB (Adrian asked for it quieter than the rest, three times; the last after hearing it in the app) |
| `check.wav` | "Piece Placement.mp3", whole (0.11 s) | el_boss | https://freesound.org/s/546119/ | -0.8 dB (Adrian: to the capture's level, then "increase the check 2 dB") |
| `castle.wav` | `move.wav` played twice, the second 0.23 s later at 90% | simone_ds | as `move.wav` | built from the levelled `move.wav` |
| `promote.wav` | "Small wood Block.wav", the hit at 4.35 s | Noted451 | https://freesound.org/s/530437/ | 0.40 s cut, 100 ms fade-out, -0.6 dB |

- All five are mono, 16-bit, 44.1 kHz. No effects; only the cut, the fade and the level.
- Level: the loudest point of `move`, `castle` and `promote` is -3 dB; of `capture.wav` -15 dB, of `check.wav` -13 dB. It is a denser sound than the knocks, so it
  sounds louder than its peak suggests; by average energy it sits just under `move.wav`.
- They were cut from each sound's public PREVIEW (the MP3 the Freesound page plays),
  not from the original upload, which needs a signed-in account. Adrian judged them
  good enough by ear.
- The previews and the files as cut, before levelling, are on Adrian's PC in
  `sounds-candidates/` (not in the repo).

## The other six - made by code in this project

`puzzle-correct.wav`, `puzzle-wrong.wav`, `game-win.wav`, `game-lose.wav`,
`game-draw.wav`, `kael-pop.wav`: added in commit 3869b65 (2026-07-07), whose message
says "Synthesized". Nothing downloaded or recorded, so no third-party licence applies.
The script that made them was not kept.

## Tried and rejected

- Board sounds made by code (`tools/make-sounds.mjs`, v181): Adrian listened on his
  phone and they sounded horrible. Withdrawn in v182. Do not try this again.
- lichess's standard move and capture sounds: listed as non-free in its COPYING.md.
- Chimes for promotion (four glockenspiel / notification candidates): Adrian disliked
  all of them. Promotion is a wood block hit instead.
