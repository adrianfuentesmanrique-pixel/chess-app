"""Board finder for the camera feasibility test (dev only).

find_board(img) -> H (3x3, board units -> image px) or None.
Board units: (0,0)..(8,8), x = file axis, y = rank axis, cell (i,j) spans
[i,i+1]x[j,j+1]. a1 is a dark cell, so cream cells have (i+j) odd. Which of
the two remaining 180-degree turns is White's side is NOT decided here.
"""
import cv2, numpy as np

def cream_mask(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    L, a, b = [lab[..., i].astype(int) for i in range(3)]
    return ((L > 150) & (b > 134) & (b < 165) & (a < 138)).astype(np.uint8) * 255

def quads(mask, scale):
    k = max(2, int(round(scale * 3)))
    m = cv2.erode(mask, np.ones((k, k), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cs:
        area = cv2.contourArea(c)
        if area < 60 * scale * scale: continue
        hull = cv2.convexHull(c)
        if area < 0.85 * cv2.contourArea(hull): continue      # bitten by a piece
        p = cv2.approxPolyDP(hull, 0.06 * cv2.arcLength(hull, True), True)
        if len(p) != 4: continue
        p = p.reshape(4, 2).astype(np.float64)
        # Clockwise on screen (image y points down) from the top-most corner.
        ctr = p.mean(0)
        ang = np.arctan2(p[:, 1] - ctr[1], p[:, 0] - ctr[0])
        p = p[np.argsort(ang)]
        out.append(p)
    return out

UNIT = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float64)

def to_img(H, pts):
    pts = np.asarray(pts, np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, H).reshape(-1, 2)

def grow(qs, seed, H, tol=0.18, ctol=0.2):
    """From one quad taken as a unit cell, keep adding quads that land on the
    lattice, refitting the homography each round."""
    Hi = np.linalg.inv(H)
    used = {seed: (0, 0)}
    for _ in range(6):
        src, dst = [], []
        for idx, (ci, cj) in used.items():
            for k in range(4):
                src.append(UNIT[k] + (ci, cj)); dst.append(qs[idx][k])
        if len(used) >= 2:
            H, _ = cv2.findHomography(np.array(src), np.array(dst), 0)
            if H is None: return None, {}
            Hi = np.linalg.inv(H)
        changed = False
        for idx, q in enumerate(qs):
            if idx in used: continue
            uv = to_img(Hi, q)
            c = uv.mean(0) - 0.5
            r = np.round(c)
            if np.abs(c - r).max() > tol: continue
            if (int(r[0]) + int(r[1])) % 2: continue          # cream cells are diagonal neighbours
            # its four corners must sit on lattice points, near one cell apart
            cr = uv - (r + 0.5)
            if np.abs(np.abs(cr) - 0.5).max() > ctol: continue
            # match corner order to UNIT
            order = [int(np.argmin(((cr - (UNIT[k] - 0.5)) ** 2).sum(1))) for k in range(4)]
            if len(set(order)) < 4: continue
            qs[idx] = q[order]
            used[idx] = (int(r[0]), int(r[1]))
            changed = True
        if not changed and len(used) >= 2: break
    return H, used

def find_board(img, debug=None):
    # Strict first; a looser fit only when the strict one finds too little.
    res = None
    for tol, ctol in ((0.18, 0.2), (0.12, 0.13), (0.08, 0.1)):
        H, info = _find(img, tol, ctol)
        if H is not None: return H, info
        res = (H, info)
    return res

def _find(img, tol, ctol):
    h, w = img.shape[:2]
    scale = max(h, w) / 1600
    qs = quads(cream_mask(img), scale)
    if len(qs) < 4: return None, {'quads': len(qs)}
    areas = np.array([cv2.contourArea(q.astype(np.float32)) for q in qs])
    best = (0, None, None)
    for s in np.argsort(-areas)[:40]:
        q0 = [q.copy() for q in qs]
        H0 = cv2.getPerspectiveTransform(UNIT.astype(np.float32), q0[s].astype(np.float32)).astype(np.float64)
        H, used = grow(q0, s, H0, tol, ctol)
        if H is not None and len(used) > best[0]:
            best = (len(used), H, used)
    n, H, used = best
    if n < 5: return None, {'quads': len(qs), 'cells': n}
    cells = np.array(list(used.values()))
    lo, hi = cells.min(0), cells.max(0)
    span = hi - lo + 1
    if (span > 8).any(): return None, {'cells': n, 'span': span.tolist()}
    # Make the lattice right-handed on screen (files to the right of ranks).
    J = to_img(H, [[0, 0], [1, 0], [0, 1]])
    a, b = J[1] - J[0], J[2] - J[0]
    if a[0] * b[1] - a[1] * b[0] > 0:            # y is down: >0 means mirrored
        H = H @ np.array([[0, 1, 0], [1, 0, 0], [0, 0, 1]], np.float64)
        cells = cells[:, ::-1]; lo, hi = cells.min(0), cells.max(0)
    # Pick the 8x8 window: every cream cell inside, its corner cell dark, and
    # what lies just outside it looking like frame rather than board.
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    def cell_stats(i, j):
        pts = to_img(H, [[i + u, j + v] for u in (0.3, 0.5, 0.7) for v in (0.3, 0.5, 0.7)])
        vals = []
        for x, y in pts:
            if 0 <= x < w and 0 <= y < h: vals.append(lab[int(y), int(x)])
        return np.array(vals) if vals else None
    def frame_like(i, j):
        s = cell_stats(i, j)
        if s is None: return 0.5
        # the frame is a smooth, reddish wood: high a*, no cream
        return float(np.mean((s[:, 1] > 140) & (s[:, 0] < 160)))
    best = None
    for x0 in range(hi[0] - 7, lo[0] + 1):
        for y0 in range(hi[1] - 7, lo[1] + 1):
            out = [(x0 - 1, y0 + k) for k in range(8)] + [(x0 + 8, y0 + k) for k in range(8)] + \
                  [(x0 + k, y0 - 1) for k in range(8)] + [(x0 + k, y0 + 8) for k in range(8)]
            inn = [(x0, y0 + k) for k in range(8)] + [(x0 + 7, y0 + k) for k in range(8)] + \
                  [(x0 + k, y0) for k in range(8)] + [(x0 + k, y0 + 7) for k in range(8)]
            sc = np.mean([frame_like(*c) for c in out]) - np.mean([frame_like(*c) for c in inn])
            if best is None or sc > best[0]: best = (sc, x0, y0)
    if best is None: return None, {"cells": n, "span": span.tolist(), "why": "no window"}
    sc, x0, y0 = best
    H = H @ np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]], np.float64)
    if (x0 + y0) % 2 == 0:
        # The origin landed on a light corner (cream cells are even here):
        # turn a quarter so it starts on the dark one next to it.
        H = H @ np.array([[0, -1, 8], [1, 0, 0], [0, 0, 1]], np.float64)
    return H, {'cells': n, 'span': span.tolist(), 'score': round(float(sc), 2)}

def draw(img, H, color=(0, 255, 255)):
    out = img.copy()
    t = max(2, img.shape[1] // 400)
    for k in range(9):
        for a, b in (([k, 0], [k, 8]), ([0, k], [8, k])):
            p = to_img(H, [a, b]).astype(int)
            cv2.line(out, tuple(p[0]), tuple(p[1]), color, t)
    c = to_img(H, [[0.5, 0.5]])[0].astype(int)
    cv2.circle(out, tuple(c), 6 * t, (0, 0, 255), -1)       # the (0,0) cell
    return out

def snap(img, corners, tol=0.25):
    """The fallback after the user drags 4 corners roughly (a1, h1, h8, a8):
    fit, then pull the fit onto whatever cream squares line up with it."""
    H = cv2.getPerspectiveTransform(np.float32([[0, 0], [8, 0], [8, 8], [0, 8]]), np.float32(corners)).astype(np.float64)
    h, w = img.shape[:2]
    qs = quads(cream_mask(img), max(h, w) / 1600)
    for _ in range(3):
        Hi = np.linalg.inv(H); src, dst = [], []
        for q in qs:
            uv = to_img(Hi, q); c = uv.mean(0) - 0.5; r = np.round(c)
            if np.abs(c - r).max() > tol or not (0 <= r[0] < 8 and 0 <= r[1] < 8): continue
            if (int(r[0]) + int(r[1])) % 2 == 0: continue        # must be a light cell
            cr = uv - (r + 0.5)
            if np.abs(np.abs(cr) - 0.5).max() > tol: continue
            for k in range(4):
                src.append(np.sign(cr[k]) * 0.5 + r + 0.5); dst.append(q[k])
        if len(src) < 12: break
        H2, _ = cv2.findHomography(np.array(src), np.array(dst), cv2.RANSAC, 4.0)
        if H2 is None: break
        H = H2
    return H, len(src) // 4
