"""Steps 2-3: cut the 64 squares out of every photo, train the square
recogniser and score it.

Leave-one-position-out: to score the photos of position N, the recogniser is
trained only on the photos of the other positions, so it has never seen that
arrangement. Prints, per photo, the squares right out of 64 and whether the
whole position was right; writes out/result.json.

The recogniser is MobileNetV3-small started from torchvision's ImageNet
weights (downloaded once, ~10 MB, into the torch cache — not the repo).
Before anything like it ships, check that weights' licence; trained from
scratch instead (--scratch) it scored 74% vs 82% on the first 12 photos.

Needs: opencv-python, torch, torchvision (installed with pip --user).
"""
import cv2, numpy as np, json, sys, time
import torch, torch.nn as nn, torch.nn.functional as F, torchvision
from common import photos, path, out, grid, position, CLS
from crops import square_crops

SCRATCH = '--scratch' in sys.argv
torch.manual_seed(0); np.random.seed(0)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'

# ── the data ──
boards = json.load(open(out('boards.json')))
X, Y, G = [], [], []
for f in photos():
    if boards.get(f) is None: print(f, 'skipped: no board'); continue
    c, _ = square_crops(cv2.imread(path(f)), np.array(boards[f]))
    g = grid(position(f))
    for i in range(8):
        for j in range(8): X.append(c[i, j]); Y.append(CLS.index(g[i][j])); G.append(f)
X, Y, G = np.array(X), np.array(Y), np.array(G)
P = np.array([position(g) for g in G])   # the arrangement each square comes from

# ── the model ──
def net():
    m = torchvision.models.mobilenet_v3_small(weights=None if SCRATCH else 'DEFAULT')
    m.classifier[3] = nn.Linear(m.classifier[3].in_features, 13)
    return m

MEAN = torch.tensor([0.485, 0.456, 0.406], device=dev).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225], device=dev).view(1, 3, 1, 1)
def tens(x): return torch.tensor(x[..., ::-1].copy(), dtype=torch.float32, device=dev).permute(0, 3, 1, 2) / 255
def norm(x): return (F.interpolate(x, size=(128, 64), mode='bilinear', align_corners=False) - MEAN) / STD

def augment(x):
    n = x.shape[0]
    # light and colour: dim light and flash are only in training once their photos are
    x = x * (0.6 + 0.8 * torch.rand(n, 1, 1, 1, device=dev)) * (0.85 + 0.3 * torch.rand(n, 3, 1, 1, device=dev))
    x = x + 0.15 * (torch.rand(n, 1, 1, 1, device=dev) - 0.5)
    flip = torch.rand(n, device=dev) < 0.5
    x[flip] = x[flip].flip(3)
    # small shifts and zooms: the corners are never exact
    th = torch.zeros(n, 2, 3, device=dev)
    s = 0.9 + 0.2 * torch.rand(n, device=dev)
    th[:, 0, 0] = s; th[:, 1, 1] = s
    th[:, :, 2] = 0.12 * (torch.rand(n, 2, device=dev) - 0.5)
    return F.grid_sample(x.clamp(0, 1), F.affine_grid(th, x.shape, align_corners=False), padding_mode='border', align_corners=False)

def fit(xtr, ytr, epochs=60):
    m = net().to(dev)
    opt = torch.optim.AdamW(m.parameters(), 1e-3, weight_decay=1e-3)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 1e-3, total_steps=epochs * ((len(xtr) + 63) // 64))
    cnt = np.bincount(ytr, minlength=13).astype(float)
    w = torch.tensor(np.where(cnt > 0, 1 / np.sqrt(np.maximum(cnt, 1)), 0), dtype=torch.float32, device=dev)
    w = w / w[ytr].mean()
    xt, yt = tens(xtr), torch.tensor(ytr, device=dev)
    for _ in range(epochs):
        m.train(); perm = torch.randperm(len(xt), device=dev)
        for k in range(0, len(xt), 64):
            b = perm[k:k + 64]
            loss = F.cross_entropy(m(norm(augment(xt[b]))), yt[b], weight=w, label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
    return m

def predict(m, x):
    m.eval()
    with torch.no_grad():
        xt = tens(x)
        p = F.softmax(m(norm(xt)), 1) + F.softmax(m(norm(xt.flip(3))), 1)
    return p.argmax(1).cpu().numpy()

# ── leave one position out ──
rows = []
for pos in sorted(set(P)):
    tr = P != pos
    t0 = time.time(); m = fit(X[tr], Y[tr])
    print(f'position {pos} held out: trained in {time.time() - t0:.0f}s on {tr.sum() // 64} photos', flush=True)
    for ph in sorted(set(G[P == pos])):
        te = G == ph
        pr, yt = predict(m, X[te]), Y[te]
        rows.append(dict(photo=ph, right=int((pr == yt).sum()), occupied=int(((pr > 0) == (yt > 0)).sum()),
                         wrong=[f'{"abcdefgh"[i // 8]}{i % 8 + 1} {CLS[y]}->{CLS[p]}' for i, (p, y) in enumerate(zip(pr, yt)) if p != y]))
print()
print('photo | squares right | piece-or-empty right | whole position')
for r in rows:
    print(f"{r['photo']} | {r['right']}/64 | {r['occupied']}/64 | {'YES' if r['right'] == 64 else 'no'}")
tot = sum(r['right'] for r in rows)
print(f'all: {tot}/{64 * len(rows)} = {100 * tot / (64 * len(rows)):.1f}% of squares, {sum(r["right"] == 64 for r in rows)}/{len(rows)} whole positions')
json.dump(rows, open(out('result.json'), 'w'), indent=1)
