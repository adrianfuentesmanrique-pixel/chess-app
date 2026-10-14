"""Kael art: green-screen key + the shipped sizes. Dev tool, not shipped.

    python -I tools/kael-art.py [artDir]        (artDir defaults to ../chess-app-art/kael)

The drawings (1024x1024 JPEG *.jfif on flat #00FF00) live OUTSIDE the repo.
Step 1 keys every one of them to a transparent 1024 PNG in <artDir>/final/
(the three widget pictures also at 512); kael-widget-atrisk was drawn
mirrored, so it is flipped. Step 2 writes what the app ships, sized from the
largest place each is shown x 3 for phone pixel density:
  icons/kael/kael-bust.png     390 square   (.kael-portrait is 130px wide)
  icons/kael/kael-welcome.png  390 wide     (same), trimmed to the figure
  icons/notif/daily.png        192 square   kael-notif, notification icon
  icons/notif/daily-wide.jpg   960x480      kael-notif on navy, expanded notification
icons/notif/badge.png is not Kael: tools/resize-notif.mjs makes it.
"""
import sys, os, glob
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'chess-app-art', 'kael')
FINAL = os.path.join(ART, 'final')
FLIP = {'kael-widget-atrisk'}
WIDGET = {'kael-widget-lit', 'kael-widget-atrisk', 'kael-widget-zero'}
LO, HI = 28.0, 110.0   # greenness (g - max(r, b)) over which alpha falls from 1 to 0


def key(path):
    """Transparent RGBA from a green-screen JPEG: alpha from how green each
    pixel is, green spill clamped, JPEG speckle removed, edge pulled in ~1px."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    d = im[..., 1] - np.maximum(im[..., 0], im[..., 2])
    a = np.clip(1.0 - (d - LO) / (HI - LO), 0.0, 1.0)
    im[..., 1] = np.minimum(im[..., 1], np.maximum(im[..., 0], im[..., 2]))
    A = Image.fromarray((a * 255).astype(np.uint8))
    A = A.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    A = np.asarray(A).astype(np.float32)
    A[A < 8] = 0
    im[A == 0] = 0
    return Image.fromarray(np.dstack([im, A]).astype(np.uint8), 'RGBA')


def resize(pic, size):
    """Premultiplied Lanczos resize, so no colour bleeds in from clear pixels."""
    a = np.asarray(pic.convert('RGBA')).astype(np.float32) / 255
    pm = np.dstack([a[..., :3] * a[..., 3:4], a[..., 3]])
    r, g, b, A = [np.asarray(Image.fromarray(pm[..., i] * 255, 'F').resize(size, Image.LANCZOS)) / 255 for i in range(4)]
    A = np.clip(A, 0, 1)
    rgb = np.clip(np.dstack([r, g, b]) / np.maximum(A, 1e-4)[..., None], 0, 1)
    rgb[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]))
    rgb[A < 1 / 255] = 0
    return Image.fromarray(np.dstack([rgb * 255, A * 255]).round().astype(np.uint8), 'RGBA')


def trim(pic, pad=16):
    x0, y0, x1, y1 = pic.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return pic.crop((max(x0 - pad, 0), max(y0 - pad, 0), min(x1 + pad, pic.width), min(y1 + pad, pic.height)))


def banner(pic, w, h):
    """The expanded-notification picture: Android crops it to about 2:1, so the
    bust is drawn taller than the banner and runs off the bottom edge, on the
    app's navy (radial #22386a -> #0f1b33). Opaque, so JPEG."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.clip(np.hypot(xx - w / 2, yy - h * 0.45) / (w * 0.6), 0, 1)[..., None]
    bg = np.array([0x22, 0x38, 0x6a]) * (1 - t) + np.array([0x0f, 0x1b, 0x33]) * t
    out = Image.fromarray(bg.round().astype(np.uint8), 'RGB').convert('RGBA')
    ih = round(h * 1.25); iw = round(pic.width * ih / pic.height)
    out.alpha_composite(resize(pic, (iw, ih)), (round((w - iw) / 2), round(h * 0.04)))
    return out.convert('RGB')


def smooth(pic):
    """Median-filter the colour (not the alpha): the JPEG noise in the
    drawings is what makes a PNG big, and the flat cartoon art loses nothing."""
    rgb = pic.convert('RGB').filter(ImageFilter.MedianFilter(3))
    return Image.merge('RGBA', (*rgb.split(), pic.getchannel('A')))


def save(pic, rel, budget=100 * 1024):
    """A .png is precached, so it must stay small: round the colours to the
    finest step that fits the budget (step 4 is invisible on this art)."""
    path = os.path.join(ROOT, rel)
    if rel.endswith('.jpg'):
        pic.save(path, quality=86, optimize=True)
    else:
        for step in (1, 2, 4, 6, 8):
            a = np.asarray(pic).astype(np.int32)
            a[..., :3] = np.clip((a[..., :3] + step // 2) // step * step, 0, 255)
            a[..., 3][a[..., 3] > 247] = 255
            a[a[..., 3] == 0, :3] = 0
            Image.fromarray(a.astype(np.uint8), 'RGBA').save(path, optimize=True)
            if os.path.getsize(path) <= budget:
                break
        print(f'  colour step {step}')
    print(f'{rel}  {pic.width}x{pic.height}  {os.path.getsize(path) / 1024:.1f} KB')


os.makedirs(FINAL, exist_ok=True)
keyed = {}
for f in sorted(glob.glob(os.path.join(ART, '*.jfif'))):
    name = os.path.splitext(os.path.basename(f))[0]
    name = 'kael-model-sheet' if name == 'model sheet' else name
    pic = key(f)
    if name in FLIP:
        pic = pic.transpose(Image.FLIP_LEFT_RIGHT)
    pic.save(os.path.join(FINAL, name + '.png'), optimize=True)
    if name in WIDGET:
        resize(pic, (512, 512)).save(os.path.join(FINAL, name + '-512.png'), optimize=True)
    keyed[name] = pic
print(f'{len(keyed)} keyed into {FINAL}')

save(resize(smooth(keyed['kael-bust']), (390, 390)), 'icons/kael/kael-bust.png')
wel = smooth(trim(keyed['kael-welcome']))
save(resize(wel, (390, round(wel.height * 390 / wel.width))),'icons/kael/kael-welcome.png')
save(resize(smooth(keyed['kael-notif']), (192, 192)), 'icons/notif/daily.png')
save(banner(keyed['kael-notif'], 960, 480), 'icons/notif/daily-wide.jpg')
