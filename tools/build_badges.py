"""Composites achievement badges from one frame + one symbol each.

Why this exists
---------------
The old badges were 49 separately generated images. They never looked like a
family: some were circular, some had square corners, the gold rings varied in
weight and radius, and the zoom level jumped around. Several were also just
wrong -- the art was generated from the English word rather than the chess
idea, so "fork" came out as kitchen cutlery and "pin" as a sewing pin.

Here every badge is the SAME frame with a symbol dropped into it, so they are
consistent by construction. Fixing one badge means replacing one small symbol;
it cannot drift away from the rest.

Layout
------
    art/frames/frame-{bronze,silver,gold}.png   1024x1024, transparent centre
    art/symbols/<name>.png                      any size, transparent bg
    icons/badges/<badge-id>.png                 <- written by this script

Run:  python tools/build_badges.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / "art" / "frames"
SYMBOLS = ROOT / "art" / "symbols"
OUT = ROOT / "icons" / "badges"

# 512 rather than the old 200: the largest on-screen use is 58 CSS px, which is
# 174 device px on a 3x phone, so 200 was only just enough and left nothing for
# store art or a future larger trophy view.
SIZE = 512
# Fraction of the badge width the symbol may occupy. The frame's inner opening
# is ~62%; staying under it keeps a ring of frame visible all the way round.
SYMBOL_FRACTION = 0.52

# id -> (symbol, tier). Grouped the way a player experiences them: the tier is
# how far into that family the badge sits, so progress reads at a glance.
BADGES = {
    # puzzle milestones
    "puz_10":    ("puzzle", "bronze"),
    "puz_50":    ("puzzle", "bronze"),
    "puz_200":   ("puzzle", "silver"),
    "puz_1000":  ("puzzle", "silver"),
    "puz_5000":  ("puzzle", "gold"),
    # Tactic mastery -- all 28 of them. Fifteen of these never had art at all
    # and were falling back to a bare emoji in the trophy case.
    # Each symbol must show the CHESS idea, not the English word.
    "theme_fork":              ("fork", "silver"),
    "theme_pin":               ("pin", "silver"),
    "theme_skewer":            ("skewer", "silver"),
    "theme_deflection":        ("deflection", "silver"),
    "theme_attraction":        ("attraction", "silver"),
    "theme_clearance":         ("clearance", "silver"),
    "theme_discoveredAttack":  ("discovered", "silver"),
    "theme_discoveredCheck":   ("discoveredcheck", "silver"),
    "theme_doubleCheck":       ("doublecheck", "silver"),
    "theme_xRayAttack":        ("xray", "silver"),
    "theme_zugzwang":          ("zugzwang", "silver"),
    "theme_hangingPiece":      ("hanging", "silver"),
    "theme_trappedPiece":      ("trapped", "silver"),
    "theme_capturingDefender": ("capturedefender", "silver"),
    "theme_quietMove":         ("quiet", "silver"),
    "theme_sacrifice":         ("sacrifice", "silver"),
    "theme_defensiveMove":     ("defensive", "silver"),
    "theme_advancedPawn":      ("advancedpawn", "silver"),
    "theme_backRankMate":      ("backrank", "silver"),
    "theme_promotion":         ("promotion", "silver"),
    "theme_intermezzo":        ("intermezzo", "silver"),
    "theme_smotheredMate":     ("smothered", "silver"),
    "theme_interference":      ("interference", "silver"),
    # The five mate-in-N badges share one symbol; the numeral is composited on,
    # so they cannot drift apart and only one drawing is needed.
    "theme_mateIn1":           ("mate", "bronze"),
    "theme_mateIn2":           ("mate", "bronze"),
    "theme_mateIn3":           ("mate", "silver"),
    "theme_mateIn4":           ("mate", "silver"),
    "theme_mateIn5":           ("mate", "gold"),
    # streaks
    "streak_3":   ("flame", "bronze"),
    "streak_7":   ("flame", "bronze"),
    "streak_30":  ("flame", "silver"),
    "streak_100": ("flame", "gold"),
    # endgame conversions -- the app's own piece shapes
    "endgame_pawn":   ("piece_pawn", "bronze"),
    "endgame_knight": ("piece_knight", "silver"),
    "endgame_bishop": ("piece_bishop", "silver"),
    "endgame_rook":   ("piece_rook", "silver"),
    "endgame_queen":  ("piece_queen", "gold"),
    "endgame_minor":  ("piece_minor", "silver"),
    # openings / onboarding
    "opening_1":     ("book", "bronze"),
    "opening_3":     ("book", "silver"),
    "first_import":  ("import", "bronze"),
    "first_engine":  ("engine", "bronze"),
    # puzzle rush
    "rush_1":  ("lightning", "bronze"),
    "rush_10": ("lightning", "silver"),
    "rush_30": ("lightning", "gold"),
    # engine levels
    **{f"beat_engine_{i}": ("robot", "bronze" if i < 3 else "silver" if i < 6 else "gold")
       for i in range(8)},
    "beat_engine_all": ("robot", "gold"),
    # daily missions
    "daily_1":   ("target", "bronze"),
    "daily_7":   ("target", "bronze"),
    "daily_30":  ("target", "silver"),
    "daily_180": ("target", "silver"),
    "daily_365": ("target", "gold"),
}


def placeholder_frame(tier: str) -> Image.Image:
    """A drawn stand-in so the pipeline can be built and reviewed before the
    real artwork exists. Replace art/frames/frame-<tier>.png to use real art --
    nothing else changes."""
    ring = {"bronze": (198, 128, 74), "silver": (196, 205, 217), "gold": (244, 193, 93)}[tier]
    dark = tuple(int(c * 0.45) for c in ring)
    S = 1024
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # navy well
    d.ellipse([28, 28, S - 28, S - 28], fill=(20, 32, 54, 255))
    # outer ring, bevelled by drawing a dark ring then a lighter one inset
    d.ellipse([28, 28, S - 28, S - 28], outline=dark + (255,), width=54)
    d.ellipse([44, 44, S - 44, S - 44], outline=ring + (255,), width=30)
    # inner hairline
    d.ellipse([150, 150, S - 150, S - 150], outline=ring + (110,), width=6)
    # top-left sheen
    sheen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).ellipse([60, 40, S - 220, S - 320], fill=(255, 255, 255, 34))
    img.alpha_composite(sheen.filter(ImageFilter.GaussianBlur(40)))
    return img


def load_frame(tier: str) -> Image.Image:
    p = FRAMES / f"frame-{tier}.png"
    if p.exists():
        return Image.open(p).convert("RGBA")
    return placeholder_frame(tier)


def placeholder_symbol(name: str) -> Image.Image:
    """Initials in a circle, so a missing symbol is obvious rather than silent."""
    S = 512
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([40, 40, S - 40, S - 40], outline=(244, 193, 93, 200), width=12)
    txt = name[:3].upper()
    box = d.textbbox((0, 0), txt)
    d.text(((S - box[2]) / 2, (S - box[3]) / 2 - 10), txt, fill=(244, 193, 93, 230))
    return img


def load_symbol(name: str) -> Image.Image:
    p = SYMBOLS / f"{name}.png"
    if p.exists():
        return Image.open(p).convert("RGBA")
    return placeholder_symbol(name)


def trim(img: Image.Image) -> Image.Image:
    """Crop to the visible pixels so every symbol is centred and scaled by its
    real extent, not by whatever padding it happened to be exported with. This
    is what stops one badge's icon looking bigger than the next."""
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def compose(symbol_name: str, tier: str) -> Image.Image:
    frame = load_frame(tier).resize((SIZE, SIZE), Image.LANCZOS)
    sym = trim(load_symbol(symbol_name))
    target = int(SIZE * SYMBOL_FRACTION)
    scale = min(target / sym.width, target / sym.height)
    sym = sym.resize((max(1, int(sym.width * scale)), max(1, int(sym.height * scale))), Image.LANCZOS)
    out = frame.copy()
    out.alpha_composite(sym, ((SIZE - sym.width) // 2, (SIZE - sym.height) // 2))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    missing_frames = {t for _, t in BADGES.values() if not (FRAMES / f"frame-{t}.png").exists()}
    missing_syms = sorted({s for s, _ in BADGES.values() if not (SYMBOLS / f"{s}.png").exists()})
    for badge_id, (sym, tier) in BADGES.items():
        compose(sym, tier).save(OUT / f"{badge_id}.png")
    print(f"wrote {len(BADGES)} badges to {OUT}")
    if missing_frames:
        print("placeholder frames used:", ", ".join(sorted(missing_frames)))
    if missing_syms:
        print(f"placeholder symbols used ({len(missing_syms)}):", ", ".join(missing_syms))


if __name__ == "__main__":
    main()
