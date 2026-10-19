# The Iron Serpent (weekly boss): the second naga, and nothing like the first. Heavy-shouldered, its
# whole tail sheathed in overlapping riveted iron rings that shingle from the girdle to the barb; a
# serpent-skull helm with a long hanging jaw and no hood at all; a mane of iron spines down the back
# of its head, spine and tail; and two curved khopesh swords held wide. The tail lies in a long S
# across the floor, the tip raised behind, so its shadow is a reaping hook, not a coil.
# Its attack: a whirling double slash, both blades sweeping round as the tail lashes after them.
#   python3.11 iron_serpent.py [--bake] [--tex 1024] [--out ../../iron-serpent.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *
from mathutils import Quaternion

reset(83)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'iron-serpent.glb'))
IVORY = (0.91, 0.835, 0.718)   # #E8D5B7, its glow

J = {'pelvis': V((0, 0.02, 1.66)), 'waist': V((0, 0.04, 1.9)), 'chest': V((0, 0.0, 2.26)), 'upchest': V((0, 0.03, 2.48)),
     'neck': V((0, -0.04, 2.7)), 'head': V((0, -0.22, 2.9)), 'crown': V((0, -0.22, 3.08))}
# the legs are built by athlete() but folded away inside the tail's root, carrying nothing
mirrored(J, {'shoulder': (0.56, 0.03, 2.48), 'elbow': (0.82, 0.1, 1.99), 'wrist': (0.92, -0.08, 1.56), 'knuckle': (0.95, -0.14, 1.41),
             'hip': (0.07, 0.02, 1.6), 'knee': (0.07, 0.03, 1.46), 'ankle': (0.06, 0.04, 1.34), 'toe': (0.06, -0.02, 1.3)})
H = J['head']

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

def qe(axis, ang):
    return tuple(Quaternion(V(axis).normalized(), ang).to_euler('XYZ'))

def sect_blade(name, spine, edge, side, thick, ridge=0.45):
    """A forged blade from its spine line and its edge line: a diamond section, a ridge down the
    flat, the edge a single hard line."""
    bm = bmesh.new(); rings = []
    n = len(spine)
    for i, (s, e) in enumerate(zip(spine, edge)):
        k = thick * (1 - (i / (n - 1)) ** 3 * 0.8)
        r = s.lerp(e, ridge)
        rings.append([bm.verts.new(e), bm.verts.new(r + side * k * 0.85), bm.verts.new(s + side * k * 0.5),
                      bm.verts.new(s - side * k * 0.5), bm.verts.new(r - side * k * 0.85)])
    for a, b in zip(rings, rings[1:]):
        for j in range(5):
            bm.faces.new((a[j], a[(j + 1) % 5], b[(j + 1) % 5], b[j]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return sharp(mesh_from_bm(name, bm), 30)

# ── the tail: an S laid across the floor. Down from the girdle, out to the left and forward, back
# across to the right behind, and the last third lifted and curling up to a barb. ──
TPc = [V((0, 0.04, 1.76)), V((0, 0.08, 1.4)), V((-0.02, 0.04, 1.0)), V((-0.1, -0.1, 0.66)), V((-0.3, -0.34, 0.35)),
       V((-0.62, -0.44, 0.31)), V((-0.95, -0.3, 0.3)), V((-1.02, 0.04, 0.3)), V((-0.78, 0.32, 0.29)),
       V((-0.38, 0.44, 0.28)), V((0.06, 0.46, 0.26)), V((0.5, 0.44, 0.24)), V((0.88, 0.36, 0.3)),
       V((1.14, 0.18, 0.62)), V((1.2, -0.04, 1.02)), V((1.06, -0.16, 1.4)), V((0.82, -0.18, 1.62))]
TRc = [0.22, 0.25, 0.27, 0.285, 0.29, 0.285, 0.275, 0.26, 0.245, 0.23, 0.215, 0.195, 0.17, 0.14, 0.105, 0.065, 0.02]
NP = 160
TP = crs(TPc, NP)
TR = lin(TRc, NP)
FR = frames(TP)
ci = lambda k: TPc[k]

# the rig: 'lift' lies along the floor under the rising column, so turning it rears the whole body;
# 'rise0/1' are the column the hips hang off; the rest of the S is a chain out to the tip
J['ta'], J['tb'], J['tc'] = ci(4), ci(3), ci(2)
for i, k in enumerate((4, 6, 8, 10, 12, 14, 16)):
    J[f'c{i}'] = ci(k)
TAILB = [('lift', 'ta', 'tb', None), ('rise0', 'tb', 'tc', 'lift'), ('rise1', 'tc', 'pelvis', 'rise0')]
TAILB += [(f'coil{i}', f'c{i}', f'c{i + 1}', 'lift' if i == 0 else f'coil{i - 1}') for i in range(6)]
TAIL = {b for b, *_ in TAILB} | {'hips'}
LIFT_AX = (J['tb'] - J['ta']).cross(V((0, 0, 1))).normalized()

J['jaw0'], J['jaw1'] = H + V((0, 0.02, -0.08)), H + V((0, -0.34, -0.2))
BONES = TAILB + [(b, h, t, 'rise1' if b == 'hips' else p) for b, h, t, p in human_bones()]
BONES += [('jaw', 'jaw0', 'jaw1', 'head')]

def drop_legs(obs):
    for o in [o for o in obs if o.get('muscle') and o['muscle'].split('.')[0] in LEGS]:
        obs.remove(o); bpy.data.objects.remove(o)

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.22, waist=1.0, extra=drop_legs)
K = 1.15
M = lambda pts: [H + V(p) * K for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

# ── the helm: a serpent's skull in iron. A long narrow muzzle, hollow sockets, a hinged lower jaw
# that hangs open, and a row of iron teeth in both. ──
def build_helm():
    P = {}
    P['helm'] = hull('helm', M(both([(0.0, 0.14, 0.08), (0.11, 0.1, 0.02), (0.145, 0.0, -0.02), (0.13, -0.1, 0.03), (0.0, -0.13, 0.12),
                                      (0.075, -0.26, 0.015), (0.04, -0.4, -0.02), (0.0, -0.44, -0.01), (0.0, -0.3, 0.07),
                                      (0.12, -0.04, -0.08), (0.06, -0.3, -0.07), (0.0, -0.36, -0.07), (0.085, 0.1, -0.08), (0.0, 0.13, -0.05)])), bevel=0.003)
    P['browridge'] = hull('browridge', M(both([(0.0, -0.1, 0.13), (0.09, -0.08, 0.11), (0.155, -0.02, 0.02), (0.15, 0.04, 0.0),
                                                (0.0, 0.02, 0.15), (0.1, -0.16, 0.06), (0.0, -0.2, 0.1)])), bevel=0.003)
    P['jaw'] = hull('jaw', M(both([(0.125, 0.04, -0.085), (0.105, -0.02, -0.135), (0.06, -0.3, -0.175), (0.0, -0.4, -0.185),
                                    (0.0, -0.36, -0.13), (0.065, -0.24, -0.12), (0.1, -0.06, -0.095), (0.0, 0.0, -0.1)])), bevel=0.003)
    for s, n in SIDES:
        # the cheek: a riveted plate down the side of the muzzle, and a swept spur off the jaw hinge
        P['cheek.' + n] = hull('cheek.' + n, M([(s * 0.13, -0.02, -0.02), (s * 0.145, 0.04, -0.03), (s * 0.08, -0.26, -0.03),
                                                 (s * 0.09, -0.2, -0.08), (s * 0.135, -0.04, -0.09), (s * 0.12, 0.06, -0.08)]), bevel=0.002)
        P['hinge.' + n] = blade('hinge.' + n, H + V((s * 0.135, 0.06, -0.04)) * K, H + V((s * 0.26, 0.28, -0.14)) * K, 0.04, thick=0.4)
        # iron teeth, upper and lower, running the length of the long muzzle
        up = [spike('t', H + V((s * (0.06 + 0.02 * (i < 2)), -0.1 - 0.075 * i, -0.075)) * K, H + V((s * (0.06 + 0.02 * (i < 2)), -0.1 - 0.075 * i, -0.15 - 0.03 * (i == 0))) * K, 0.013, n=5, sub=1) for i in range(4)]
        P['teeth.' + n] = join(up, 'teeth.' + n)
        lo = [spike('lt', H + V((s * 0.06, -0.12 - 0.075 * i, -0.135)) * K, H + V((s * 0.06, -0.12 - 0.075 * i, -0.075)) * K, 0.012, n=5, sub=1) for i in range(4)]
        P['lteeth.' + n] = join(lo, 'lteeth.' + n)
    return P

# ── the mane: iron spines, longest at the nape, running down the spine and on down the tail ──
def build_mane():
    P = {}
    sp = []
    nape = [H + V((0, 0.14, 0.05)) * K, J['neck'] + V((0, 0.12, 0.0)), J['upchest'] + V((0, 0.2, 0.0)),
            J['chest'] + V((0, 0.22, -0.02)), J['waist'] + V((0, 0.21, 0)), J['pelvis'] + V((0, 0.2, 0))]
    path = crs(nape, 12)
    for i, p in enumerate(path):
        u = i / (len(path) - 1)
        L = 0.34 * (1 - u) ** 0.7 + 0.12
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        out = V((0, 0.55, 0.83)) if u < 0.5 else V((0, 0.8, 0.6))
        out = (out - d * out.dot(d)).normalized()
        sp.append(blade(f'mane{i}', p - out * 0.06, p + out * L + V((0, 0.07, 0)), 0.075 - 0.03 * u, curve=V((0, 0.05, -0.02)), thick=0.26, power=0.75))
    P['mane'] = join(sp, 'mane')
    return P

# ── the tail's sheath: overlapping riveted iron rings, each shingled over the next, thinning to a barb ──
def build_tail():
    P = {}
    P['tailcore'] = tube('tailcore', TP[::4] + [TP[-1]], [r * 0.92 for r in TR[::4]] + [TR[-1] * 0.92], flat=0.9, sub=1)
    segs, rivets, spines = [], [], []
    i, idx = 2, 0
    while i < NP - 3:
        p, t, d, sd = FR[i]
        r = TR[i]
        L = max(0.1, 0.72 * r)
        step = max(3, int(L / 0.022))
        k = min(NP - 2, i + step)
        q = FR[k][0]
        # the ring: a flared band, wide at its front lip where it laps over the one ahead
        segs.append(tube(f'ring{idx}', [p - t * L * 0.3, p - t * L * 0.06, p.lerp(q, 0.55), q + t * L * 0.08], [r * 1.02, r * 1.16, r * 1.08, r * 0.98], flat=0.93, sub=1))
        sharp(segs[-1], 18)   # forged in flat facets, not a rounded hose
        if idx % 2 == 0:   # rivets round the lip (bake detail: they survive into the high mesh only)
            for a in range(8):
                ang = a / 8 * math.tau + idx * 0.3
                nrm = d * math.cos(ang) + sd * math.sin(ang)
                rivets.append(orb('rv', p - t * L * 0.12 + nrm * (r * 1.13), (0.016, 0.016, 0.012), seg=(8, 5)))
        if r > 0.07:   # the mane carries on down the tail's ridge: a blade on the crest of every ring
            b = p + d * (r * 1.08)
            spines.append(blade(f'tspine{idx}', b - d * 0.05, b + d * (0.1 + 0.55 * r) - t * 0.05, 0.05 + 0.2 * r, thick=0.26, power=0.75))
        i = k; idx += 1
    P['rings'] = join(segs, 'rings')
    P['rings']['detail'] = join(rivets, 'ring_rivets').name
    P['tspines'] = sharp(join(spines, 'tspines'), 35)
    p, t, d, sd = FR[-1]
    P['barb'] = blade('barb', TP[-6], TP[-1] + t * 0.3, 0.07, curve=d * 0.04, thick=0.3)
    P['barbfin'] = join([blade('bf', TP[-10] + sd * s * 0.02, TP[-10] + sd * s * 0.2 - t * 0.1, 0.045, thick=0.3) for s in (1, -1)], 'barbfin')
    return P

def khopesh(P, s, n, g, fwd, up, side):
    """A khopesh: a straight grip and forte, then the blade turning out into a sickle whose outer
    edge does the cutting, with a hooked beak at the tip."""
    tag = '.' + n
    bot = g - up * 0.2
    P['hilt' + tag] = sect_blade('hilt' + tag, [bot + up * z for z in (0.0, 0.18, 0.42)], [bot + up * z + fwd * 0.045 for z in (0.0, 0.18, 0.42)], side, 0.02)
    P['pommel' + tag] = hull('pommel' + tag, [bot - up * 0.05 + fwd * y + side * x for x in (-0.035, 0.035) for y in (-0.05, 0.05)] + [bot - up * 0.11], bevel=0.004)
    P['grip' + tag] = join([ring(f'gr{i}', bot + up * (0.03 + i * 0.028), 0.033, 0.008, rot=up.to_track_quat('Z', 'Y').to_euler(), seg=(16, 6)) for i in range(6)], 'grip' + tag)
    P['guard' + tag] = hull('guard' + tag, [bot + up * 0.22 + fwd * y + side * x for x in (-0.055, 0.055) for y in (-0.07, 0.09)] +
                            [bot + up * 0.26 + fwd * y for y in (-0.05, 0.07)], bevel=0.004)
    spine, edge = [], []
    N = 15
    c = bot + up * 0.44                     # where the sickle starts to turn
    for i in range(N + 1):
        f = i / N
        a = 2.15 * f ** 1.08                # the curve, turning forward and round until it hooks back
        R = 0.42
        dirn = up * math.cos(a) + fwd * math.sin(a)
        nrm = -up * math.sin(a) + fwd * math.cos(a)
        w = 0.15 * (0.42 + 0.58 * math.sin(math.pi * min(1, f * 1.15))) * (1 - 0.3 * f ** 3)
        sp = c + (up * math.sin(a) - fwd * (math.cos(a) - 1)) * R * 1.0
        spine.append(sp)
        edge.append(sp + nrm * w)
    d = (spine[-1] - spine[-2]).normalized()
    P['blade' + tag] = sect_blade('blade' + tag, spine, edge, side, 0.019)
    P['beak' + tag] = blade('beak' + tag, spine[-1] - d * 0.04, spine[-1] + d * 0.1 + (edge[-1] - spine[-1]).normalized() * 0.1, 0.035, thick=0.3)
    return edge

def build_gear():
    P = {'hands': hands}
    P.update(build_helm())
    P.update(build_mane())
    P.update(build_tail())
    muscle_plates(P, src, FIELDS, skip=LEGS, scale=1.25)
    edges = {}
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.12 and p.y > el.y - 0.02, push=0.045, thick=0.018, smooth=4, facets=0.0, rim=0.013, rivets=0.05, bead=True)
        P['cspike.' + n] = blade('cspike.' + n, el + V((s * 0.02, 0.02, 0.0)), el + V((s * 0.06, 0.3, 0.02)), 0.045, thick=0.4)
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        # heavy pauldrons: a cap of shingled lames over each shoulder, every one spiked at its edge
        P.update(lames(shell, 'pauld.' + n + '.', lambda p, sh=sh, s=s: (p - sh).length < 0.3 and p.z > sh.z - 0.16 and s * p.x > abs(sh.x) * 0.3,
                       sh + V((0, 0, 0.12)), sh + V((s * 0.26, 0, -0.2)), 3, 0.0, 1.0, push=0.035, step=0.014, thick=0.02, rim=0.012, rivets=0.06, bead=True))
        for i in range(3):
            b = sh + V((s * (0.14 + i * 0.07), -0.1 + i * 0.1, 0.1 - i * 0.07))
            P[f'pspike{i}.' + n] = blade(f'pspike{i}.' + n, b, b + V((s * 0.12, 0.12, 0.1)), 0.035, thick=0.4)
        d = (kn - wr).normalized()
        for i in range(4):
            off = V((0, -0.065 + i * 0.13 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.09 + V((0, -0.07, -0.03)), 0.016, curve=V((0, -0.02, 0)), thick=0.6)
        g = J['wrist.' + n].lerp(J['knuckle.' + n], 0.6)
        up = V((s * 0.12, -0.1, 1.0)).normalized()
        fwd = (V((0, -1, 0)) - up * V((0, -1, 0)).dot(up)).normalized()
        edges[n] = khopesh(P, s, n, g, fwd, up, up.cross(fwd).normalized() * s)
    # the girdle: a heavy riveted band where the man ends and the serpent begins
    P['belt'] = plate(shell, 'belt', lambda p: 1.68 < p.z < 1.82 and abs(p.x) < 0.45, push=0.07, thick=0.026, smooth=3, facets=0.1, rim=0.012, rivets=0.05)
    fl = []
    for k in range(14):
        a = k / 14 * math.tau + 0.11
        o, tg = V((math.sin(a), -math.cos(a) * 0.95, 0)), V((math.cos(a), math.sin(a) * 0.95, 0))
        top, tip = V((0, 0.04, 1.76)) + o * 0.25, V((0, 0.04, 1.46)) + o * 0.3
        w = 0.08
        fl.append(hull('fauld', [top + tg * w, top - tg * w, top + o * 0.025 + tg * w, top + o * 0.025 - tg * w,
                                 top.lerp(tip, 0.55) + tg * w * 0.85 + o * 0.035, top.lerp(tip, 0.55) - tg * w * 0.85 + o * 0.035,
                                 tip + o * 0.025, tip], bevel=0.002))
    P['fauld'] = join(fl, 'fauld')
    return P, edges

gear, EDGES = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:   # the sockets of the skull burn
        ob = orb('eye.' + n, H + V((s * 0.11, -0.11, 0.01)) * K, (0.05, 0.028, 0.026), rot=(0, s * 0.3, s * -0.3))
        sit_on(ob, gear['helm'], gap=-0.004); eyes.append(ob)
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    # the furnace behind the teeth, seen down the length of the open muzzle
    g['maw'] = (hull('maw', M(both([(0.055, -0.08, -0.1), (0.04, -0.36, -0.12), (0.025, -0.34, -0.145), (0.05, -0.08, -0.125)])), bevel=0), 'head')
    for n in ('L', 'R'):
        g['edge.' + n] = (tube('edge.' + n, EDGES[n], [0.005] * len(EDGES[n]), sub=1), 'hand.' + n)
    # the rings glow white-hot in the gaps between them, at the root of the tail
    seams = []
    for k in (14, 30):
        p, t, d, sd = FR[k]
        seams.append(ring(f'seam{k}', p, TR[k] * 0.84, 0.008, rot=t.to_track_quat('Z', 'Y').to_euler(), seg=(20, 6), flat=0.5))
    g['seams'] = (join(seams, 'seams'), 'rise0')
    return g
glow = build_glow()

PAINTED = ('pauld', 'couter', 'm.sidedelt')
SWORD = ('hilt', 'blade', 'beak', 'guard', 'pommel')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm', 'browridge') or name.startswith(('cheek', 'hinge')): return 'helm', ('rigid', 'head')
    if name == 'jaw': return 'helm', ('rigid', 'jaw')
    if name.startswith('lteeth'): return 'bone', ('rigid', 'jaw')
    if name.startswith('teeth'): return 'bone', ('rigid', 'head')
    if name == 'mane': return 'iron', ('smooth', {'head', 'neck', 'chest', 'spine', 'hips'})
    if name == 'tailcore': return 'mail', ('smooth', TAIL)
    if name in ('rings', 'tspines'): return 'iron', ('smooth', TAIL)
    if name.startswith('barb'): return 'iron', ('rigid', 'coil5')
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'fauld': return 'iron', ('smooth', {'hips', 'rise1'})
    if name.startswith('pauld'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('pspike'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith(('couter', 'cspike')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('talon'): return 'bone', ('rigid', 'hand.' + side)
    if name.startswith('grip'): return 'leather', ('rigid', 'hand.' + side)
    if name.startswith(SWORD): return 'iron', ('rigid', 'hand.' + side)
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 6000
    if name == 'hands': return 2200
    if name == 'rings': return 11000
    if name == 'tailcore': return 2600
    if name == 'tspines': return 2000
    if name == 'mane': return 2600
    if name in ('helm', 'jaw', 'browridge'): return 900
    if name.startswith('m.'): return plate_tris(name)
    if name == 'fauld': return 1400
    if name.startswith('blade'): return 700
    if name.startswith(('pauld', 'couter', 'belt', 'cheek')): return 500
    if name.startswith('grip'): return 500
    return min(tris, 300)

def uv_weight(name):
    if name in ('helm', 'jaw', 'browridge') or name.startswith(('cheek', 'teeth', 'blade')): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name.startswith('pauld'): return 2.0
    if name in ('rings', 'tailcore', 'tspines'): return 0.6
    if name == 'body_high': return 0.5
    return 1.0

MATS, FLAT = knight_mats(accent=IVORY, steel=(0.03, 0.028, 0.026), paint=(0.05, 0.042, 0.03), leather=(0.03, 0.022, 0.014),
                         bone=(0.3, 0.27, 0.2),
                         cloth=[(0.0, (0.05, 0.042, 0.03)), (0.4, (0.02, 0.017, 0.013)), (1.0, (0.012, 0.011, 0.01))])
# raw iron: darker and rougher than the war-plate, rusted in the recesses of the rings
MATS['iron'] = mat_steel('iron', base=(0.022, 0.02, 0.018), bare=(0.22, 0.2, 0.19), rough=0.58, dents=1.6, wear=0.7)
FLAT['iron'] = (0.035, 0.032, 0.028, 0.5, 1)

def idle(t):
    T = 4.0
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.8)
    p['rise0'] = (0.02 * c, 0.04 * s, 0)
    p['rise1'] = (-0.02 * c, -0.025 * s, 0.03 * s)
    p['head'] = (p['head'][0], -0.02 * s, p['head'][2] * 0.5)
    p['jaw'] = (0.1 + 0.04 * s, 0, 0)
    for i in range(6):   # the S shifts along itself, the raised tip swinging slowly
        p[f'coil{i}'] = (0, 0, 0.05 * (i + 1) / 6 * math.sin(TAU * t / T - i * 0.7))
    p['upperarm.L'] = (0.04 * s, -0.16, 0); p['upperarm.R'] = (0.04 * s, 0.16, 0)   # the blades held out wide
    p['forearm.L'] = (-0.3, 0, 0); p['forearm.R'] = (-0.3, 0, 0)
    return p

def roar(t):
    p = roar_pose(t, idle)
    a, b = p['_a'], p['_b']
    p['jaw'] = (0.1 + 0.3 * a + 0.8 * b, 0, 0)
    p['lift'] = qe(LIFT_AX, 0.22 * b)
    p['rise0'] = tuple(x + y for x, y in zip(p.get('rise0', (0, 0, 0)), qe(LIFT_AX, -0.22 * b)))
    return p

def attack(t):
    # "Reaping Coil": it winds up, both blades drawn across to the right, then whirls: the torso
    # spins left, the khopeshes sweeping round one after the other, the tail lashing after them
    w = ease(t / 0.7) * (1 - ease((t - 0.85) / 0.15))                       # the wind-up
    a = ease((t - 0.85) / 0.16) * (1 - ease((t - 1.45) / 0.35))             # the first blade round
    b = ease((t - 1.25) / 0.18) * (1 - ease((t - 1.9) / 0.5))               # the second, following it
    rec = ease((t - 1.9) / 0.9)
    k = max(w, a, b) * (1 - rec)
    p = fade_idle(idle(t), 1 - k)
    p = posed(p, hips=(0, 0, -0.5 * w + 0.85 * (a + 0.4 * b)), spine=(0.06 * w + 0.12 * a, 0, -0.35 * w + 0.6 * a + 0.2 * b),
              chest=(0.05 * a, 0, -0.3 * w + 0.55 * a + 0.3 * b), neck=(0, 0, -0.15 * w + 0.3 * a),
              head=(0.1 * w - 0.05 * a, 0, -0.3 * w + 0.5 * a + 0.2 * b), jaw=(0.1 + 0.5 * max(a, b), 0, 0),
              upperarm_R=(-0.3 * w - 0.2 * a, 0.9 * w - 1.5 * a, 0), forearm_R=(-1.3 * w - 0.2 * a, 0, 0), hand_R=(0, 0, 0.4 * a),
              upperarm_L=(-0.2 * w - 0.3 * b, -0.4 * w + 1.4 * b, 0), forearm_L=(-0.5 * w - 1.5 * b, 0, 0), hand_L=(0, 0, -0.4 * b),
              rise0=(0, 0, -0.2 * w + 0.35 * a), rise1=(0, 0, -0.15 * w + 0.3 * a))
    for i in range(6):   # the lash runs out along the tail behind the blades
        f = ease((t - 1.0 - i * 0.07) / 0.22) * (1 - ease((t - 1.6 - i * 0.07) / 0.5))
        p[f'coil{i}'] = (0, 0, p.get(f'coil{i}', (0, 0, 0))[2] - 0.22 * w + 0.4 * f)
    p['_hips_loc'] = (0, 0, -0.05 * max(a, b))
    return p

parts = {'body_high': body, **gear}
for k in [k for k, v in parts.items() if v is None or not v.data.polygons]:
    print('empty part dropped:', k, flush=True); parts.pop(k)
finish('IronSerpent', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, IVORY,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
