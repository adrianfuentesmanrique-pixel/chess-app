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
    avatars/CTC new arts/frame-{bronze,silver,obsidian,gold}.png   the four frames
    avatars/CTC new arts/<symbol>.png                              the symbols
    pieces/*.svg                                                   endgame piece symbols
    icons/badges/<badge-id>.png                                    <- written here

The source art is delivered on a flat magenta backdrop rather than with an
alpha channel, so it is keyed out here (see `key_magenta`). Keying at build
time rather than by hand means re-exported art drops straight in.

Run:  python tools/build_badges.py
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "avatars" / "CTC new arts"
PIECES = ROOT / "pieces"
OUT = ROOT / "icons" / "badges"

# The largest on-screen use is 58 CSS px, which is 174 device px on a 3x phone,
# so the old 200 was only just enough. 320 clears that with room to spare and
# keeps the whole set to ~2MB; at 512 these are 20MB, which is a lot to ship
# for images that are never drawn bigger than a thumbnail.
SIZE = 320
# Fraction of the badge width the symbol may occupy. The frame's inner opening
# is ~62%; staying under it keeps a ring of frame visible all the way round.
SYMBOL_FRACTION = 0.52

# ── tiers ────────────────────────────────────────────────────────────────────
# Five families (puzzle, flame, robot, target, lightning) each ship three
# symbol finishes, and there are four frames, so a family has 12 distinct
# looks. The frame cycles through all four before the symbol advances, which
# makes a frame change the small step and a symbol change the big one.
FRAMES = ("bronze", "silver", "obsidian", "gold")
SYMBOL_FINISHES = ("silver", "obsidian", "gold")
FAMILY_TIERS = [(sym, frame) for sym in SYMBOL_FINISHES for frame in FRAMES]


def spread(n: int) -> list[int]:
    """Pick `n` rungs from the 12-tier ladder, ends included.

    No family has 12 badges (the largest, robot, has 9), so the rungs are
    spread rather than taken from the bottom. Taking the first `n` would mean
    the gold symbol -- and gold+gold, the top tier -- never appeared at all,
    and a family's final badge would look mid-table.
    """
    top = len(FAMILY_TIERS) - 1
    if n == 1:
        return [top]
    return [int(i * top / (n - 1) + 0.5) for i in range(n)]


def family(name: str, badge_ids: list[str]) -> dict[str, tuple[str, str]]:
    """badge id -> (symbol art name, frame), ordered easiest to hardest."""
    return {
        bid: (f"{name}{FAMILY_TIERS[rung][0]}", FAMILY_TIERS[rung][1])
        for bid, rung in zip(badge_ids, spread(len(badge_ids)))
    }


# ── the 64 badges ────────────────────────────────────────────────────────────
# id -> (symbol, frame). Grouped the way a player experiences them.
BADGES: dict[str, tuple[str, str]] = {
    # puzzle milestones
    **family("puzzle", ["puz_10", "puz_50", "puz_200", "puz_1000", "puz_5000"]),

    # Tactic mastery -- all 28 of them, one frame across the set so they read
    # as a single collection rather than a ladder; the tactics are siblings,
    # not tiers. Each symbol shows the CHESS idea, not the English word.
    "theme_fork":              ("fork", "silver"),
    "theme_pin":               ("pin", "silver"),
    "theme_skewer":            ("skewer", "silver"),
    "theme_deflection":        ("deflection", "silver"),
    "theme_attraction":        ("attraction", "silver"),
    "theme_clearance":         ("clearance", "silver"),
    "theme_discoveredAttack":  ("discovered", "silver"),
    # Adrian's call: every discovery shares one icon, so the discovered-check
    # badge deliberately reuses the discovered-attack symbol.
    "theme_discoveredCheck":   ("discovered", "silver"),
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
    # mate-in-N is the one themed ladder: its own drawing per depth, and the
    # frame climbs with it.
    "theme_mateIn1":           ("mate1", "bronze"),
    "theme_mateIn2":           ("mate2", "bronze"),
    "theme_mateIn3":           ("mate3", "silver"),
    "theme_mateIn4":           ("mate4", "obsidian"),
    "theme_mateIn5":           ("mate5", "gold"),

    # streaks
    **family("flame", ["streak_3", "streak_7", "streak_30", "streak_100"]),

    # endgame conversions -- rendered from the app's own piece shapes, so the
    # badge matches the piece the player just converted with.
    "endgame_pawn":   ("piece_pawn", "bronze"),
    "endgame_knight": ("piece_knight", "silver"),
    "endgame_bishop": ("piece_bishop", "silver"),
    "endgame_minor":  ("piece_minor", "obsidian"),
    "endgame_rook":   ("piece_rook", "obsidian"),
    "endgame_queen":  ("piece_queen", "gold"),

    # openings / onboarding
    "opening_1":     ("book", "bronze"),
    "opening_3":     ("book", "silver"),
    "first_import":  ("import", "bronze"),
    "first_engine":  ("engine", "bronze"),

    # puzzle rush
    **family("lightning", ["rush_1", "rush_10", "rush_30"]),

    # engine levels, then one for sweeping the lot
    **family("robot", [f"beat_engine_{i}" for i in range(8)] + ["beat_engine_all"]),

    # daily missions
    **family("target", ["daily_1", "daily_7", "daily_30", "daily_180", "daily_365"]),
}


# ── magenta keying ───────────────────────────────────────────────────────────
# The backdrop is magenta: red and blue both high, green near zero. Scoring a
# pixel as min(R, B) - G separates it from everything in the art, including the
# red gems (low blue) and the blue gems (low red), which a naive "how magenta
# is it" distance would eat into.
KEY_OPAQUE = 45     # score at or below this is definitely artwork
KEY_CLEAR = 130     # score at or above this is definitely backdrop


def key_magenta(img: Image.Image) -> Image.Image:
    """Replace the magenta backdrop with transparency, feathering the edge."""
    img = img.convert("RGBA")
    px = list(img.getdata())
    span = KEY_CLEAR - KEY_OPAQUE
    out = []
    for r, g, b, a in px:
        score = min(r, b) - g
        if score <= KEY_OPAQUE:
            out.append((r, g, b, a))
            continue
        if score >= KEY_CLEAR:
            out.append((0, 0, 0, 0))
            continue
        # Partly keyed: this is the fringe, where the backdrop bleeds into the
        # art and leaves a pink rim. Pull red and blue back down to green's
        # level by the amount of spill measured, so the rim goes neutral.
        alpha = int(a * (KEY_CLEAR - score) / span)
        spill = score - KEY_OPAQUE
        out.append((max(0, r - spill), g, max(0, b - spill), alpha))
    img.putdata(out)
    return img


# ── speck removal ────────────────────────────────────────────────────────────
# Every source file carries a small white sparkle in the bottom-right corner --
# a signature from the generator, not part of the symbol. It survives keying
# (white is not magenta), so it has to be dropped as a stray island.
#
# "Keep the biggest blob" would be wrong: plenty of symbols are legitimately
# several pieces (fork is a knight plus two pawns). So islands are kept if they
# are a meaningful fraction of the biggest one.
SPECK_FRACTION = 0.02
LABEL_RES = 256     # components are found on a downscale; it is much faster
                    # and the sparkle is still several pixels across


def drop_specks(img: Image.Image) -> Image.Image:
    """Erase alpha islands far too small to be part of the drawing."""
    w, h = img.size
    mask = img.getchannel("A").resize((LABEL_RES, LABEL_RES), Image.BILINEAR)
    solid = [p > 40 for p in mask.getdata()]

    labels = [-1] * (LABEL_RES * LABEL_RES)
    areas: list[int] = []
    for start in range(LABEL_RES * LABEL_RES):
        if not solid[start] or labels[start] >= 0:
            continue
        label = len(areas)
        area = 0
        queue = deque([start])
        labels[start] = label
        while queue:
            i = queue.popleft()
            area += 1
            x, y = i % LABEL_RES, i // LABEL_RES
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < LABEL_RES and 0 <= ny < LABEL_RES:
                    j = ny * LABEL_RES + nx
                    if solid[j] and labels[j] < 0:
                        labels[j] = label
                        queue.append(j)
        areas.append(area)

    if not areas:
        return img
    cutoff = max(areas) * SPECK_FRACTION
    doomed = {i for i, a in enumerate(areas) if a < cutoff}
    if not doomed:
        return img

    # Paint the doomed islands back up to full size and clear them there.
    keep = Image.new("L", (LABEL_RES, LABEL_RES))
    keep.putdata([0 if labels[i] in doomed else 255 for i in range(len(labels))])
    keep = keep.resize((w, h), Image.NEAREST)
    alpha = Image.new("L", (w, h))
    alpha.putdata([a if k else 0 for a, k in zip(img.getchannel("A").getdata(), keep.getdata())])
    img = img.copy()
    img.putalpha(alpha)
    return img


def trim(img: Image.Image) -> Image.Image:
    """Crop to the visible pixels so every symbol is centred and scaled by its
    real extent, not by whatever padding it happened to be exported with. This
    is what stops one badge's icon looking bigger than the next."""
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


# ── endgame piece symbols, rendered from the app's own SVGs ──────────────────
# There is no SVG rasteriser installed here, so Chrome does it headless. Using
# the app's real piece files means the badge can never drift from the board.
PIECE_SVG = {
    "piece_pawn": ["wP"],
    "piece_knight": ["wN"],
    "piece_bishop": ["wB"],
    "piece_rook": ["wR"],
    "piece_queen": ["wQ"],
    "piece_minor": ["wN", "wB"],    # "minor pieces" is the pair, so show both
}

CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]


def find_chrome() -> Path:
    for p in CHROME_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit(
        "Need Chrome or Edge to rasterise pieces/*.svg for the endgame badges.\n"
        "Add its path to CHROME_CANDIDATES in this file."
    )


def piece_page(names: list[str]) -> str:
    """One piece fills the well; two share it side by side, slightly tucked in.

    The gold glow is what makes a flat two-colour piece sit alongside the
    ornate metal symbols instead of looking like clip art dropped in.
    """
    each = 420 if len(names) == 1 else 300
    overlap = 0 if len(names) == 1 else -60
    imgs = "".join(
        f'<img src="{(PIECES / f"{n}.svg").as_uri()}" style="width:{each}px;height:{each}px">'
        for n in names
    )
    return f"""<!doctype html><meta charset="utf-8">
<body style="margin:0;width:640px;height:640px;background:transparent">
<div style="width:640px;height:640px;display:flex;align-items:center;
            justify-content:center;gap:{overlap}px;
            filter:drop-shadow(0 0 14px rgba(244,193,93,.95))
                   drop-shadow(0 0 4px rgba(244,193,93,.9))
                   drop-shadow(0 6px 8px rgba(0,0,0,.55))">{imgs}</div>
</body>"""


def render_pieces(workdir: Path) -> dict[str, Image.Image]:
    chrome = find_chrome()
    rendered = {}
    for name, svgs in PIECE_SVG.items():
        page = workdir / f"{name}.html"
        shot = workdir / f"{name}.png"
        page.write_text(piece_page(svgs), encoding="utf-8")
        subprocess.run(
            [str(chrome), "--headless", "--disable-gpu", "--no-sandbox",
             "--hide-scrollbars", "--force-device-scale-factor=1",
             "--default-background-color=00000000", "--window-size=640,640",
             f"--screenshot={shot}", page.as_uri()],
            check=True, capture_output=True,
        )
        rendered[name] = Image.open(shot).convert("RGBA").copy()
    return rendered


# ── assembly ─────────────────────────────────────────────────────────────────

def load_frame(tier: str, cache: dict[str, Image.Image]) -> Image.Image:
    if tier not in cache:
        # The frames carry the same stray sparkle as the symbols, out in the
        # transparent corner where it reads as a dirt speck on the obsidian.
        src = drop_specks(key_magenta(Image.open(ART / f"frame-{tier}.png")))
        cache[tier] = src.resize((SIZE, SIZE), Image.LANCZOS)
    return cache[tier]


def load_symbol(name: str, pieces: dict[str, Image.Image],
                cache: dict[str, Image.Image]) -> Image.Image:
    if name not in cache:
        if name in pieces:
            sym = pieces[name]        # already transparent; no keying, no specks
        else:
            sym = drop_specks(key_magenta(Image.open(ART / f"{name}.png")))
        cache[name] = trim(sym)
    return cache[name]


def compose(symbol: Image.Image, frame: Image.Image) -> Image.Image:
    target = int(SIZE * SYMBOL_FRACTION)
    scale = min(target / symbol.width, target / symbol.height)
    sym = symbol.resize(
        (max(1, round(symbol.width * scale)), max(1, round(symbol.height * scale))),
        Image.LANCZOS,
    )
    out = frame.copy()
    out.alpha_composite(sym, ((SIZE - sym.width) // 2, (SIZE - sym.height) // 2))
    return out


def main() -> None:
    missing = sorted(
        {s for s, _ in BADGES.values() if s not in PIECE_SVG and not (ART / f"{s}.png").exists()}
        | {f"frame-{t}" for _, t in BADGES.values() if not (ART / f"frame-{t}.png").exists()}
    )
    if missing:
        raise SystemExit("missing source art: " + ", ".join(missing))

    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        pieces = render_pieces(Path(tmp))
        frames: dict[str, Image.Image] = {}
        symbols: dict[str, Image.Image] = {}
        for badge_id, (sym_name, tier) in BADGES.items():
            badge = compose(load_symbol(sym_name, pieces, symbols), load_frame(tier, frames))
            # Palette PNG: 5x smaller than truecolour and visually identical at
            # this size. 255 rather than 256 colours leaves an index free for
            # the transparent background.
            badge = badge.quantize(colors=255, method=Image.FASTOCTREE,
                                   dither=Image.FLOYDSTEINBERG)
            badge.save(OUT / f"{badge_id}.png", optimize=True)
    print(f"wrote {len(BADGES)} badges to {OUT}")


if __name__ == "__main__":
    main()
