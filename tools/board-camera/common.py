"""Shared bits of the board-camera feasibility test (dev only, nothing ships).

Photos live OUTSIDE the repo, in C:\\Users\\Adrian\\BoardPhotos, named
p<position>-<shot>.jpg (shot 1 overhead, 2 White's side, 3 from the side,
4 dim light, 5 flash). Everything the scripts write goes to BoardPhotos\\out —
never into the repo: square cut-outs are pieces of photos of a home.
"""
import os, glob

PHOTOS = os.environ.get('BOARD_PHOTOS', r'C:\Users\Adrian\BoardPhotos')
OUT = os.path.join(PHOTOS, 'out')
os.makedirs(OUT, exist_ok=True)

# What is ON THE BOARD in each photo set. p2 is as set on the real board
# (Black's d-pawn on d5, e-pawn still on e7), not the 1.e4 e5 of the brief.
FEN = {
    1: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
    2: 'r1bqkbnr/1pp1pppp/p1n5/1B1p4/4P3/5N2/PPPP1PPP/RNBQK2R',
    3: 'r2qr1k1/bpp2pp1/p1n1bn1p/3pp3/4P3/1BPP1NNP/PP3PP1/R1BQR1K1',
    4: 'r3k2r/pp6/8/8/8/8/5PPP/R3K3',
}
CLS = '.PNBRQKpnbrqk'

# Photos whose board shows another position than their name says.
SHOWS = {'p2-5': 3, 'p3-5': 2}   # these two look swapped at naming

def position(name):
    """Which FEN a photo shows."""
    return SHOWS.get(name, int(name[1]))

def grid(pos):
    """grid[file][rank] -> '.', 'P', 'p', ... (file 0 = a, rank 0 = rank 1)."""
    g = [['.'] * 8 for _ in range(8)]
    for r, row in enumerate(FEN[pos].split('/')):
        f = 0
        for ch in row:
            if ch.isdigit(): f += int(ch)
            else: g[f][7 - r] = ch; f += 1
    return g

def photos():
    """Photo names (no extension) found in PHOTOS, sorted."""
    return sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(PHOTOS, 'p[0-9]-[0-9].jpg')))

def path(name): return os.path.join(PHOTOS, name + '.jpg')
def out(name): return os.path.join(OUT, name)
