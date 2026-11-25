"""Step 1: find the board in every photo.

Writes out/boards.json (photo -> 3x3 homography, board units -> pixels, a1 at
the origin) and out/boards.jpg (every grid drawn, for a look).

A photo the finder misses is fitted from rough corners in manual_corners.json
— in the app that is the user dragging the 4 corners — and then snapped onto
whatever cream squares line up. Corners are pixel [x, y] in the order a1, h1,
h8, a8.

The finder only knows the board up to a half turn (a1 vs h8). In this test
every photo was taken with a1 on White's side, which shows on the grid as a1
being the dark corner next to White's pieces; check boards.jpg (red dot = a1)
and add a photo to FLIP below if it is the other way round.
"""
import cv2, numpy as np, json, os
from common import photos, path, out
from detect import find_board, snap, draw

# Photos where the finder's a1 is really h8: the ones taken from Black's side.
FLIP = {'p1-4', 'p1-5', 'p3-5'}
# A grid the finder got wrong (counted as a miss, fitted from corners instead).
WRONG = {'p2-4'}

here = os.path.dirname(os.path.abspath(__file__))
manual = json.load(open(os.path.join(here, 'manual_corners.json')))
res, tiles, n_auto = {}, [], 0
for f in photos():
    im = cv2.imread(path(f))
    H, info = find_board(im)
    how = 'auto'
    if f in WRONG: H, info = None, {'auto grid': 'wrong'}
    n_auto += H is not None
    if H is None and f in manual:
        H, n = snap(im, manual[f]); how = f'manual corners (+{n} squares snapped)'
    elif H is None:
        how = 'NOT FOUND'
    if H is not None and f in FLIP:
        H = H @ np.array([[-1, 0, 8], [0, -1, 8], [0, 0, 1]], np.float64)
    print(f'{f}: {how}  {info}')
    res[f] = None if H is None else H.tolist()
    v = draw(im, H) if H is not None else im
    k = 500 / max(v.shape[:2]); v = cv2.resize(v, (int(v.shape[1] * k), int(v.shape[0] * k)))
    t = np.zeros((500, 500, 3), np.uint8); t[:v.shape[0], :v.shape[1]] = v
    cv2.putText(t, f'{f} {how.split()[0]}', (5, 30), 0, 0.9, (0, 255, 255), 2); tiles.append(t)
json.dump(res, open(out('boards.json'), 'w'))
while len(tiles) % 3: tiles.append(np.zeros((500, 500, 3), np.uint8))
cv2.imwrite(out('boards.jpg'), np.vstack([np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)]))
print(f'found automatically: {n_auto}/{len(res)}')
