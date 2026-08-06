"""Turns the delivered avatar artwork into the files the app actually loads.

The source art is 1024px, ~2MB a piece -- fine as a master, far too heavy to
ship to a phone for something drawn at 56 CSS px. This downscales and palettes
them, which is the whole job: unlike the badges there is nothing to composite,
because the app already circle-crops avatars in CSS (`.avatar-badge`) and the
new art has no ring baked in. The old set did have a painted gold ring, which
is why it could never sit inside a CSS circle cleanly.

The generator left a small sparkle in the bottom-right of every file. It sits
at radius ~0.53 from the centre, outside the inscribed circle, so the CSS crop
already hides it and it is left alone rather than retouched.

Run:  python tools/build_avatars.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "avatars" / "CTC new arts" / "avatars"
OUT = ROOT / "avatars"

# 56 CSS px is the largest use (the profile header), which is 168 device px on
# a 3x phone. 256 covers that with room and keeps the set near 1.4MB.
SIZE = 256

# art file (no extension) -> avatar id used by AVATAR_OPTIONS in js/app.js.
# The ids are kept as they were so nobody's saved choice breaks; only the
# pictures behind them change.
AVATARS = {
    # the twelve pieces
    "whitepawn": "pawn_w",     "blackpawn": "pawn_b",
    "whiteknight": "knight_w", "blackknight": "knight_b",
    "whitebishop": "bishop_w", "blackbishop": "bishop_b",
    "whiterook": "rook_w",     "blackrook": "rook_b",
    "whitequeen": "queen_w",   "blackqueen": "queen_b",
    "whiteking": "king_w",     "blackking": "king_b",
    # creatures
    "wolf": "wolf", "Lion": "lion", "tiger": "tiger", "eagle": "eagle",
    "owl": "owl", "bear": "bear", "raven": "raven",
    "dragon": "dragon", "phoenix": "phoenix", "griffin": "griffin",
    "kraken": "kraken", "hydra": "hydra",
    # the elemental pieces, matched to the ids that were already reserved
    "galaxyking": "galaxy",       # cosmic swirl
    "queenstarless": "crystal",   # gold queen trailing stardust
    "obsidianqueen": "void",      # black and crimson
    "elementalknight": "fire",    # burning knight
    "icebishop": "ice",
    "lightningrook": "storm",
    "smokeking": "shadow",
}


def main() -> None:
    missing = sorted(n for n in AVATARS if not (ART / f"{n}.png").exists())
    if missing:
        raise SystemExit("missing source art: " + ", ".join(missing))

    OUT.mkdir(parents=True, exist_ok=True)
    for src_name, avatar_id in AVATARS.items():
        img = Image.open(ART / f"{src_name}.png").convert("RGB")
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
        # Palette PNG: a third the bytes and indistinguishable at this size.
        # The art is fully opaque, so no index has to be reserved for alpha.
        img = img.quantize(colors=256, method=Image.MEDIANCUT,
                           dither=Image.FLOYDSTEINBERG)
        img.save(OUT / f"{avatar_id}.png", optimize=True)
    print(f"wrote {len(AVATARS)} avatars to {OUT}")


if __name__ == "__main__":
    main()
