# Builds the Hunter: the player's own 3D body, one file per body type (hunter-male.glb, hunter-female.glb).
#
#   python3.11 fetch.py                      # downloads the MakeHuman base mesh and targets (CC0) into ./mh
#   python3.11 build.py [--sex male|female] [--out dir]
#
# The body is the MakeHuman base mesh with its targets baked in as glTF morph targets, so the app can
# shape it live: overall muscle and weight, the muscles the player trains, tape measurements, and the
# face (shape, nose, mouth, eyes, ears, brows, ancestry blend). Hair styles, eyes, brows and training
# clothes are separate meshes carrying the same morphs, so they follow the body.
# Each body vertex carries _muscle: the index of the tracked muscle under it (MUSCLES in index.html),
# or 255, so the app can paint the heatmap on the body. Blender coordinates: Z up, facing -Y (glTF +Z).
import bpy, bmesh, os, sys, math, collections
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
MH = os.path.join(HERE, 'mh')
ARGS = sys.argv
SEXES = [ARGS[ARGS.index('--sex') + 1]] if '--sex' in ARGS else ['male', 'female']
OUT = ARGS[ARGS.index('--out') + 1] if '--out' in ARGS else os.path.normpath(os.path.join(HERE, '..', '..'))

MUSCLES = ["Upper Chest", "Middle Chest", "Lower Chest", "Front Shoulders", "Lateral Shoulders", "Rear Shoulders",
           "Biceps", "Triceps", "Forearms", "Upper Abs", "Middle Abs", "Lower Abs", "Obliques", "Hip Flexors",
           "Traps", "Upper Back", "Lats", "Lower Back", "Glutes", "Hamstrings", "Quads", "Calves"]
NONE = 255

# ── the base mesh ──
V, VT, groups = [], [], collections.defaultdict(list)
cur = None
for line in open(os.path.join(MH, 'base.obj')):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): cur = line.split()[1]
    elif line.startswith('f '):
        groups[cur].append([tuple(int(y) - 1 if y else -1 for y in (x.split('/') + [''])[:2]) for x in line.split()[1:]])
BASE = np.array(V, dtype=np.float64)
NV = len(BASE)

def target(name):
    d = np.zeros((NV, 3))
    p = os.path.join(MH, 't', name.replace('/', '__') + '.target')
    for line in open(p):
        if not line.strip() or line[0] == '#': continue
        i, x, y, z = line.split()
        d[int(i)] = (float(x), float(y), float(z))
    return d

def joint(name):
    idx = sorted({i for f in groups['joint-' + name] for i, _ in f})
    return idx

# ── morphs: name -> list of (target, weight); a pair of names for a two-way slider ──
def morph_table(sex):
    m = collections.OrderedDict()
    eth = ['african', 'asian', 'caucasian']
    for e in eth:                                   # ancestry blend; the app's weights sum to 1
        m[e] = [(f'macrodetails/{e}-{sex}-young', 1.0)] + [(f'macrodetails/{o}-{sex}-young', -1 / 3) for o in eth]
    u = f'macrodetails/universal-{sex}-young-'
    m['muscle'] = [(u + 'maxmuscle-averageweight', 1)]
    m['muscleLess'] = [(u + 'minmuscle-averageweight', 1)]
    m['heavy'] = [(u + 'averagemuscle-maxweight', 1)]
    m['thin'] = [(u + 'averagemuscle-minweight', 1)]
    m['tall'] = [(f'macrodetails/height/{sex}-young-averagemuscle-averageweight-maxheight', 1)]
    m['short'] = [(f'macrodetails/height/{sex}-young-averagemuscle-averageweight-minheight', 1)]
    both = lambda t, s: [(t.format(s='l') + s, 1), (t.format(s='r') + s, 1)]
    # the muscles training builds
    m['dev.chest'] = [('torso/torso-muscle-pectoral-incr', 1)]
    m['dev.lats'] = [('torso/torso-muscle-dorsi-incr', 1), ('torso/torso-vshape-incr', 0.5)]
    m['dev.shoulders'] = both('armslegs/{s}-upperarm-shoulder-muscle', '-incr')
    m['dev.arms'] = both('armslegs/{s}-upperarm-muscle', '-incr')
    m['dev.forearms'] = both('armslegs/{s}-lowerarm-muscle', '-incr')
    m['dev.glutes'] = [('buttocks/buttocks-volume-incr', 1)]
    m['dev.legs'] = both('armslegs/{s}-upperleg-muscle', '-incr')
    m['dev.calves'] = both('armslegs/{s}-lowerleg-muscle', '-incr')
    # tape measurements
    for k, t in (('waist', 'measure-waist-circ'), ('hips', 'measure-hips-circ'), ('bust', 'measure-bust-circ'),
                 ('arm', 'measure-upperarm-circ'), ('thigh', 'measure-thigh-circ'), ('shoulders', 'measure-shoulder-dist'),
                 ('neck', 'measure-neck-circ')):
        m[k + 'Up'] = [(f'measure/{t}-incr', 1)]
        m[k + 'Down'] = [(f'measure/{t}-decr', 1)]
    m['belly'] = [('stomach/stomach-pregnant-incr', 0.6)]
    # the face
    for s in ('oval', 'round', 'rectangular', 'square', 'triangular', 'invertedtriangular', 'diamond'):
        m['face.' + s] = [(f'head/head-{s}', 1)]
    two = lambda name, t, lo='decr', hi='incr': (m.__setitem__(name + '+', [(t + '-' + hi, 1)]), m.__setitem__(name + '-', [(t + '-' + lo, 1)]))
    two('face.full', 'head/head-fat'); two('face.wide', 'head/head-scale-horiz'); two('face.long', 'head/head-scale-vert')
    two('nose.wide', 'nose/nose-scale-horiz'); two('nose.long', 'nose/nose-scale-vert'); two('nose.hump', 'nose/nose-hump')
    two('nose.size', 'nose/nose-volume'); two('nose.nostrils', 'nose/nose-nostrils-width'); two('nose.tip', 'nose/nose-point-width')
    two('mouth.wide', 'mouth/mouth-scale-horiz'); two('neck.wide', 'neck/neck-scale-horiz')
    m['lips.full+'] = [('mouth/mouth-upperlip-volume-incr', 1), ('mouth/mouth-lowerlip-volume-incr', 1)]
    m['lips.full-'] = [('mouth/mouth-upperlip-volume-decr', 1), ('mouth/mouth-lowerlip-volume-decr', 1)]
    m['eyes.size+'] = both('eyes/{s}-eye-scale', '-incr'); m['eyes.size-'] = both('eyes/{s}-eye-scale', '-decr')
    m['eyes.slant+'] = both('eyes/{s}-eye-eyefold-angle', '-up'); m['eyes.slant-'] = both('eyes/{s}-eye-eyefold-angle', '-down')
    m['eyes.fold+'] = both('eyes/{s}-eye-epicanthus', '-out'); m['eyes.fold-'] = both('eyes/{s}-eye-epicanthus', '-in')
    m['ears.size+'] = both('ears/{s}-ear-scale', '-incr'); m['ears.size-'] = both('ears/{s}-ear-scale', '-decr')
    m['brows.up+'] = [('eyebrows/eyebrows-trans-up', 1)]; m['brows.up-'] = [('eyebrows/eyebrows-trans-down', 1)]
    return m

# MakeHuman units are decimetres, Y up, facing +Z; Blender is metres, Z up, facing -Y.
def to_blender(a):
    a = np.asarray(a) * 0.1
    return np.stack([a[..., 0], -a[..., 2], a[..., 1]], -1)

def mh_normals(P, faces):
    n = np.zeros_like(P)
    for f in faces:
        idx = [i for i, _ in f]
        a, b, c, d = (P[i] for i in idx)
        fn = np.cross(c - a, d - b)
        for i in idx: n[i] += fn
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l

# ── muscle regions on the body, from the skeleton's joints (MakeHuman coords: +x the body's left, +z front) ──
def label_muscles(P, N, body_idx):
    J = {n: P[joint(n)].mean(0) for n in ['neck', 'pelvis', 'head', 'spine-2', 'spine-3'] + [f'{s}-{j}' for s in 'lr' for j in
         ['shoulder', 'elbow', 'hand', 'upper-leg', 'knee', 'ankle', 'clavicle', 'foot-1']]}
    def segd(p, a, b):
        ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
        return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t
    p = P[body_idx]; n = N[body_idx]
    segs = {}
    torso_a, torso_b = J['pelvis'], J['neck']
    segs['torso'] = segd(p, torso_a, torso_b) + (1.25,)
    segs['head'] = segd(p, J['neck'] + (J['head'] - J['neck']) * 0.6, J['head'] + np.array([0, 0.6, 0])) + (0.9,)
    for s in 'lr':
        segs[s + 'upperarm'] = segd(p, J[s + '-shoulder'], J[s + '-elbow']) + (0.42,)
        segs[s + 'forearm'] = segd(p, J[s + '-elbow'], J[s + '-hand']) + (0.33,)
        segs[s + 'hand'] = segd(p, J[s + '-hand'], J[s + '-hand'] + (J[s + '-hand'] - J[s + '-elbow']) * 0.35) + (0.3,)
        segs[s + 'thigh'] = segd(p, J[s + '-upper-leg'], J[s + '-knee']) + (0.75,)
        segs[s + 'shin'] = segd(p, J[s + '-knee'], J[s + '-ankle']) + (0.5,)
        segs[s + 'foot'] = segd(p, J[s + '-ankle'], J[s + '-foot-1']) + (0.4,)
    names = list(segs)
    score = np.stack([segs[k][0] / segs[k][2] for k in names], 1)
    part = np.array(names)[score.argmin(1)]
    H = (p[:, 1] - J['pelvis'][1]) / (J['neck'][1] - J['pelvis'][1])   # 0 at the pelvis, 1 at the neck
    halfw = abs(J['l-shoulder'][0])
    neck_top = J['l-clavicle'][1] + 0.15 * (J['neck'][1] - J['pelvis'][1]) / 5.16
    traps_top = J['neck'][1] + (J['head'][1] - J['neck'][1]) * 0.45
    lab = np.full(len(p), NONE)
    M = {m: i for i, m in enumerate(MUSCLES)}
    for i in range(len(p)):
        k, x, nz, nx, h = part[i], p[i][0], n[i][2], n[i][0], H[i]
        ax = abs(x)
        if k == 'torso':
            front, back, side = nz > 0.35, nz < -0.35, abs(nx) > 0.6 and abs(nz) <= 0.6
            if p[i][1] > neck_top:                       # the neck: traps behind, nothing tracked in front
                lab[i] = M['Traps'] if nz < -0.2 and p[i][1] < traps_top else NONE
            elif front and h > 0.555 and ax < halfw * 0.95:
                lab[i] = M['Upper Chest'] if h > 0.76 else M['Middle Chest'] if h > 0.66 else M['Lower Chest']
            elif front and 0.12 < h <= 0.555 and ax < halfw * 0.42:
                lab[i] = M['Upper Abs'] if h > 0.45 else M['Middle Abs'] if h > 0.34 else M['Lower Abs']
            elif back and h > 0.82: lab[i] = M['Traps'] if ax < halfw * 0.55 else M['Rear Shoulders']
            elif back and h > 0.6 and ax < halfw * 0.45: lab[i] = M['Upper Back']
            elif (back or side) and h > 0.4: lab[i] = M['Lats']
            elif back and h > 0.1: lab[i] = M['Lower Back'] if ax < halfw * 0.55 else M['Obliques']
            elif (front or side) and h > 0.05: lab[i] = M['Obliques']
            elif back: lab[i] = M['Glutes']
            elif front: lab[i] = M['Hip Flexors'] if ax > halfw * 0.18 else NONE
        elif k.endswith('upperarm'):
            t = segs[k][1][i]
            if t < 0.38:
                lab[i] = M['Front Shoulders'] if nz > 0.4 else M['Rear Shoulders'] if nz < -0.4 else M['Lateral Shoulders']
            else:
                lab[i] = M['Biceps'] if nz > -0.05 else M['Triceps']
        elif k.endswith('forearm'): lab[i] = M['Forearms']
        elif k.endswith('thigh'):
            t = segs[k][1][i]
            if nz < -0.2: lab[i] = M['Glutes'] if t < 0.22 else M['Hamstrings']
            else: lab[i] = M['Hip Flexors'] if t < 0.12 and nz > 0.3 else M['Quads']
        elif k.endswith('shin'):
            t = segs[k][1][i]
            lab[i] = M['Calves'] if nz < 0.1 and t < 0.8 else NONE
    return lab, J

def smooth_labels(lab, faces_local, rounds=2):
    nb = collections.defaultdict(set)
    for f in faces_local:
        for a in f:
            nb[a].update(f)
    for _ in range(rounds):
        new = lab.copy()
        for v, ns in nb.items():
            c = collections.Counter(lab[list(ns)])
            top, cnt = c.most_common(1)[0]
            if cnt > len(ns) * 0.6: new[v] = top
        lab = new
    return lab

def build(sex):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    table = morph_table(sex)
    cache = {}
    def T(name):
        if name not in cache: cache[name] = target(name)
        return cache[name]
    # the body type's base: the neutral mesh plus an even ancestry mix of that sex
    P = BASE + sum(T(f'macrodetails/{e}-{sex}-young') for e in ('african', 'asian', 'caucasian')) / 3
    deltas = collections.OrderedDict((k, sum(T(t) * w for t, w in v)) for k, v in table.items())
    # face.swap: the other body type's face on this head (a boyish face on the female body, a girlish one
    # on the male), at this head's own size and place; it fades out down the neck
    other = 'female' if sex == 'male' else 'male'
    Po = BASE + sum(T(f'macrodetails/{e}-{other}-young') for e in ('african', 'asian', 'caucasian')) / 3
    hj = joint('head'); nk = joint('neck'); mo = joint('mouth')
    def head_frame(Q):
        c = Q[hj].mean(0); y0, y1 = Q[nk].mean(0)[1], Q[mo].mean(0)[1]
        sel = Q[:13380][:, 1] > y1 - 0.2
        r = np.sqrt(((Q[:13380][sel] - c) ** 2).sum(1).mean())
        return c, r, y0, y1
    c, r, y0, y1 = head_frame(P); co_, ro, _, _ = head_frame(Po)
    t_ = np.clip((P[:, 1] - (y0 + 0.25 * (y1 - y0))) / (0.75 * (y1 - y0)), 0, 1)
    wgt = t_ * t_ * (3 - 2 * t_)
    deltas['face.swap'] = ((Po - co_) * (r / ro) - (P - c)) * wgt[:, None]
    for d in deltas.values():
        d[np.abs(d).max(1) < 2e-3] = 0      # under 0.2 mm: drop, so the file stores only what moves (sparse)

    body_faces = groups['body']
    body_idx = np.array(sorted({i for f in body_faces for i, _ in f}))
    N = mh_normals(P, body_faces)
    lab, J = label_muscles(P, N, body_idx)
    remap = {g: l for l, g in enumerate(body_idx)}
    faces_local = [[remap[i] for i, _ in f] for f in body_faces]
    lab = smooth_labels(lab, faces_local)

    NBODY = 13380
    bkd = KDTree(NBODY)
    for v in range(NBODY): bkd.insert(Vector(P[v]), v)
    bkd.balance()
    def nearest_body(q, i):
        return bkd.find(Vector(P[i]))[1]

    def make(name, idx, faces, uvs=None, attrs=None, offset=None, co=None, local=False, uv=None):
        """A mesh object over base vertices idx (global indices), with every morph as a shape key.
        With co and local=True, idx gives each new vertex the base vertex whose morphs it follows,
        co its own rest position, and faces index the new vertices directly."""
        idx = np.asarray(idx)
        if co is None: co = P[idx].copy()
        if offset is not None: co = co + offset
        if local: fl = faces
        else:
            loc = {g: l for l, g in enumerate(idx)}
            fl = [[loc[i] for i in f] for f in faces]
        me = bpy.data.meshes.new(name)
        me.from_pydata(to_blender(co).tolist(), [], fl)
        if uv is not None:                       # one uv per vertex
            uvl = me.uv_layers.new(name='UVMap')
            for poly in me.polygons:
                for li in poly.loop_indices:
                    uvl.data[li].uv = uv[me.loops[li].vertex_index]
        if uvs is not None:
            uvl = me.uv_layers.new(name='UVMap')
            k = 0
            for poly, uv in zip(me.polygons, uvs):
                for li, t in zip(poly.loop_indices, uv):
                    uvl.data[li].uv = VT[t] if t >= 0 else (0, 0)
        for poly in me.polygons: poly.use_smooth = True
        for aname, vals in (attrs or {}).items():
            a = me.attributes.new(aname, 'FLOAT', 'POINT')
            a.data.foreach_set('value', np.asarray(vals, dtype=np.float32))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if name != 'body':
            # everything else follows the body: each vertex moves with the body vertex it sits on (_src),
            # so only the body stores morphs and the file stays small
            src = np.array([i if i < NBODY else nearest_body(P[i] if co is None else None, i) for i in idx]) if not local else idx
            a = me.attributes.new('_src', 'FLOAT', 'POINT')
            a.data.foreach_set('value', np.asarray(src, dtype=np.float32))
            return ob
        a = me.attributes.new('_id', 'FLOAT', 'POINT')
        a.data.foreach_set('value', np.asarray(idx, dtype=np.float32))
        ob.shape_key_add(name='Basis')
        for k, d in deltas.items():
            sk = ob.shape_key_add(name=k, from_mix=False)
            sk.data.foreach_set('co', (to_blender(co + d[idx])).astype(np.float32).ravel())
        return ob

    # lips, painted from the mouth joint (brows are their own meshes, in hair.py)
    p = P[body_idx]; n = N[body_idx]
    mouth = P[joint('mouth')].mean(0)
    part = np.zeros(len(body_idx))
    dm = p - mouth
    part[(np.abs(dm[:, 0]) < 0.27 - (dm[:, 1] ** 2) * 6) & (np.abs(dm[:, 1] + 0.02) < 0.085) & (n[:, 2] > 0.2) & (dm[:, 2] > -0.25)] = 1
    # where the scalp is: hair.py's hairline, softened, so the app can shade the skin under any style
    eye_y0 = (P[joint('l-eye')].mean(0)[1] + P[joint('r-eye')].mean(0)[1]) / 2
    zc = p[:, 2] - (P[joint('l-eye')].mean(0)[2] - 1.15)
    sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
    dy0 = eye_y0 - 8.033   # the female body stands lower
    line = 6.85 + dy0 + (eye_y0 + 0.58 - 6.85 - dy0) * sm(-0.55, 0.95, zc) + sm(0.35, 0.75, np.abs(p[:, 0])) * sm(0.4, 1.0, zc) * 0.12
    scalp = sm(line - 0.1, line + 0.06, p[:, 1]) * (p[:, 1] > 6.3 + dy0)
    scalp[(np.abs(p[:, 0]) > 0.86) & (p[:, 1] < eye_y0 + 0.45)] = 0   # not the ears
    body = make('body', body_idx, [[i for i, _ in f] for f in body_faces], uvs=[[t for _, t in f] for f in body_faces],
                attrs={'_muscle': lab.astype(np.float32), '_part': part, '_scalp': scalp.astype(np.float32)})

    # eyes: the helper eyeballs
    for s in 'lr':
        g = groups[f'helper-{s}-eye']
        idx = np.array(sorted({i for f in g for i, _ in f}))
        c = P[idx].mean(0)
        fwd = np.array([0, 0, 1.0])
        d = (P[idx] - c); d /= np.linalg.norm(d, axis=1, keepdims=True)
        iris = (d @ fwd)
        make('eye_' + s, idx, [[i for i, _ in f] for f in g], attrs={'_iris': iris.astype(np.float32)})

    # clothes: training shorts (and a top for the female body), cut from the tights helper so they fit and morph
    tights = groups['helper-tights']
    tidx = np.array(sorted({i for f in tights for i, _ in f}))
    hipy, kneey = J['pelvis'][1], (J['l-knee'][1] + J['l-upper-leg'][1]) / 2
    def cut(name, g):
        """The part of the tights where g(points) <= 0, clipped exactly along g = 0 (each face is cut
        where g crosses zero along its edges), so hems run as smooth lines rather than face stair-steps."""
        idx = np.array(sorted({i for f in tights for i, _ in f}))
        gv = dict(zip(idx.tolist(), g(P[idx]).tolist()))
        co, src, faces, at = [], [], [], {}
        def vert(i):
            if ('v', i) not in at:
                at[('v', i)] = len(co); co.append(P[i]); src.append(nearest_body(None, i))
            return at[('v', i)]
        def cross(i, j):
            k = ('e', min(i, j), max(i, j))
            if k not in at:
                t = gv[i] / (gv[i] - gv[j])
                at[k] = len(co); co.append(P[i] + (P[j] - P[i]) * t)
                src.append(nearest_body(None, i if t < 0.5 else j))
            return at[k]
        for f in tights:
            vs = [i for i, _ in f]
            if all(gv[i] > 0 for i in vs): continue
            poly = []
            for a_, b_ in zip(vs, vs[1:] + vs[:1]):
                if gv[a_] <= 0: poly.append(vert(a_))
                if (gv[a_] <= 0) != (gv[b_] <= 0): poly.append(cross(a_, b_))
            if len(poly) >= 3: faces.append(poly)
        co = np.array(co) + N[np.array(src)] * 0.012   # a hair off the skin, so it never pokes through
        make(name, src, faces, co=np.array(co), local=True)
    def thigh_t(q):   # how far down the thigh a point is, 0 at the hip joint, 1 at the knee
        out = np.empty(len(q))
        for s_, m in (('l', q[:, 0] > 0), ('r', q[:, 0] <= 0)):
            a_, b_ = J[s_ + '-upper-leg'], J[s_ + '-knee']
            out[m] = ((q[m] - a_) @ (b_ - a_)) / ((b_ - a_) @ (b_ - a_))
        return out
    thigh_len = np.linalg.norm(J['l-knee'] - J['l-upper-leg'])
    # shorts: from the waist down to 42% of the way to the knee
    cut('shorts', lambda q: np.maximum(q[:, 1] - (hipy + 0.55), np.minimum((hipy - 0.3) - q[:, 1], (thigh_t(q) - 0.42) * thigh_len)))
    if sex == 'female':
        # a sports top around the bust (its most forward point between the pelvis and the neck), off the arms
        neck_y = P[joint('neck')].mean(0)[1]
        torso = [i for i in body_idx if J['pelvis'][1] + 0.3 * (neck_y - J['pelvis'][1]) < P[i][1] < neck_y and abs(P[i][0]) < 1.2]
        chest_y = P[max(torso, key=lambda i: P[i][2])][1]
        armx = 1.05 * abs(J['l-shoulder'][0])
        cut('top', lambda q: np.maximum.reduce([q[:, 1] - (chest_y + 0.5), (chest_y - 0.62) - q[:, 1], np.abs(q[:, 0]) - armx]))

    exec(open(os.path.join(HERE, 'hair.py')).read(), {**globals(), **locals()})
    ns = {**globals(), **locals()}
    exec('def smoothstep(a, b, x):\n    t = np.clip((x - a) / (b - a), 0, 1)\n    return t * t * (3 - 2 * t)\n', ns)
    ns['bf'] = [[i for i, _ in f] for f in body_faces]
    exec(open(os.path.join(HERE, 'outfit.py')).read(), ns)

    for o in bpy.data.objects:
        o.select_set(True)
    out = os.path.join(OUT, f'hunter-{sex}.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=False, export_extras=True,
                              export_morph=True, export_morph_normal=False, export_try_sparse_sk=True, export_attributes=True,
                              export_materials='NONE', export_animations=False, export_texcoords=True, export_normals=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_generic_quantization=0, export_draco_position_quantization=16)
    print('exported', out, os.path.getsize(out), 'bytes;', len(deltas), 'morphs')

for sex in SEXES:
    build(sex)
