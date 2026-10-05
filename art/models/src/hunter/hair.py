# hair.py: run inside build.py's build(sex). Brows and hair styles grown from the scalp of the body itself,
# so they sit on it exactly and every vertex follows the morphs of the body vertex it grew from.
# MakeHuman coordinates here: decimetres, Y up, +Z front, +X the body's left.

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

bf = [[i for i, _ in f] for f in body_faces]
bodyN = mh_normals(P, body_faces)
eyeL, eyeR = P[joint('l-eye')].mean(0), P[joint('r-eye')].mean(0)
eye_y = (eyeL[1] + eyeR[1]) / 2
dy = eye_y - 8.033   # heights below are the male body's; the female body stands lower

# ── brows: tapered ribbons laid on the brow ridge ──
from mathutils.bvhtree import BVHTree
bvh = BVHTree.FromPolygons([tuple(v) for v in P[:NV].tolist()], [tuple(f) for f in bf])
for s, eye in (('l', eyeL), ('r', eyeR)):
    sign = 1 if s == 'l' else -1
    rows, src, uvs = [], [], []
    n = 14
    for k in range(n + 1):
        t = k / n
        dx = -0.17 + t * 0.4
        y = eye[1] + 0.25 + 0.06 * math.sin(min(1, t * 1.25) * math.pi) - t * 0.05
        w = 0.055 * (1 - t) ** 0.7 + 0.016
        for side in (-1, 1):
            q = Vector((eye[0] + sign * dx, y + side * w / 2, eye[2] + 2.0))
            hit, nrm, fi, _ = bvh.ray_cast(q, Vector((0, 0, -1)))
            if hit is None: hit, nrm = q - Vector((0, 0, 1.6)), Vector((0, 0, 1))
            pnt = np.array(hit) + np.array(nrm) * 0.012
            rows.append(pnt)
            src.append(min(bf[fi], key=lambda vi: np.linalg.norm(P[vi] - pnt)) if fi is not None else 0)
            uvs.append((t, (side + 1) / 2))
    faces = [[2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1] if s == 'l' else [2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2] for k in range(n)]
    make('brow_' + s, src, faces, co=np.array(rows), local=True, uv=uvs)

# ── hair: a shell over the scalp, thickness per style, with an inner wall so the edge never shows a gap ──
head_c = np.array([0, eye_y + 0.3, (eyeL[2] - 1.15)])
def hairline(q):
    """The y above which a head vertex carries hair: low at the nape, above the ears, high at the forehead."""
    z = q[..., 2] - head_c[2]
    line = 6.85 + dy + (eye_y + 0.58 - 6.85 - dy) * smoothstep(-0.55, 0.95, z)
    temple = smoothstep(0.35, 0.75, np.abs(q[..., 0])) * smoothstep(0.4, 1.0, z) * 0.12
    return line + temple

head_vs = np.array([v for v in range(len(P[:13380])) if P[v][1] > 6.3 + dy])
def scalp_faces(drop=0.0, ears=True):
    """Body faces that lie wholly above the hairline (lowered by drop)."""
    out = []
    for f in bf:
        q = P[f]
        if q[:, 1].min() < 6.3 + dy: continue
        if not np.all(q[:, 1] > hairline(q) - drop): continue
        if ears and np.any(np.abs(q[:, 0]) > 0.86) and q[:, 1].min() < eye_y + 0.45: continue   # leave the ears out
        out.append(f)
    return out

def subdivide(co, src, faces, rounds=2, smooth=3, fixed=None):
    """Split each quad into four (edge midpoints, face centre), then relax the surface. New vertices
    follow the morphs of their first parent. fixed: vertex indices that must not move when relaxing."""
    co = [np.asarray(c, float) for c in co]; src = list(src)
    for _ in range(rounds):
        edges, out = {}, []
        def mid(a, b):
            k = (a, b) if a < b else (b, a)
            if k not in edges:
                edges[k] = len(co); co.append((co[a] + co[b]) / 2); src.append(src[a])
            return edges[k]
        for f in faces:
            if len(f) != 4: out.append(f); continue
            a, b, c, d = f
            ab, bc, cd, da = mid(a, b), mid(b, c), mid(c, d), mid(d, a)
            ce = len(co); co.append((co[a] + co[b] + co[c] + co[d]) / 4); src.append(src[a])
            out += [[a, ab, ce, da], [ab, b, bc, ce], [ce, bc, c, cd], [da, ce, cd, d]]
        faces = out
    co = np.array(co)
    nb = collections.defaultdict(set)
    for f in faces:
        for i, v in enumerate(f):
            nb[v].update((f[i - 1], f[(i + 1) % len(f)]))
    fixed = set(fixed or [])
    for _ in range(smooth):
        new = co.copy()
        for v, ns in nb.items():
            if v in fixed: continue
            new[v] = co[v] * 0.5 + co[list(ns)].mean(0) * 0.5
        co = new
    return co, src, faces

def shell(name, faces, thick, inner=0.006, flow_noise=0.0, post=None, drop=0.0):
    """faces: body faces; thick(q, n) -> outward thickness per vertex (dm)."""
    vs = sorted({v for f in faces for v in f})
    loc = {v: i for i, v in enumerate(vs)}
    q = P[vs].copy(); nrm = bodyN[vs].copy()
    # the edge on the head is slid along the scalp onto the hairline itself, so it runs as a smooth curve
    # rather than following the stair-steps of whole faces
    ce = collections.Counter()
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]): ce[tuple(sorted((a, b)))] += 1
    rim = {v for e, c in ce.items() if c == 1 for v in e}
    for k, v in enumerate(vs):
        if v not in rim or q[k][1] < 6.4 + dy: continue
        target = Vector((q[k][0], float(hairline(q[k]) - drop), q[k][2]))
        hit = bvh.find_nearest(target)
        if hit[0] is not None and (hit[0] - Vector(q[k])).length < 0.35:
            q[k] = np.array(hit[0]); nrm[k] = np.array(hit[1])
    t = thick(q, nrm)
    # thin to almost nothing at the edge, so the hairline is soft rather than a wall
    cnt0 = collections.Counter()
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]): cnt0[tuple(sorted((a, b)))] += 1
    edge = {v for e, c in cnt0.items() if c == 1 for v in e}
    ring = {v: 0 for v in edge}
    nbr = collections.defaultdict(set)
    for f in faces:
        for i, v in enumerate(f): nbr[v].update(f)
    frontier = set(edge)
    for r in range(1, 4):
        frontier = {w for v in frontier for w in nbr[v] if w not in ring}
        for w in frontier: ring[w] = r
    t = t * np.array([0.25 + 0.75 * min(ring.get(v, 4), 3) / 3 for v in vs])
    if flow_noise:   # clumps: thickness ripples around the head and along it
        ang = np.arctan2(q[:, 0], q[:, 2] - head_c[2])
        t = t * (1 + flow_noise * (0.6 * np.sin(ang * 9 + q[:, 1] * 3) + 0.4 * np.sin(ang * 23 - q[:, 1] * 7)))
    outer = q + nrm * t[:, None]
    if post is not None: outer = post(outer, q)
    innr = q + nrm * inner
    nvs = len(vs)
    co = np.vstack([outer, innr])
    src = vs + vs
    fl = [[loc[v] for v in f] for f in faces] + [[loc[v] + nvs for v in reversed(f)] for f in faces]
    # the rim: boundary edges joined outer to inner
    cnt = collections.Counter()
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]): cnt[tuple(sorted((a, b)))] += 1
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            if cnt[tuple(sorted((a, b)))] == 1:
                fl.append([loc[b], loc[a], loc[a] + nvs, loc[b] + nvs])
    # smooth it: subdivide twice and relax (the inner wall stays on the scalp)
    co, src, fl = subdivide(co, src, fl, rounds=1, smooth=5, fixed=range(nvs, 2 * nvs))
    # uv for a strand texture: around the head (u), down from the crown (v)
    ang = np.arctan2(co[:, 0], co[:, 2] - head_c[2])
    crown = np.linalg.norm(co - np.array([0, 8.5 + dy, head_c[2]]), axis=1)
    uv = list(zip(ang / (2 * math.pi) * 6, crown * 0.6))
    return co, src, fl, uv

def top_weight(q):
    return smoothstep(7.9 + dy, 9.0 + dy, q[..., 1])

def front_weight(q):
    return smoothstep(0.2, 1.0, q[..., 2] - head_c[2])

styles = {}
# buzz: a thin shell grown straight from the scalp faces
styles['buzz'] = shell('buzz', scalp_faces(), lambda q, n: np.full(len(q), 0.035))

# ── every other style is a volume: a signed distance field around the head, shaped per style and
#    meshed with marching cubes, so the hair is one smooth closed surface with a clean hairline ──
import time
from skimage.measure import marching_cubes
from scipy.ndimage import gaussian_filter, map_coordinates
STEP = 0.032
lo = np.array([-2.2, 4.6 + dy, head_c[2] - 2.1])
hi = np.array([2.2, 10.6 + dy, head_c[2] + 1.7])
dims = (np.ceil((hi - lo) / STEP)).astype(int) + 1
axes = [lo[i] + np.arange(dims[i]) * STEP for i in range(3)]
G = np.stack(np.meshgrid(*axes, indexing='ij'), -1)
t0 = time.time()
fn = bvh.find_nearest
D = np.empty(G.shape[:3], np.float32)
flat = G.reshape(-1, 3)
dv = D.reshape(-1)
for k, p in enumerate(flat.tolist()):
    hit, nrm, _, dist = fn(Vector(p))
    dv[k] = dist if (p[0] - hit[0]) * nrm[0] + (p[1] - hit[1]) * nrm[1] + (p[2] - hit[2]) * nrm[2] >= 0 else -dist
D = gaussian_filter(D, 0.8)   # the body's distance, signed (negative inside), lightly smoothed
print(f'hair field {dims.tolist()} in {time.time() - t0:.1f}s')
GX, GY, GZ = G[..., 0], G[..., 1], G[..., 2]
ANG = np.arctan2(GX, GZ - head_c[2])
HL = hairline(G)

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

def cap(thick, drop=0.0, ramp=0.3, clumps=0.15, ears=True):
    """Hair lying on the scalp: thickness thick (array over the grid) above the hairline, thinning
    toward the hairline over ramp so it meets the skin softly."""
    above = GY - (HL - drop)
    t = thick * (0.12 + 0.88 * smoothstep(0, ramp, above))
    if clumps:   # clumps of strands: the thickness ripples around the head and down it
        t = t * (1 + clumps * (0.6 * np.sin(ANG * 9 + GY * 3) + 0.4 * np.sin(ANG * 23 - GY * 7)))
    f = np.maximum(D - t, -above)
    if ears:     # keep clear of the ears
        f = np.maximum(f, np.minimum(np.abs(GX) - 0.86, eye_y + 0.45 - GY))
    return f

def mesh(name, f, scalp_only=True):
    f = gaussian_filter(f, 0.7)
    f = np.maximum(f, -(D + 0.004))   # a shell: nothing deeper than the skin
    f[[0, -1], :, :] = f[:, [0, -1], :] = f[:, :, [0, -1]] = 1   # closed at the edges of the grid
    v, faces, _, _ = marching_cubes(f, 0.0, spacing=(STEP,) * 3)
    v = v + lo
    # drop the skin-side cap: triangles lying on or inside the skin are never seen
    dv = map_coordinates(D, ((v - lo) / STEP).T, order=1)
    keep = ~(dv[faces] < 0.012).all(1)
    faces = faces[keep]
    used = np.unique(faces); remap = -np.ones(len(v), int); remap[used] = np.arange(len(used))
    v, faces = v[used], remap[faces]
    # relax (Taubin: shrink then inflate, so the volume stays put)
    nb = [[] for _ in range(len(v))]
    for a, b, c in faces:
        nb[a] += (b, c); nb[b] += (a, c); nb[c] += (a, b)
    nbi = [np.array(sorted(set(n))) for n in nb]
    for lam in (0.5, -0.53) * 3:
        avg = np.array([v[n].mean(0) if len(n) else v[i] for i, n in enumerate(nbi)])
        v = v + lam * (avg - v)
    src = [bkd.find(Vector(p))[1] for p in v.tolist()]
    ang = np.arctan2(v[:, 0], v[:, 2] - head_c[2])
    crown = np.linalg.norm(v - np.array([0, 8.5 + dy, head_c[2]]), axis=1)
    uv = list(zip(ang / (2 * math.pi) * 6, crown * 0.6))
    print(f'hair_{name}: {len(v)} verts, {len(faces)} tris')
    return v, src, faces.tolist(), uv

TW, FW = top_weight(G), front_weight(G)
styles['short'] = mesh('short', cap(0.05 + 0.1 * TW + 0.05 * FW * TW))
styles['quiff'] = mesh('quiff', cap(0.05 + 0.07 * TW + 0.3 * FW * TW, clumps=0.1))
rng = np.random.default_rng(7)
curl = np.zeros(G.shape[:3], np.float32)
for _ in range(9):   # curls: a few sinusoids in random directions, so no grid shows through
    k = rng.normal(size=3); k *= rng.uniform(9, 16) / np.linalg.norm(k)
    curl += np.sin(G @ k + rng.uniform(0, 6.3)).astype(np.float32)
curl /= 3
styles['curly'] = mesh('curly', cap((0.16 + 0.16 * TW) * (1 + 0.25 * curl), drop=0.1, clumps=0))
crown_y = float(P[head_vs][:, 1].max())
ell = np.array([1.4, 1.2, 1.4]); cen = np.array([0, crown_y - 0.55, head_c[2] - 0.12])
afro_ball = (np.linalg.norm((G - cen) / ell, axis=-1) - 1) * 1.2 - 0.05 * curl
above = GY - (HL - 0.15)
styles['afro'] = mesh('afro', np.maximum.reduce([smin(afro_ball, D - 0.08, 0.1), -above + 0.0 * afro_ball,
                                                 np.minimum(np.abs(GX) - 0.86, eye_y + 0.45 - GY)]))
styles['medium'] = mesh('medium', cap(0.1 + 0.1 * TW, drop=0.35 * (1 - 0.8 * FW), ears=False, clumps=0.22))

# long hair: the medium cap plus a fall of hair hanging straight down from the back of the skull
skull_back = P[head_vs][P[head_vs][:, 1] > 7.2 + dy][:, 2].min()
def fall(y_top, y_bot, w_top, w_bot, depth):
    """Hair filling the space behind the head and neck down to y_bot, out to a straight back plane."""
    t = np.clip((y_top - GY) / (y_top - y_bot), 0, 1)
    w = w_top + (w_bot - w_top) * t
    hem = y_bot + 0.18 * (GX / w_bot) ** 2 + 0.05 * np.sin(GX * 14)        # a soft V, a little ragged
    # the back of the fall: curved around the head, with strands clumping into soft ridges
    plane = skull_back - depth - 0.06 * t + 0.22 * (GX / w) ** 2 \
        - 0.035 * (np.sin(GX * 17 + GY * 0.8) + 0.6 * np.sin(GX * 31 - GY * 1.3)) * (0.4 + t)
    f = np.maximum.reduce([np.abs(GX) - w, hem - GY, GY - y_top, plane - GZ, GZ - (head_c[2] - 0.15)])
    return np.maximum(f, -(D - 0.015))                                     # rests on the body, never in it
long_cap = cap(0.1 + 0.1 * TW, drop=0.35 * (1 - 0.8 * FW), ears=False, clumps=0.22)
styles['long'] = mesh('long', smin(long_cap, fall(8.5 + dy, 5.35 + dy, 0.8, 1.0, 0.14) * 1.0, 0.12))

# ponytail: a close cap and a tapered tail from the back of the crown
def tube(pts, radii):
    f = np.full(G.shape[:3], 9.0, np.float32)
    for (a, ra), (b, rb) in zip(zip(pts, radii), zip(pts[1:], radii[1:])):
        ab = b - a
        h = np.clip(((G - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(G - a - h[..., None] * ab, axis=-1) - (ra + (rb - ra) * h)
        f = np.minimum(f, d)
    return f
base = np.array([0, 7.85 + dy, skull_back - 0.05])
pts, radii = [], []
for j in range(13):
    t = j / 12
    pts.append(base + np.array([0, -1.75 * t ** 1.15, -0.42 * math.sin(min(1, t * 1.8) * math.pi / 2) + 0.1 * t]))
    radii.append(0.2 * (1 - 0.7 * t) * (1 + 0.6 * math.sin(min(1, t * 2.2) * math.pi)) if j else 0.13)
tail = np.maximum(tube(pts, radii), -(D - 0.02))
styles['ponytail'] = mesh('ponytail', smin(cap(0.06 + 0.05 * TW, clumps=0.08), tail, 0.06))

for name, (co, src, fl, uv) in styles.items():
    make('hair_' + name, src, fl, co=co, local=True, uv=uv)
