# The Coiled Serpent (weekly boss): a naga. An athletic upper body in black war-plate, a plate per
# muscle, rises out of a great scaled snake tail coiled on the floor. Read from its shadow alone: a
# broad flared cobra hood, ribbed and spiked at its edge, behind a viper's head with long fangs; a
# wide coil at its base; a long curved glaive. Its hood carries glowing eyespots on its back.
# Its attack: it rears up high, head drawn back, then lunges, the head and the glaive striking forward.
#   python3.11 serpent.py [--bake] [--tex 1024] [--out ../../serpent.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *
from mathutils import Quaternion

reset(61)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'serpent.glb'))
GREEN = (0.048, 1.0, 0.277)   # #27AE60, its glow

J = {'pelvis': V((0, 0.02, 1.58)), 'waist': V((0, 0.03, 1.82)), 'chest': V((0, 0.0, 2.17)), 'upchest': V((0, 0.02, 2.39)),
     'neck': V((0, -0.06, 2.62)), 'head': V((0, -0.19, 2.82)), 'crown': V((0, -0.19, 3.0))}
# the legs are built by athlete() but sit folded inside the tail's root, carrying nothing
mirrored(J, {'shoulder': (0.48, 0.03, 2.39), 'elbow': (0.72, 0.1, 1.92), 'wrist': (0.8, -0.1, 1.52), 'knuckle': (0.83, -0.16, 1.37),
             'hip': (0.07, 0.02, 1.52), 'knee': (0.07, 0.03, 1.38), 'ankle': (0.06, 0.04, 1.26), 'toe': (0.06, -0.02, 1.22)})
H = J['head']

# ── helpers: a smooth path, and a frame along it (tangent, the back, the side) ──
def crs(pts, n):
    pts = [V(p) for p in pts]
    def cr(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); u = f - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    return [cr(k / (n - 1)) for k in range(n)]

def lin(vals, n):
    out = []
    for k in range(n):
        f = k / (n - 1) * (len(vals) - 1); i = min(int(f), len(vals) - 2); u = f - i
        out.append(vals[i] * (1 - u) + vals[i + 1] * u)
    return out

def frames(P):
    out = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        ref = V((0, abs(t.z), 1 - abs(t.z)))
        d = (ref - t * ref.dot(t)).normalized()
        out.append((p, t, d, t.cross(d)))
    return out

def sect_blade(name, spine, edge, side, thick, ridge=0.4):
    """A forged blade from a spine line and an edge line: a diamond section, thick at the spine,
    a ridge down the flat, the edge a single hard line."""
    bm = bmesh.new(); rings = []
    n = len(spine)
    for i, (s, e) in enumerate(zip(spine, edge)):
        k = thick * (1 - (i / (n - 1)) ** 3 * 0.85)
        r = s.lerp(e, ridge)
        rings.append([bm.verts.new(e), bm.verts.new(r + side * k * 0.8), bm.verts.new(s + side * k * 0.5),
                      bm.verts.new(s - side * k * 0.5), bm.verts.new(r - side * k * 0.8)])
    for a, b in zip(rings, rings[1:]):
        for j in range(5):
            bm.faces.new((a[j], a[(j + 1) % 5], b[(j + 1) % 5], b[j]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh_from_bm(name, bm)
    return sharp(ob, 30)

def qe(axis, ang):
    return tuple(Quaternion(V(axis).normalized(), ang).to_euler('XYZ'))

# ── the tail: down from the hips to the floor in front, then round the body in a wide coil, the tip
# lifting at the front-right and curling in ──
CTR = V((0, 0.12, 0))
TPc = [V((0, 0.02, 1.68)), V((0, 0.06, 1.36)), V((0, 0.0, 1.02)), V((0.0, -0.14, 0.66)), V((0.04, -0.34, 0.38)), V((0.14, -0.52, 0.27))]
TRc = [0.2, 0.235, 0.26, 0.28, 0.29, 0.29]
a0 = math.atan2(TPc[-1].y - CTR.y, TPc[-1].x)
for k in range(1, 13):
    a = a0 + k * 0.42
    R = 0.66 - 0.005 * k
    r = 0.29 - 0.0125 * k
    TPc.append(V((math.cos(a) * R, CTR.y + math.sin(a) * R, r * 0.92)))
    TRc.append(r)
e = TPc[-1]
TPc += [e + V((-0.12, -0.2, 0.08)), e + V((-0.1, -0.42, 0.28)), e + V((0.04, -0.54, 0.48)), e + V((0.2, -0.54, 0.56))]
TRc += [0.11, 0.085, 0.055, 0.02]
NP = 150
TP = crs(TPc, NP)
TR = lin(TRc, NP)
FR = frames(TP)
ci = lambda k: TPc[k]   # the control points are on the path

# the rig of the tail: 'lift' lies along the floor from the coil to where the tail rises, so turning
# it lifts the whole upright part (rearing); 'rise0/1' are the upright column, the hips hang off it;
# the coil's own chain runs on round to the tip
J['ta'], J['tb'], J['tc'] = ci(8), ci(5), ci(2)
for i, k in enumerate((8, 11, 14, 17, 19, 21)):
    J[f'c{i}'] = ci(k)
TAILB = [('lift', 'ta', 'tb', None), ('rise0', 'tb', 'tc', 'lift'), ('rise1', 'tc', 'pelvis', 'rise0')]
TAILB += [(f'coil{i}', f'c{i}', f'c{i + 1}', None if i == 0 else f'coil{i - 1}') for i in range(5)]
TAIL = {b for b, *_ in TAILB} | {'hips'}
LIFT_AX = (J['tb'] - J['ta']).cross(V((0, 0, 1))).normalized()

# the jaw and the glaive get bones of their own: the jaw opens, the glaive pivots in the fist
J['jaw0'], J['jaw1'] = H + V((0, 0.0, -0.09)), H + V((0, -0.3, -0.19))
gR = J['wrist.R'].lerp(J['knuckle.R'], 0.6)
UP = V((-0.03, -0.1, 1.0)).normalized()
J['grip'], J['gripT'] = gR, gR + UP * 0.3
BONES = TAILB + [(b, h, t, 'rise1' if b == 'hips' else p) for b, h, t, p in human_bones()]
BONES += [('jaw', 'jaw0', 'jaw1', 'head'), ('glaive', 'grip', 'gripT', 'hand.R')]

def drop_legs(obs):
    # the legs' muscles would only bulge through the tail: leave them out of the body
    for o in [o for o in obs if o.get('muscle') and o['muscle'].split('.')[0] in LEGS]:
        obs.remove(o); bpy.data.objects.remove(o)

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.02, waist=0.86, extra=drop_legs)
K = 1.18   # the head, a touch oversized: it has to read at the end of a long body
M = lambda pts: [H + V(p) * K for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

# ── the viper's head: a broad flat wedge of a skull, deep sockets under hooded brows, the jaw ajar ──
def build_head():
    P = {}
    P['skull'] = hull('skull', M(both([(0.0, 0.1, 0.06), (0.1, 0.08, 0.02), (0.155, 0.03, -0.05), (0.13, -0.07, 0.035), (0.075, -0.22, 0.03),
                                        (0.045, -0.31, -0.005), (0.0, -0.335, 0.0), (0.0, -0.12, 0.085), (0.125, -0.05, -0.075),
                                        (0.065, -0.26, -0.07), (0.0, -0.285, -0.065), (0.08, 0.06, -0.085), (0.0, 0.09, -0.06)])), bevel=0.003)
    P['lowjaw'] = hull('lowjaw', M(both([(0.135, 0.02, -0.085), (0.12, 0.0, -0.125), (0.06, -0.235, -0.16), (0.0, -0.27, -0.168),
                                          (0.0, -0.25, -0.125), (0.07, -0.2, -0.105), (0.1, -0.05, -0.09)])), bevel=0.003)
    # the armoured cap: a steel plate over the crown, keeled, its front a point between the brows
    P['headplate'] = hull('headplate', M(both([(0.0, -0.22, 0.05), (0.05, -0.17, 0.07), (0.1, -0.05, 0.1), (0.0, -0.06, 0.125),
                                                (0.09, 0.07, 0.075), (0.0, 0.12, 0.085), (0.0, 0.0, 0.14), (0.0, -0.15, 0.1),
                                                (0.06, -0.14, 0.055), (0.11, -0.02, 0.06), (0.08, 0.08, 0.045)])), bevel=0.003)
    for s, n in SIDES:
        # the brow: a hooded ridge of horn over each eye, so the eye burns from under it
        P['brow.' + n] = hull('brow.' + n, M([(s * 0.05, -0.19, 0.075), (s * 0.15, -0.06, 0.08), (s * 0.165, -0.1, 0.045), (s * 0.08, -0.2, 0.045),
                                              (s * 0.13, 0.02, 0.085), (s * 0.12, -0.12, 0.1), (s * 0.15, 0.01, 0.06)]), bevel=0.002)
        # swept horns off the brows, back over the hood
        P['bhorn.' + n] = blade('bhorn.' + n, H + V((s * 0.13, -0.02, 0.07)) * K, H + V((s * 0.3, 0.3, 0.2)) * K, 0.04, curve=V((s * 0.02, 0, 0.05)), thick=0.5)
        P['cheekspur.' + n] = blade('cheekspur.' + n, H + V((s * 0.15, 0.02, -0.05)) * K, H + V((s * 0.28, 0.18, -0.12)) * K, 0.034, thick=0.45)
        # the fangs, long and hooked back, down past the chin; lesser teeth along the lip
        P['fang.' + n] = spike('fang.' + n, H + V((s * 0.05, -0.3, -0.07)) * K, H + V((s * 0.055, -0.27, -0.33)) * K, 0.02, curve=V((0, 0.035, 0)), n=8, power=1.0)
        P['teeth.' + n] = join([spike('tooth', H + V((s * (0.07 + 0.012 * i), -0.2 + 0.05 * i, -0.07)) * K, H + V((s * (0.07 + 0.012 * i), -0.2 + 0.05 * i + 0.01, -0.12)) * K, 0.008, n=4, sub=1) for i in range(3)], 'teeth.' + n)
        P['lteeth.' + n] = join([spike('ltooth', H + V((s * (0.05 + 0.015 * i), -0.22 + 0.06 * i, -0.12)) * K, H + V((s * (0.05 + 0.015 * i), -0.22 + 0.06 * i, -0.085)) * K, 0.007, n=4, sub=1) for i in range(3)], 'lteeth.' + n)
    # a crest of short horn blades down the keel of the skull and neck
    P['crest'] = join([blade('cr', H + V((0, -0.02 + i * 0.06, 0.13 - i * 0.03)) * K, H + V((0, 0.05 + i * 0.07, 0.19 - i * 0.04)) * K, 0.028 - i * 0.003, thick=0.35)
                       for i in range(4)], 'crest')
    return P

# ── the hood: flared behind the head, ribbed like a fan, scalloped and spiked at its edge ──
RIBS = [0.1, 0.22, 0.35, 0.48, 0.62, 0.78]
def hood_w(t):
    w = 0.14 + 0.66 * math.sin(math.pi * min(t, 1) ** 0.72) ** 1.1 * (1 - 0.2 * t)
    if RIBS[0] < t < RIBS[-1]:   # the edge sags between the ribs
        f = (t - RIBS[0]) / (RIBS[1] - RIBS[0]); f -= int(f)
        w *= 1 - 0.1 * math.sin(math.pi * f)
    return w
def hood_pt(u, t, lift=0.0):
    w = hood_w(t)
    x = u * w
    y = 0.14 + 0.26 * t - 0.42 * u * u * (w / 0.6) + lift
    z = H.z + 0.14 - t * 0.8
    return V((x, y, z))

def build_hood():
    P = {}
    P['hood'] = cloth('hood', 26, 22, lambda u, t: tuple(hood_pt(u, t)), thick=0.026, sub=1)
    ribs = []
    for i, t in enumerate(RIBS):
        for s in (1, -1):
            pts = [hood_pt(s * u, t) for u in (0.05, 0.3, 0.6, 0.85, 1.0)]
            ribs.append(tube('hrib', pts, [0.02, 0.019, 0.016, 0.013, 0.012], sub=1))
            d = (pts[-1] - pts[-2]).normalized()
            ribs.append(blade('hspike', pts[-1] - d * 0.03, pts[-1] + d * (0.16 - abs(t - 0.4) * 0.1) + V((0, 0.02, 0.03)), 0.026, thick=0.5))
    # the spine of the hood: a ridge of horn down its back
    ribs.append(tube('hspine', [hood_pt(0, t, 0.02) for t in (0.0, 0.3, 0.6, 0.9)], [0.03, 0.035, 0.032, 0.025], sub=1))
    P['hribs'] = sharp(join(ribs, 'hribs'), 35)
    return P

# ── the tail's skin: keeled scales shingled down its back, broad scutes across its belly ──
def build_tail():
    P = {}
    P['tail'] = tube('tail', TP[::3] + [TP[-1]], TR[::3] + [TR[-1]], flat=0.92, sub=2)
    sc, su = [], []
    acc, row = 0.0, 0
    for i in range(1, NP - 4):
        p, t, d, sd = FR[i]
        acc += (TP[i] - TP[i - 1]).length
        r = TR[i]
        if p.z > 1.42 or acc < 0.1 * max(0.5, r / 0.25):
            continue
        acc = 0.0; row += 1
        L = 0.17 * max(0.45, r / 0.26)
        for phi in ((-0.95, 0.0, 0.95) if row % 2 else (-0.48, 0.48)):
            n = d * math.cos(phi) + sd * math.sin(phi)
            lat = sd * math.cos(phi) - d * math.sin(phi)
            c = p + n * (r * 0.93)
            W = r * 0.33
            top = [c - t * L * 0.5, c + lat * W - n * W * W / (2 * r) - t * L * 0.05, c - lat * W - n * W * W / (2 * r) - t * L * 0.05,
                   c + t * L * 0.55 + n * 0.02, c + t * L * 0.12 + n * 0.028]
            sc.append(hull('scale', top + [q - n * 0.025 for q in top[:4]], bevel=0))
        b = -d
        if b.z < -0.55:
            continue
        arc = []
        for k in range(7):
            phi = -1.05 + k * 0.35
            n = b * math.cos(phi) + sd * math.sin(phi)
            arc += [p + n * (r * 0.96) - t * L * 0.4, p + n * (r * 0.96 + 0.022) + t * L * 0.45, p + n * (r * 0.7) - t * L * 0.4, p + n * (r * 0.7) + t * L * 0.45]
        su.append(hull('scute', arc, bevel=0.002))
    P['dscales'] = join(sc, 'dscales')
    P['scutes'] = join(su, 'scutes')
    p, t, d, sd = FR[-1]
    P['barb'] = blade('barb', TP[-3], TP[-1] + t * 0.32 + d * 0.06, 0.05, curve=d * 0.05, thick=0.35)
    P['barb2'] = blade('barb2', TP[-8], TP[-8] + d * 0.14 - t * 0.08, 0.035, thick=0.4)
    return P

def build_gear():
    P = {'hands': hands}
    P.update(build_head())
    P.update(build_hood())
    P.update(build_tail())
    muscle_plates(P, src, FIELDS, skip=LEGS, scale=1.05)
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.11 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['cspike.' + n] = blade('cspike.' + n, el + V((s * 0.02, 0.02, 0.02)), el + V((s * 0.07, 0.28, 0.1)), 0.04, curve=V((0, 0, 0.05)), thick=0.45)
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.fa.' + n] = strap(shell, 'strap.fa.' + n, el, wr, (0, 0.6, 0.4), t0=0.1, t1=0.95)
        d = (kn - wr).normalized()
        for i in range(4):   # gauntlet talons
            off = V((0, -0.065 + i * 0.13 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.09 + V((0, -0.07, -0.03)), 0.015, curve=V((0, -0.02, 0)), thick=0.6)
        if 'm.sidedelt.' + n in P:   # fang-like thorns raking back off the shoulder plate
            P['pthorns.' + n] = thorns(P['m.sidedelt.' + n], 'pthorns.' + n, lambda c, s=s, sh=sh: c.z > sh.z + 0.0 and s * c.x > abs(sh.x) - 0.02,
                                       3, 0.24, 0.045, up=1.2, back=0.9, curve=0.35, seed=5 + s, flat=0.5)
    # the girdle where the man ends and the snake begins: a heavy belt, and pointed scale-plates
    # hung from it round the tail's root
    P['belt'] = plate(shell, 'belt', lambda p: 1.6 < p.z < 1.72 and abs(p.x) < 0.42, push=0.06, thick=0.022, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    fl = []
    for k in range(12):
        a = k / 12 * math.tau + 0.13
        o, tg = V((math.sin(a), -math.cos(a) * 0.9, 0)), V((math.cos(a), math.sin(a) * 0.9, 0))
        top, tip = V((0, 0.03, 1.66)) + o * 0.235, V((0, 0.03, 1.4)) + o * 0.27
        w = 0.085
        fl.append(hull('fauld', [top + tg * w, top - tg * w, top + o * 0.02 + tg * w, top + o * 0.02 - tg * w,
                                 top.lerp(tip, 0.6) + tg * w * 0.8 + o * 0.03, top.lerp(tip, 0.6) - tg * w * 0.8 + o * 0.03,
                                 top.lerp(tip, 0.5) + o * 0.05, tip + o * 0.022, tip], bevel=0.002))
    P['fauld'] = join(fl, 'fauld')
    # the glaive in the right hand: a long black haft, a fang-curved blade with a hooked spur behind,
    # a socket like a viper's skull
    bot, top = gR - UP * 0.95, gR + UP * 1.3
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.5), top], [0.03, 0.03, 0.034], sub=1), 50)
    P['grip'] = join([ring(f'grip{i}', gR + UP * (-0.12 + i * 0.03), 0.034, 0.007, rot=UP.to_track_quat('Z', 'Y').to_euler(), seg=(18, 6)) for i in range(9)], 'grip')
    fw = (V((0, -1, 0)) - UP * V((0, -1, 0)).dot(UP)).normalized()
    side = UP.cross(fw).normalized()
    spine, edge = [], []
    N = 16
    for k in range(N + 1):
        f = k / N
        a = 0.08 + 0.95 * f
        sb = -0.03 + 0.2 * f * f            # the spine sweeps back to the tip
        w = 0.15 * (1 - f) ** 0.55 * (0.62 + 0.38 * math.sin(math.pi * f)) + 0.004
        spine.append(top + UP * a - fw * sb)
        edge.append(top + UP * (a + 0.02 * f) - fw * (sb - w) + UP * 0.03 * (1 - f))
    P['gblade'] = sect_blade('gblade', spine, edge, side, 0.022)
    P['gsocket'] = hull('gsocket', [top + UP * z + fw * y + side * x for x in (-0.045, 0.045) for y in (-0.05, 0.06) for z in (-0.12, 0.12)] +
                        [top + UP * 0.16 + fw * 0.02, top - UP * 0.2], bevel=0.004)
    P['gspur'] = blade('gspur', top + UP * 0.05 - fw * 0.05, top + UP * 0.32 - fw * 0.34, 0.05, curve=UP * 0.06, thick=0.3)
    P['gfang'] = join([blade('gf', top + UP * 0.1 + fw * 0.05 + side * s * 0.03, top + UP * -0.06 + fw * 0.16 + side * s * 0.03, 0.02, thick=0.6) for s in (1, -1)], 'gfang')
    P['ferrule'] = blade('ferrule', bot, bot - UP * 0.22, 0.032, thick=1.0)
    return P, edge

gear, EDGE = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:   # the eyes, sunk under the brows, slit and burning
        eyes.append(orb('eye.' + n, H + V((s * 0.128, -0.125, 0.028)) * K, (0.042, 0.034, 0.014), rot=(0, s * 0.25, s * -0.75)))
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    g['maw'] = (hull('maw', M(both([(0.06, -0.06, -0.08), (0.04, -0.24, -0.075), (0.03, -0.22, -0.105), (0.06, -0.06, -0.095)])), bevel=0), 'head')
    # the eyespots on the hood: the cobra's warning, burning through it, front and back
    spots = []
    for s in (1, -1):
        for (u, t, rr) in ((0.5, 0.4, 0.085), (0.8, 0.34, 0.04)):
            c = hood_pt(s * u, t)
            nrm = (hood_pt(s * u + 0.02, t) - hood_pt(s * u - 0.02, t)).cross(hood_pt(s * u, t + 0.02) - hood_pt(s * u, t - 0.02)).normalized()
            q = nrm.to_track_quat('Y', 'Z')
            sp = orb('spot', V((0, 0, 0)), (rr, 0.02, rr * 1.2))
            sp.rotation_mode = 'QUATERNION'; sp.rotation_quaternion = q; sp.location = c + nrm * 0.012
            apply_xform(sp); spots.append(sp)
            ring_ = ring('spotring', V((0, 0, 0)), rr * 1.35, 0.006, rot=(math.pi / 2, 0, 0), seg=(24, 4))
            ring_.rotation_mode = 'QUATERNION'; ring_.rotation_quaternion = q; ring_.location = c + nrm * 0.012
            apply_xform(ring_); spots.append(ring_)
    g['hoodspots'] = (join(spots, 'hoodspots'), 'neck')
    g['edge'] = (tube('edge', EDGE, [0.005] * len(EDGE), sub=1), 'glaive')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'couter', 'm.frontdelt')
GLAIVE = ('haft', 'gblade', 'gsocket', 'gspur', 'gfang', 'ferrule')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('skull', 'crest') or name.startswith(('brow', 'bhorn', 'cheekspur')):
        return ('scales' if name == 'skull' else 'horn'), ('rigid', 'head')
    if name == 'headplate': return 'helm', ('rigid', 'head')
    if name.startswith(('fang', 'teeth')): return 'bone', ('rigid', 'head')
    if name.startswith('lteeth'): return 'bone', ('rigid', 'jaw')
    if name == 'lowjaw': return 'scales', ('rigid', 'jaw')
    if name == 'hood': return 'hood', ('smooth', {'head', 'neck', 'chest'})
    if name == 'hribs': return 'horn', ('smooth', {'head', 'neck', 'chest'})
    if name in ('tail', 'dscales'): return 'scales', ('smooth', TAIL)
    if name == 'scutes': return 'scute', ('smooth', TAIL)
    if name.startswith('barb'): return 'horn', ('rigid', 'coil4')
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'fauld': return 'steel', ('smooth', {'hips', 'rise1'})
    if name.startswith(('couter', 'cspike')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith('pthorns'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.fa'): return 'leather', ('rigid', 'forearm.' + side)
    if name.startswith('talon'): return 'bone', ('rigid', 'hand.' + side)
    if name == 'grip': return 'leather', ('rigid', 'glaive')
    if name in GLAIVE: return 'steel', ('rigid', 'glaive')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 6500
    if name == 'hands': return 2400
    if name == 'tail': return 5200
    if name == 'dscales': return 5000
    if name == 'scutes': return 2400
    if name == 'hood': return 2600
    if name == 'hribs': return 2600
    if name in ('skull', 'lowjaw', 'headplate'): return 900
    if name.startswith('m.'): return plate_tris(name)
    if name in ('fauld',): return 1400
    if name == 'gblade': return 600
    if name.startswith(('couter', 'belt')): return 600
    if name.startswith('pthorns'): return 600
    if name == 'grip': return 700
    return min(tris, 300)

def uv_weight(name):
    if name in ('skull', 'headplate', 'lowjaw', 'gblade') or name.startswith(('brow', 'bhorn', 'fang')): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name in ('hood', 'hribs'): return 1.3
    if name in ('tail', 'dscales', 'scutes'): return 0.6
    if name == 'body_high': return 0.5
    return 1.0

MATS, FLAT = knight_mats(accent=GREEN, paint=(0.004, 0.03, 0.012), leather=(0.02, 0.022, 0.014), bone=(0.16, 0.15, 0.1),
                         cloth=[(0.0, (0.006, 0.03, 0.012)), (0.4, (0.01, 0.014, 0.012)), (1.0, (0.008, 0.01, 0.009))])
MATS['horn'] = mat_horn2('horn', root=(0.008, 0.012, 0.009), tip=(0.09, 0.11, 0.06), zmin=0.0, zmax=3.2, rough=0.42, bands=40.0)
MATS['scales'] = mat_hide('scales', [(0.3, (0.006, 0.012, 0.009)), (0.6, (0.014, 0.032, 0.02)), (0.85, (0.03, 0.06, 0.035))],
                          scale=40.0, big=6.0, rough=(0.5, 0.3), bump=(0.6, 0.8))
MATS['scute'] = mat_horn2('scute', root=(0.02, 0.024, 0.015), tip=(0.07, 0.078, 0.045), zmin=0.0, zmax=1.7, rough=0.45, bands=80.0)
MATS['hood'] = mat_membrane('hood', dark=(0.006, 0.014, 0.01), light=(0.02, 0.06, 0.03), vein=(0.012, 0.04, 0.02))
FLAT.update({'horn': (0.05, 0.06, 0.04, 0.45, 0), 'scales': (0.03, 0.06, 0.04, 0.45, 0), 'scute': (0.05, 0.055, 0.035, 0.5, 0),
             'hood': (0.04, 0.09, 0.05, 0.55, 0)})

def idle(t):
    T = 3.6
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.9)
    # it sways as a snake does when reared: the column weaves, the torso counters, the head stays level
    p['rise0'] = (0.02 * c, 0.05 * s, 0)
    p['rise1'] = (-0.02 * c, -0.03 * s, 0.03 * s)
    p['spine'] = (p['spine'][0], -0.02 * s, p['spine'][2])
    p['head'] = (p['head'][0], -0.03 * s, p['head'][2])
    for i in range(5):
        p[f'coil{i}'] = (0, 0, 0.03 * (i + 1) / 5 * math.sin(TAU * t / T - i * 0.8))
    p['jaw'] = (0.04 + 0.03 * s, 0, 0)
    p['glaive'] = (0.22, 0, 0)   # the arm's hang leans the haft back; the fist holds it upright
    return p

def roar(t):
    p = roar_pose(t, idle)
    a, b = p['_a'], p['_b']
    for k in ('upperarm.R', 'forearm.R', 'hand.R', 'glaive'):
        p[k] = idle(t)[k]
    p['jaw'] = (0.05 + 0.25 * a + 0.75 * b, 0, 0)          # the jaws gape
    p['lift'] = qe(LIFT_AX, 0.25 * b)                       # it rises to hiss
    p['rise0'] = tuple(x + y for x, y in zip(p['rise0'], qe(LIFT_AX, -0.25 * b)))
    return p

def attack(t):
    # "Serpent's Strike": it rears up on its coil, head and glaive drawn back, holds, then lunges;
    # the column whips forward, the jaws gape and the glaive drives out level with the fangs
    r = ease(t / 0.75) * (1 - ease((t - 0.95) / 0.2))
    k = ease((t - 0.95) / 0.2) * (1 - ease((t - 1.75) / 1.0))
    shake = math.sin(t * 70) * 0.015 * ease((t - 1.1) / 0.05) * (1 - ease((t - 1.5) / 0.3))
    p = fade_idle(idle(t), 1 - max(r, k))
    lift = 0.6 * r + 0.32 * k
    p['lift'] = qe(LIFT_AX, lift)
    cnt = qe(LIFT_AX, -lift)
    p = posed(p, rise0=(cnt[0] - 0.12 * r + 0.42 * k + shake, cnt[1], cnt[2]), rise1=(-0.1 * r + 0.22 * k, 0, 0),
              spine=(-0.14 * r + 0.14 * k, 0, 0), chest=(-0.12 * r + 0.1 * k, 0, 0), neck=(-0.25 * r + 0.18 * k, 0, 0), head=(-0.3 * r + 0.06 * k, 0, 0),
              jaw=(0.3 * r + 0.7 * k, 0, 0),
              upperarm_R=(0.5 * r - 1.0 * k, 0.1 * r, 0), forearm_R=(-1.5 * r - 0.5 * k, 0, 0),
              upperarm_L=(-0.4 * r + 0.55 * k, -0.35 * r - 0.2 * k, 0), forearm_L=(-0.6 * r - 0.3 * k, 0, 0))
    # the fist turns the glaive: reared back over the shoulder, then levelled as it drives out
    chain = sum(p.get(b, (0, 0, 0))[0] for b in ('rise0', 'rise1', 'spine', 'chest', 'upperarm.R', 'forearm.R', 'hand.R')) - cnt[0]
    want = 0.22 * (1 - max(r, k)) - 0.35 * r + 1.5 * k        # the blade's pitch in the world: cocked back, then level
    p['glaive'] = (want - chain * max(r, k), 0, 0)
    for i in range(5):   # the coil tightens as it rears
        p[f'coil{i}'] = (0, 0, p.get(f'coil{i}', (0, 0, 0))[2] + 0.04 * r * (i + 1) / 5)
    return p

parts = {'body_high': body, **gear}
for k in [k for k, v in parts.items() if v is None or not v.data.polygons]:
    print('empty part dropped:', k, flush=True); parts.pop(k)
finish('Serpent', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, GREEN,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
