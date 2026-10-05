# outfit.py: run inside build.py's build(sex), after hair.py. The hunter's street outfit, in the style of
# the app's art: an open hooded jacket over a tee, cargo pants and boots, all near-black.
# Each garment is the body's own surface, clipped exactly along smooth hem lines and pushed out along
# the normals (with folds at the joints), so it fits every body and follows every morph by _src.
# MakeHuman coordinates: decimetres, Y up, +Z front, +X the body's left.

# ── which bone each body vertex belongs to, and how far along it ──
def segd(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t
PB = P[:NBODY]
bones = {'torso': (J['pelvis'], J['neck'], 1.25)}
for s_ in 'lr':
    bones[s_ + 'upperarm'] = (J[s_ + '-shoulder'], J[s_ + '-elbow'], 0.42)
    bones[s_ + 'forearm'] = (J[s_ + '-elbow'], J[s_ + '-hand'], 0.33)
    bones[s_ + 'hand'] = (J[s_ + '-hand'], J[s_ + '-hand'] + (J[s_ + '-hand'] - J[s_ + '-elbow']) * 0.35, 0.3)
    bones[s_ + 'thigh'] = (J[s_ + '-upper-leg'], J[s_ + '-knee'], 0.75)
    bones[s_ + 'shin'] = (J[s_ + '-knee'], J[s_ + '-ankle'], 0.5)
    bones[s_ + 'foot'] = (J[s_ + '-ankle'], J[s_ + '-foot-1'], 0.4)
bones['head'] = (J['neck'] + (J['head'] - J['neck']) * 0.6, J['head'] + np.array([0, 0.6, 0]), 0.9)
bnames = list(bones)
dist_t = [segd(PB, a, b) for a, b, _ in bones.values()]
score = np.stack([d / r for (d, _), (_, _, r) in zip(dist_t, bones.values())], 1)
BONE = np.array([n.lstrip('lr') if n not in ('torso', 'head') else n for n in bnames])[score.argmin(1)]
BT = np.stack([t for _, t in dist_t], 1)[np.arange(NBODY), score.argmin(1)]
NB = N[:NBODY]
neck_y, hip_y = J['neck'][1], J['pelvis'][1]
torso_len = neck_y - hip_y
front_z = PB[(BONE == 'torso')][:, 2].max()

def garment(name, keep, thick, folds=None, faces=None, relax=6, shrink=False):
    """keep(i) -> g per body vertex (kept where g <= 0, clipped along g = 0);
    thick -> offset per body vertex (dm). Returns nothing; makes the mesh."""
    faces = faces or bf
    g = keep
    used = {v for f in faces for v in f if g[v] <= 0}
    co, src, out, at = [], [], [], {}
    off = PB + NB * thick[:, None]
    if folds is not None: off = off + NB * folds[:, None]
    def vert(i):
        if ('v', i) not in at:
            at[('v', i)] = len(co); co.append(off[i]); src.append(i)
        return at[('v', i)]
    def cross(i, j):
        k = ('e', min(i, j), max(i, j))
        if k not in at:
            t = g[i] / (g[i] - g[j])
            at[k] = len(co); co.append(off[i] + (off[j] - off[i]) * t); src.append(i if t < 0.5 else j)
        return at[k]
    for f in faces:
        if all(g[v] > 0 for v in f): continue
        poly = []
        for a_, b_ in zip(f, f[1:] + f[:1]):
            if g[a_] <= 0: poly.append(vert(a_))
            if (g[a_] <= 0) != (g[b_] <= 0): poly.append(cross(a_, b_))
        if len(poly) >= 3: out.append(poly)
    co = np.array(co)
    # relax: cloth drapes over the body instead of showing every muscle; the hems stay put
    nb_ = [set() for _ in range(len(co))]
    edges = collections.Counter()
    for f in out:
        for a_, b_ in zip(f, f[1:] + f[:1]):
            nb_[a_].add(b_); nb_[b_].add(a_); edges[(min(a_, b_), max(a_, b_))] += 1
    rim = {v for e, c in edges.items() if c == 1 for v in e}
    nbl = [np.array(sorted(n)) for n in nb_]
    mv = np.ones(len(co)); mv[list(rim)] = 0.15
    for k in range(relax * 2):   # Taubin: smooth, then inflate back, so tubes don't shrink into the body
        avg = np.array([co[n].mean(0) if len(n) else co[i] for i, n in enumerate(nbl)])
        co = co + (0.5 if k % 2 == 0 or shrink else -0.53) * (avg - co) * mv[:, None]
    make(name, src, out, co=co, local=True)
    print(f'{name}: {len(co)} verts')

x, y, z = PB[:, 0], PB[:, 1], PB[:, 2]
isT, isUA, isFA, isH = BONE == 'torso', BONE == 'upperarm', BONE == 'forearm', BONE == 'hand'
isTh, isSh, isF, isHead = BONE == 'thigh', BONE == 'shin', BONE == 'foot', BONE == 'head'
BIG = 9.0
ang = np.arctan2(x, z)

# the tee: torso and short sleeves, a crew neck
neckline = neck_y + 0.05 - 0.22 * smoothstep(0.2, 0.9, NB[:, 2])
g_tee = np.full(NBODY, BIG)
m = isT; g_tee[m] = np.maximum(y[m] - neckline[m], (hip_y + 0.15) - y[m])
m = isUA; g_tee[m] = BT[m] - 0.38
garment('tee', g_tee, np.full(NBODY, 0.035), relax=3)

# the jacket: hip length, long sleeves to the wrist, open down the front in a V, a high collar behind
open_w = 0.16 + 0.2 * np.clip((neck_y - y) / torso_len, 0, 1)
front_open = (z > 0) & (NB[:, 2] > 0.15) & (np.abs(x) < open_w)
collar = neck_y + 0.3 - 0.35 * smoothstep(-0.2, 0.6, NB[:, 2])
g_j = np.full(NBODY, BIG)
m = isT; g_j[m] = np.maximum(y[m] - collar[m], (hip_y - 0.32) - y[m])
g_j[isT & front_open] = BIG
m = isUA; g_j[m] = -1
m = isFA; g_j[m] = BT[m] - 0.93
m = isHead; g_j[m] = np.maximum(y[m] - collar[m], 0.2 - (-NB[m, 2]))   # the collar rises behind the neck
th_j = np.where(isT, 0.16 + 0.08 * smoothstep(hip_y + 0.4, hip_y - 0.3, y), np.where(isUA, 0.12, 0.1))
th_j = th_j + np.where(isFA, 0.04 * smoothstep(0.5, 0.9, BT), 0)                  # sleeves gather at the cuff
fold_j = np.zeros(NBODY)
m = isUA | isFA
along = np.where(isUA, BT, 1 + BT)
fold_j[m] = 0.018 * np.sin(along[m] * 22 + ang[m] * 2) * np.exp(-((along[m] - 1.0) / 0.25) ** 2) \
          + 0.012 * np.sin(along[m] * 30 + ang[m] * 3) * smoothstep(1.6, 1.9, along[m])
fold_j[isT] = 0.012 * np.sin(y[isT] * 9 + x[isT] * 4) * smoothstep(hip_y + 1.0, hip_y - 0.2, y[isT])
garment('jacket', g_j, th_j, fold_j * 2, relax=10)

# cargo pants: waist to the boot tops, loose below the knee, stacking folds over the boots
g_p = np.full(NBODY, BIG)
m = isT; g_p[m] = y[m] - (hip_y + 0.42)
m = isTh; g_p[m] = -1
m = isSh; g_p[m] = BT[m] - 0.8
th_p = np.where(isSh, 0.1 + 0.07 * smoothstep(0.1, 0.7, BT), np.where(isTh, 0.1, 0.08))
fold_p = np.zeros(NBODY)
legt = np.where(isTh, BT, np.where(isSh, 1 + BT, 0))
m = isTh | isSh
fold_p[m] = 0.02 * np.sin(legt[m] * 20 + ang[m] * 2) * np.exp(-((legt[m] - 1.0) / 0.22) ** 2) \
          + 0.022 * np.sin(legt[m] * 34 + ang[m] * 2.5) * smoothstep(1.45, 1.75, legt[m])
garment('pants', g_p, th_p, fold_p * 1.6, relax=10)

# a belt over the waistband
g_b = np.full(NBODY, BIG)
m = isT; g_b[m] = np.abs(y[m] - (hip_y + 0.36)) - 0.07
garment('belt', g_b, np.full(NBODY, 0.13), relax=4)

# boots: over the ankle, chunky, a thick sole
g_bt = np.full(NBODY, BIG)
m = isSh; g_bt[m] = 0.72 - BT[m]
m = isF; g_bt[m] = -1
th_bt = np.where(isF, 0.34, 0.17) + np.where(NB[:, 1] < -0.6, 0.12, 0)
garment('boots', g_bt, th_bt, relax=30, shrink=True)   # smoothed into a boot, no toes

# where the outfit covers the skin: the app hides that skin while the outfit is on, so nothing pokes through
cover = np.zeros(NBODY, np.float32)
for g_ in (g_tee, g_j, g_p, g_bt):
    cover[g_ < -0.04] = 1
me_ = bpy.data.objects['body'].data
a_ = me_.attributes.new('_cover', 'FLOAT', 'POINT')
a_.data.foreach_set('value', cover[:len(me_.vertices)])
