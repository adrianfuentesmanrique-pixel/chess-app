"""Cut each square of each photo, with the room above it a piece stands in."""
import cv2, numpy as np, json
from detect import to_img

def camera(H, w, h):
    """Rotation, translation and focal length from the board homography,
    principal point at the photo centre."""
    cx, cy = w / 2, h / 2
    T = np.array([[1, 0, -cx], [0, 1, -cy], [0, 0, 1]])
    G = T @ H
    h1, h2 = G[:, 0], G[:, 1]
    fs = []
    d = h1[2] * h2[2]
    if abs(d) > 1e-12:
        v = -(h1[0] * h2[0] + h1[1] * h2[1]) / d
        if v > 0: fs.append(np.sqrt(v))
    d = h1[2] ** 2 - h2[2] ** 2
    if abs(d) > 1e-12:
        v = -(h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2) / d
        if v > 0: fs.append(np.sqrt(v))
    fs = [f for f in fs if 0.3 * max(w, h) < f < 3 * max(w, h)]
    f = float(np.median(fs)) if fs else 0.8 * max(w, h)
    # One phone, one lens in this test: the board alone pins the focal length
    # badly (p3-2 came out at 2x), so it is fixed at the value the clear shots agree on.
    f = 0.4 * max(w, h)
    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]])
    M = np.linalg.inv(K) @ H
    lam = 1 / np.linalg.norm(M[:, 0])
    r1, r2, t = M[:, 0] * lam, M[:, 1] * lam, M[:, 2] * lam
    if t[2] < 0: r1, r2, t = -r1, -r2, -t
    r3 = np.cross(r1, r2)
    R = np.stack([r1, r2, r3], 1)
    # the camera must be on the +z side of the board
    C = -R.T @ t
    if C[2] < 0: R[:, 2] = -R[:, 2]
    return K, R, t, f

def project(K, R, t, P):
    X = (R @ np.asarray(P, float).T).T + t
    x = (K @ X.T).T
    return x[:, :2] / x[:, 2:3]

TALL = 1.9   # piece box height, in square widths (this set's king is ~1.8)
CW, CH = 48, 96

def square_crops(img, H):
    h, w = img.shape[:2]
    K, R, t, f = camera(H, w, h)
    out = np.zeros((8, 8, CH, CW, 3), np.uint8)
    for i in range(8):
        for j in range(8):
            m = 0.08
            P = [[i + a, j + b, z] for a in (m, 1 - m) for b in (m, 1 - m) for z in (0, TALL)]
            pts = project(K, R, t, P)
            x0, y0 = pts.min(0); x1, y1 = pts.max(0)
            # the box's own outline, stretched to a fixed 1:2 cut
            src = np.float32([[x0, y0], [x1, y0], [x1, y1]])
            dst = np.float32([[0, 0], [CW, 0], [CW, CH]])
            A = cv2.getAffineTransform(src, dst)
            out[i, j] = cv2.warpAffine(img, A, (CW, CH), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    return out, f
