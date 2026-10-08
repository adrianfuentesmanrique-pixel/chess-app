"""Build icons/pulso/*.png from Adrian's source art.

    python tools/build_pulso_art.py <folder with the source JPEGs> [--out DIR]

The source art is delivered as JPEG on a flat magenta backdrop (same method as
the badges, see build_badges.py). Each file is keyed to transparency, cropped to
what is visible, fitted to the size the app expects and written as PNG.

The two markers are cropped with ONE shared box, so the plain flame and the hot
flame keep the same footprint and base line and the swap on the bar does not
jump.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

# output name -> (word the source file name must contain, canvas w, h, margin px)
FILES = {
    "pulso-hero.png":       ("hero",  640, 400, 8),
    "pulso-win.png":        ("win",   512, 512, 8),
    "pulso-lose.png":       ("lose",  512, 512, 8),
    "pulso-draw.png":       ("draw",  512, 512, 8),
    "pulso-empty.png":      ("empty", 320, 320, 6),
}
MARKERS = {"pulso-marker.png": "marker", "pulso-marker-hot.png": "hot"}
MARKER_SIZE, MARKER_MARGIN = 128, 4

# min(R,B)-G at or below this is artwork, whatever else. Lower than the badges'
# 26: nothing in this set is red-on-dark, and gold, navy, orange and grey smoke
# all score at or below zero, so anything above it is backdrop showing through.
ART_FLOOR = 6
VISIBLE_ALPHA = 24   # fainter than this does not count towards the crop box
MAX_BYTES = 120 * 1024


def key_magenta(img: Image.Image) -> Image.Image:
    """Magenta backdrop -> transparency. Alpha is how much backdrop still shows
    through a pixel; the colour is then backed out against the backdrop measured
    off the border, so glows and smoke come out clean instead of stained pink."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    score = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    m = max(2, int(min(a.shape[:2]) * 0.02))
    edge = np.zeros(score.shape, bool)
    edge[:m], edge[-m:], edge[:, :m], edge[:, -m:] = True, True, True, True
    # The lose picture runs off the frame, so part of the border is artwork:
    # read the backdrop only from border pixels that are actually magenta.
    back = edge & (score > 100)
    bg = np.median(a[back], axis=0)
    level = np.percentile(score[back], 5)
    keep = np.clip((score - ART_FLOOR) / (level - ART_FLOOR), 0, 1)   # backdrop share
    f = 1 - keep
    rgb = np.where(f[..., None] > 0, (a - keep[..., None] * bg) / np.maximum(f, 1e-3)[..., None], 0)
    # JPEG smears a little magenta into the art's rim and it survives at full
    # alpha as a pink outline on a light page. Whatever magenta is left in a
    # pixel (red and blue both above green) is taken back out.
    spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None)
    rgb[..., 0] -= spill
    rgb[..., 2] -= spill
    out = np.dstack([np.clip(rgb, 0, 255), f * 255]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


SPECK = 9            # px; anything thinner than this cannot set the crop box


def visible_box(img: Image.Image):
    """Box round what is visible. The generator leaves a few stray pixels in the
    corners and along the frame edge; left in, they stretch the box to the whole
    picture and the art comes out small and off-centre. The mask is thinned
    first so only something with real body counts."""
    solid = img.getchannel("A").point(lambda v: 255 if v > VISIBLE_ALPHA else 0)
    l, t, r, b = solid.filter(ImageFilter.MinFilter(SPECK)).getbbox()
    g = SPECK // 2
    return max(0, l - g), max(0, t - g), min(img.width, r + g), min(img.height, b + g)


def fit(img: Image.Image, w: int, h: int, margin: int) -> Image.Image:
    """Scale to fit inside the canvas less its margin, centred."""
    s = min((w - 2 * margin) / img.width, (h - 2 * margin) / img.height)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(img, ((w - img.width) // 2, (h - img.height) // 2))
    return out


def save(img: Image.Image, path: Path) -> None:
    img.save(path, optimize=True)
    if path.stat().st_size > MAX_BYTES:
        # Too heavy for an offline app: 256 colours with alpha, dithered.
        img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    print(f"  {path.name:22} {img.width}x{img.height}  {path.stat().st_size / 1024:.0f} KB")


def find(src: Path, word: str, avoid: str = ""):
    hits = [p for p in sorted(src.iterdir())
            if p.is_file() and word in p.name.lower() and not (avoid and avoid in p.name.lower())]
    return hits[0] if hits else None


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    src = Path(args[0])
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else ROOT / "icons" / "pulso"
    out.mkdir(parents=True, exist_ok=True)
    missing = []

    for name, (word, w, h, margin) in FILES.items():
        f = find(src, word)
        if not f:
            missing.append(name)
            continue
        img = key_magenta(Image.open(f))
        save(fit(img.crop(visible_box(img)), w, h, margin), out / name)

    plain, hot = find(src, "marker", avoid="hot"), find(src, "hot")
    if plain and hot:
        a, b = key_magenta(Image.open(plain)), key_magenta(Image.open(hot))
        if a.size != b.size:
            print("The two markers are different sizes; they cannot share a crop box.")
            return 1
        (l1, t1, r1, b1), (l2, t2, r2, b2) = visible_box(a), visible_box(b)
        box = (min(l1, l2), min(t1, t2), max(r1, r2), max(b1, b2))
        for name, img in (("pulso-marker.png", a), ("pulso-marker-hot.png", b)):
            save(fit(img.crop(box), MARKER_SIZE, MARKER_SIZE, MARKER_MARGIN), out / name)
    else:
        missing += [n for n, w in MARKERS.items() if not (hot if w == "hot" else plain)]

    if missing:
        print("MISSING source art for: " + ", ".join(missing))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
