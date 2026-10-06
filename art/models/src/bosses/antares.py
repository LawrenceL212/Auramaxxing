# Antares the Sovereign Beast (S-rank gate): a demon knight in black war-plate edged in burning red.
# Read from its shadow alone: a burning halo behind a horned helm, ram's horns curling up off it,
# great spiked pauldrons, wings held high to spiked points, a halberd with a torn banner, a cloak
# torn to the floor and a tail. Every piece grows from what is under it: the plate is lifted off the
# body, the horns rise out of the helm, the wings out of ridges of muscle on the shoulder blades.
# Its attack: the halberd raised overhead and driven into the ground.
#   python3.11 antares.py --bake --out ../../antares.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(53)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'antares.glb'))

J = {'pelvis': V((0, 0.02, 1.36)), 'waist': V((0, 0.03, 1.62)), 'chest': V((0, 0.0, 1.98)), 'upchest': V((0, 0.02, 2.2)),
     'neck': V((0, -0.03, 2.38)), 'head': V((0, -0.06, 2.56)), 'crown': V((0, -0.05, 2.76))}
mirrored(J, {'shoulder': (0.52, 0.03, 2.2), 'elbow': (0.76, 0.1, 1.72), 'wrist': (0.86, -0.06, 1.28), 'knuckle': (0.89, -0.12, 1.12),
             'hip': (0.19, 0.02, 1.32), 'knee': (0.26, -0.07, 0.74), 'ankle': (0.28, 0.08, 0.14), 'toe': (0.31, -0.24, 0.04),
             'wroot': (0.2, 0.3, 2.24), 'welbow': (0.72, 0.56, 2.95), 'wwrist': (1.1, 0.7, 3.5)})
H = J['head']
K = 1.3   # the helm is big on purpose: it has to read from across the arena

TP = [V((0, 0.2, 1.32)), V((0, 0.5, 1.08)), V((0.08, 0.86, 0.7)), V((0.26, 1.2, 0.34)), V((0.56, 1.42, 0.14)), V((0.92, 1.46, 0.08)), V((1.24, 1.28, 0.1)), V((1.4, 1.0, 0.14))]
TR = [0.13, 0.11, 0.09, 0.07, 0.055, 0.04, 0.025, 0.006]
for i, k in enumerate((0, 2, 4, 6, 7)):
    J[f't{i}'] = TP[k]
BONES = human_bones()
BONES += [(f'tail{i}', f't{i}', f't{i + 1}', 'hips' if i == 0 else f'tail{i - 1}') for i in range(4)]
for n in ('L', 'R'):
    BONES += [('wing.' + n, 'wroot.' + n, 'welbow.' + n, 'chest'), ('wingtip.' + n, 'welbow.' + n, 'wwrist.' + n, 'wing.' + n)]

# ── the body under the plate: athletic, carved into hard planes ──
def build_body():
    obs, hands = athlete(J, mass=1.1, hands='claw', cut=1)
    for s, n in SIDES:   # the wing roots: a ridge of muscle on each shoulder blade the wing arm grows out of
        obs.append(muscle(V((s * 0.08, 0.2, 1.96)), J['wroot.' + n] + V((s * 0.04, 0.02, 0.06)), 0.1, seg=(8, 5)))
    body = remesh(obs, 'body_high', voxel=0.009, smooth=2, factor=0.6)
    define(body, 1.8, 3)
    sm = body.modifiers.new('sm', 'SMOOTH'); sm.iterations = 2; sm.factor = 0.5; apply_mods(body)
    chisel(body, 3, 32, 0.3)
    return body, hands

M = lambda pts: [H + V(p) * K for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def build_helm():
    # a closed helm, all planes: a faceplate that narrows to a point at the chin, a keel down its middle,
    # flared cheek guards swept back to blades. The face is the burning slit across it (see build_glow)
    parts = [hull('helmshell', M(both([(0.0, 0.0, 0.17), (0.08, 0.02, 0.15), (0.1, -0.12, 0.07), (0.0, -0.15, 0.09),
                                        (0.12, -0.08, -0.02), (0.0, -0.13, -0.18), (0.05, -0.1, -0.13), (0.1, 0.1, 0.05),
                                        (0.0, 0.14, 0.0), (0.07, 0.1, -0.1), (0.09, -0.02, -0.11)]))),
             hull('keel', M(both([(0.012, -0.16, 0.08), (0.0, -0.172, 0.0), (0.012, -0.15, -0.1), (0.0, 0.02, 0.2), (0.01, -0.09, 0.17)])))]
    for s, n in SIDES:
        parts.append(hull('cheekguard.' + n, M([(s * 0.1, -0.12, 0.0), (s * 0.13, -0.06, 0.02), (s * 0.12, -0.08, -0.1),
                                                 (s * 0.2, 0.12, -0.08), (s * 0.1, -0.02, -0.12)])))
        parts.append(blade('cheekspike.' + n, H + V((s * 0.14, 0.0, -0.06)) * K, H + V((s * 0.26, 0.2, -0.16)) * K, 0.03, thick=0.4))
    return join(parts, 'helm')

body, hands = build_body()
helm = build_helm()

def wing(s, n):
    # a demon's wing held high: an arm of bone, four fingers fanning up and out to spiked points, the
    # membrane between them sagging, torn and holed
    rnd = random.Random(7 + s)
    root, elbow, wrist = J['wroot.' + n], J['welbow.' + n], J['wwrist.' + n]
    tips = [V((s * 1.45, 0.8, 4.25)), V((s * 2.0, 0.88, 3.45)), V((s * 2.0, 0.92, 2.45)), V((s * 1.55, 0.9, 1.45))]
    parts = [tube('warm', [root, root.lerp(elbow, 0.5) + V((0, 0, 0.06)), elbow, wrist], [0.07, 0.058, 0.046, 0.036])]
    fingers = []
    for i, tp in enumerate(tips):
        mid = wrist.lerp(tp, 0.5) + V((0, 0.05, 0.06 if i < 2 else 0.0))
        parts.append(tube(f'wf{i}', [wrist, mid, tp], [0.034, 0.022, 0.008]))
        d = (tp - mid).normalized()
        parts.append(blade(f'wtip{i}', tp - d * 0.04, tp + d * (0.3 if i == 0 else 0.2), 0.035, thick=0.4))   # a spike at each fingertip
        fingers.append([wrist.lerp(mid, k / 3) for k in range(3)] + [mid.lerp(tp, k / 3) for k in range(4)])
    body_edge = [root.lerp(V((s * 0.32, 0.42, 1.45)), k / 6) for k in range(7)]
    bm = bmesh.new(); nseg = 9
    for fa, fb in list(zip(fingers, fingers[1:])) + [(fingers[-1], body_edge)]:
        rows = []
        for j in range(len(fa)):
            row = []
            for k in range(nseg + 1):
                u = k / nseg
                p = fa[j].lerp(fb[j], u)
                sag = math.sin(u * math.pi) * (j / (len(fa) - 1)) ** 1.3 * 0.3
                p = p + (wrist - p).normalized() * sag + V((0, 0.07 * math.sin(u * math.pi), 0))
                if j == len(fa) - 1 and 0 < k < nseg:   # a ragged trailing edge
                    p = p + (wrist - p).normalized() * rnd.uniform(0.0, 0.14)
                row.append(bm.verts.new(p))
            rows.append(row)
        for j in range(len(rows) - 1):
            for k in range(nseg):
                if j >= 3 and rnd.random() < 0.07:   # holes torn through the membrane
                    continue
                bm.faces.new((rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]))
    mem = mesh_from_bm('membrane.' + n, bm)
    so = mem.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.01; so.offset = 0
    apply_mods(mem); smooth_shade(mem)
    parts.append(blade('wclaw', wrist + V((0, -0.02, 0.03)), wrist + V((s * 0.06, -0.08, 0.32)), 0.045, curve=V((0, -0.06, 0)), thick=0.5))
    parts.append(blade('wthorn', elbow + V((0, 0, 0.03)), elbow + V((s * 0.08, 0.04, 0.28)), 0.04, curve=V((0, 0.04, 0)), thick=0.5))
    return join(parts, 'wingbone.' + n), mem

def build_gear():
    P = {'hands': hands, 'helm': helm}
    for s, n in SIDES:
        P['wingbone.' + n], P['membrane.' + n] = wing(s, n)
        P['wingbone.' + n].name = 'wingbone.' + n
        # ram's horns: out of the helm's temple, up, then curling back in over the crown
        P['horn.' + n] = sharp(tube('horn.' + n, M([V(p) * 0.85 for p in [(s * 0.08, 0.0, 0.1), (s * 0.2, 0.03, 0.14), (s * 0.33, 0.06, 0.26), (s * 0.38, 0.08, 0.46), (s * 0.34, 0.07, 0.64),
                                                    (s * 0.25, 0.02, 0.72), (s * 0.18, -0.06, 0.68), (s * 0.16, -0.12, 0.6)]]),
                                     [r * K for r in (0.052, 0.05, 0.044, 0.036, 0.027, 0.018, 0.01, 0.003)], flat=1.25, sub=0), 25)
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an, to = J['hip.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        # pauldrons: two lames grown over the deltoid, great spikes raking up and out off the top
        c0 = sh + V((s * 0.05, 0, 0.03))
        P['pauldron0.' + n] = plate(body, 'pauldron0.' + n, lambda p, c0=c0, s=s: s * p.x > 0.3 and (p - c0).length < 0.26 and p.z > c0.z - 0.22, push=0.05, thick=0.04, smooth=2, facets=0.4)
        P['pauldron1.' + n] = plate(body, 'pauldron1.' + n, lambda p, c0=c0, s=s: s * p.x > 0.36 and (p - c0).length < 0.18 and p.z > c0.z - 0.04, push=0.11, thick=0.04, smooth=2, facets=0.45)
        P['pthorns.' + n] = thorns(P['pauldron1.' + n], 'pthorns.' + n, lambda c: c.z > sh.z + 0.02, 4, 0.66, 0.08, up=1.6, back=0.2, curve=0.25, seed=3 + s, flat=0.5)
        P['pthorns2.' + n] = thorns(P['pauldron0.' + n], 'pthorns2.' + n, lambda c, s=s: s * c.x > abs(sh.x) + 0.12, 4, 0.34, 0.045, up=0.5, back=0.2, seed=9 + s)
        # couter: a spike thrown back off the elbow; vambrace with a row of thorns down the outer edge
        P['couter.' + n] = blade('couter.' + n, el + V((s * 0.02, 0.0, 0.02)), el + V((s * 0.08, 0.32, 0.06)), 0.05, curve=V((0, 0, 0.05)), thick=0.45)
        P['vambrace.' + n] = plate(body, 'vambrace.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.4 and near_seg(p, el, wr, 0.15, 1.0, 0.16), push=0.035, thick=0.03, smooth=2, facets=0.4)
        P['vthorns.' + n] = thorns(P['vambrace.' + n], 'vthorns.' + n, lambda c, s=s: s * c.x > abs(el.x) + 0.02 and c.y > -0.02, 4, 0.24, 0.035, up=0.5, back=0.7, seed=5 + s)
        P['rerebrace.' + n] = plate(body, 'rerebrace.' + n, lambda p, sh=sh, el=el, s=s: s * p.x > 0.4 and near_seg(p, sh, el, 0.4, 0.92, 0.16), push=0.03, thick=0.03, smooth=2, facets=0.45)
        # legs: cuisse, knee cop with its spike, greave, sabaton
        P['cuisse.' + n] = plate(body, 'cuisse.' + n, lambda p, hp=hp, ke=ke, s=s: s * p.x > 0.04 and near_seg(p, hp, ke, 0.2, 0.9, 0.2) and p.y < ke.y + 0.06, push=0.035, thick=0.03, smooth=2, facets=0.4)
        P['kneecop.' + n] = plate(body, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.13 and p.y < ke.y, push=0.07, thick=0.035, smooth=2, facets=0.5)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.12, 0.02)), ke + V((s * 0.04, -0.34, 0.22)), 0.05, curve=V((0, 0, 0.04)), thick=0.5)
        P['greave.' + n] = plate(body, 'greave.' + n, lambda p, ke=ke, an=an, s=s: near_seg(p, ke, an, 0.1, 0.95, 0.15), push=0.035, thick=0.03, smooth=2, facets=0.4)
        P['gthorns.' + n] = thorns(P['greave.' + n], 'gthorns.' + n, lambda c, s=s, ke=ke: s * c.x > abs(ke.x) + 0.04 and c.z < ke.z - 0.15, 3, 0.2, 0.03, up=0.4, back=0.5, seed=13 + s)
        P['sabaton.' + n] = plate(body, 'sabaton.' + n, lambda p, an=an: p.z < an.z + 0.05 and abs(p.x - an.x) < 0.14, push=0.03, thick=0.03, smooth=2, facets=0.5)
        for i in range(3):   # talons out of the sabaton's toe
            b = to + V((s * (0.04 - i * 0.04), -0.04, 0.0))
            P[f'toeclaw{i}.' + n] = blade(f'toeclaw{i}.' + n, b, b + V((0, -0.14, -0.04)), 0.024, curve=V((0, 0, 0.02)), thick=0.6)
        d = (kn - wr).normalized()
        for i in range(4):   # gauntlet talons
            off = V((0, -0.065 + i * 0.13 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.1 + V((0, -0.08, -0.03)), 0.016, curve=V((0, -0.02, 0)), thick=0.6)
    # the cuirass: breastplate and backplate lifted off the chest, a keel down the sternum
    P['cuirass'] = plate(body, 'cuirass', lambda p: 1.82 < p.z < 2.34 and abs(p.x) < 0.4 and (p.z < 2.28 or abs(p.x) > 0.13), push=0.05, thick=0.04, smooth=2, facets=0.45)
    P['sternum'] = hull('sternum', [V((x, -0.33, z)) for x in (-0.03, 0.03) for z in (1.86, 2.18)] + [V((0, -0.37, 2.0)), V((0, -0.3, 2.26)), V((0, -0.3, 1.8))])
    # the fauld: three overlapping lames down the belly
    for i, (z0, z1) in enumerate(((1.71, 1.82), (1.6, 1.71), (1.5, 1.61))):
        P[f'fauld{i}'] = plate(body, f'fauld{i}', lambda p, z0=z0, z1=z1: z0 < p.z < z1 and abs(p.x) < 0.34, push=0.04 + 0.008 * i, thick=0.03, smooth=2, facets=0.5)
    # the belt: a heavy band, a skull for a buckle, chains slung across the hips
    P['belt'] = plate(body, 'belt', lambda p: 1.36 < p.z < 1.5, push=0.06, thick=0.035, smooth=2, facets=0.4)
    sk = lambda pts: [V((0, -0.25, 1.42)) + V(p) for p in pts] + [V((0, -0.25, 1.42)) + V((-p[0], p[1], p[2])) for p in pts if p[0]]
    P['skull'] = join([hull('skullcap', sk([(0.06, 0.02, 0.08), (0.075, -0.02, 0.0), (0.03, -0.06, 0.06), (0.0, -0.065, 0.02), (0.05, 0.03, -0.02)])),
                       hull('skulljaw', sk([(0.045, -0.02, -0.02), (0.035, -0.05, -0.07), (0.0, -0.06, -0.08), (0.04, 0.02, -0.06)])),
                       blade('skullhorn.L', V((0.05, -0.27, 1.48)), V((0.14, -0.3, 1.58)), 0.02, thick=0.6),
                       blade('skullhorn.R', V((-0.05, -0.27, 1.48)), V((-0.14, -0.3, 1.58)), 0.02, thick=0.6)], 'skull')
    links = []
    for i in range(14):
        u = i / 13
        p = V((-0.26 + u * 0.52, -0.23 - 0.03 * math.sin(u * math.pi), 1.34 - 0.16 * math.sin(u * math.pi)))
        links.append(ring(f'cl{i}', p, 0.026, 0.008, rot=(math.pi / 2, (i % 2) * math.pi / 2, 0.3), seg=(12, 6)))
    for i in range(9):   # and one hanging down the right hip
        p = V((-0.26 - 0.01 * i, -0.2 + 0.004 * i, 1.38 - 0.05 * i))
        links.append(ring(f'ch{i}', p, 0.024, 0.007, rot=((i % 2) * math.pi / 2, 0, 0), seg=(12, 6)))
    P['chain'] = join(links, 'chain')
    # the cloak: from the belt to the floor all round, black going to blood at the hem, torn into strips
    def cloak(u, t):
        a = u * math.pi * 0.92
        r = 0.28 + t * 0.42 + math.sin(u * 17 + t * 4) * 0.035 * t
        return (math.sin(a) * r, 0.04 - math.cos(a) * r * 0.82 + t * 0.12, 1.46 - t * 1.42)
    P['cloak'] = cloth('cloak', 44, 28, cloak, thick=0.014, strips=(0.4, 0.22, 11))
    # the tabard: a long crimson panel down the front, torn at the end
    P['tabard'] = cloth('tabard', 8, 22, lambda u, t: (u * (0.17 - t * 0.04), -0.29 - t * 0.06 + u * u * 0.04, 1.44 - t * 1.2), thick=0.016, strips=(0.78, 0.0, 4))
    # the tail, spined along its ridge
    P['tail'] = tube('tail', TP, TR, flat=0.85)
    for i in range(1, 7):
        b = TP[i] + V((0, 0, TR[i] * 0.85))
        dd = (TP[i + 1] - TP[i]).normalized()
        P[f'tspike{i}'] = blade(f'tspike{i}', b, b + V((0, 0, 0.16 - i * 0.018)) + dd * 0.08, 0.04 - i * 0.004, thick=0.4)
    # the halberd, in the left hand: a black haft, a long spear blade, a crescent axe each side, a banner
    g = J['wrist.L'].lerp(J['knuckle.L'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((0.02, -0.06, 1.6)), g + V((-0.02, 0.04, -1.1))
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.33) + V((0.01, 0, 0)), bot.lerp(top, 0.66) - V((0.01, 0, 0)), top], [0.024, 0.026, 0.024, 0.03], sub=1), 50)
    P['socket'] = hull('socket', [top + V((x, y, z)) for x in (-0.06, 0.06) for y in (-0.035, 0.035) for z in (-0.06, 0.14)] + [top + V((0, 0, -0.16))])
    P['spear'] = hull('spear', [top + V(p) for p in ((0, 0, 0.72), (0.075, 0, 0.3), (-0.075, 0, 0.3), (0, 0.018, 0.3), (0, -0.018, 0.3),
                                                      (0.03, 0, 0.12), (-0.03, 0, 0.12), (0, 0.014, 0.12), (0, -0.014, 0.12))])
    for s, n in SIDES:   # each crescent: an upper horn raking out and up, a lower hook out and down
        P['axeup.' + n] = blade('axeup.' + n, top + V((s * 0.05, 0, 0.1)), top + V((s * 0.3, 0, 0.5)), 0.07, curve=V((s * 0.14, 0, -0.08)), thick=0.22)
        P['axelo.' + n] = blade('axelo.' + n, top + V((s * 0.05, 0, 0.04)), top + V((s * 0.28, 0, -0.26)), 0.06, curve=V((s * 0.12, 0, 0.06)), thick=0.22)
    P['ferrule'] = blade('ferrule', bot, bot + V((0, 0, -0.22)), 0.032, thick=1.0)
    P['banner'] = cloth('banner', 6, 16, lambda u, t: (top.x + 0.06 + (u + 1) / 2 * 0.3, top.y + 0.01 + 0.02 * math.sin(u * 3 + t * 5), top.z - 0.12 - t * 0.95),
                        thick=0.01, strips=(0.7, 0.15, 5))
    return P, top

gear, TOP = build_gear()

def build_glow():
    # the face is a burning T cut through the helm; a halo burns behind it; red crosses on the tabard,
    # the banner and the halberd's socket. All recoloured by the raid
    g = {}
    slit = []
    for s, n in SIDES:
        ob = orb('slit.' + n, H + V((s * 0.05, -0.15, 0.03)) * K, (0.055, 0.012, 0.01), rot=(0, 0, s * 0.45))
        sit_on(ob, helm, gap=-0.004); slit.append(ob)
    ob = orb('slitv', H + V((0, -0.17, -0.05)) * K, (0.008, 0.01, 0.065)); sit_on(ob, helm, gap=-0.004); slit.append(ob)
    g['eyes'] = (join(slit, 'eyes'), 'head')
    hc = H + V((0, 0.26, 0.24)) * K
    halo = [ring('halo', hc, 0.5, 0.014, rot=(math.pi / 2, 0, 0), seg=(64, 6))]
    for a, L in ((0, 0.34), (math.pi, 0.16), (math.pi / 2, 0.16), (-math.pi / 2, 0.16), (math.pi / 4, 0.09), (-math.pi / 4, 0.09)):
        d = V((math.sin(a), 0, math.cos(a)))
        halo.append(blade('ray', hc + d * 0.48, hc + d * (0.5 + L), 0.022, thick=0.3, sub=0))
    g['halo'] = (join(halo, 'halo'), 'head')
    def cross(name, c, h, w, ty):
        return join([hull(name + 'v', [c + V((x, ty, z)) for x in (-0.011, 0.011) for z in (-h * 0.6, h * 0.4)] + [c + V((0, ty, -h)), c + V((0, ty, h * 0.55))], bevel=0),
                     hull(name + 'h', [c + V((x, ty, z)) for x in (-w * 0.8, w * 0.8) for z in (0.16 * h, 0.26 * h)] + [c + V((-w, ty, 0.21 * h)), c + V((w, ty, 0.21 * h))], bevel=0)], name)
    tab = cross('tabcross', V((0, -0.318, 1.02)), 0.2, 0.08, 0.0)
    so = tab.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.008; apply_mods(tab)
    g['tabcross'] = (tab, 'hips')
    ban = cross('bancross', TOP + V((0.21, 0.0, -0.45)), 0.18, 0.07, -0.02)
    so = ban.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.006; apply_mods(ban)
    g['bancross'] = (ban, 'hand.L')
    g['staforb'] = (orb('staforb', TOP + V((0, -0.04, 0.05)), (0.032, 0.02, 0.032)), 'hand.L')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'scales', ('smooth', None)
    if name == 'hands': return 'plate', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm',) or name.startswith('horn'): return ('horn' if name.startswith('horn') else 'plate'), ('rigid', 'head')
    if name.startswith('wingbone'): return 'horn', ('smooth', {'wing.' + side, 'wingtip.' + side})
    if name.startswith('membrane'): return 'membrane', ('smooth', {'wing.' + side, 'wingtip.' + side, 'chest'})
    if name.startswith(('pauldron', 'pthorns')): return 'plate', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('rerebrace'): return 'plate', ('rigid', 'upperarm.' + side)
    if name.startswith(('vambrace', 'vthorns', 'couter')): return 'plate', ('rigid', 'forearm.' + side)
    if name.startswith(('greave', 'kspike', 'kneecop', 'gthorns')): return 'plate', ('rigid', 'shin.' + side)
    if name.startswith('cuisse'): return 'plate', ('rigid', 'thigh.' + side)
    if name.startswith('sabaton'): return 'plate', ('rigid', 'foot.' + side)
    if name.startswith('toeclaw'): return 'horn', ('rigid', 'foot.' + side)
    if name.startswith('talon'): return 'horn', ('rigid', 'hand.' + side)
    if name in ('cuirass', 'sternum'): return 'plate', ('smooth', {'spine', 'chest', 'neck'})
    if name.startswith('fauld'): return 'plate', ('smooth', {'hips', 'spine'})
    if name in ('belt', 'skull', 'chain'): return ('horn' if name == 'skull' else 'plate'), ('rigid', 'hips')
    if name == 'cloak': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'tabard': return 'banner', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'banner': return 'banner', ('rigid', 'hand.L')
    if name == 'tail': return 'scales', ('smooth', {'hips', 'tail0', 'tail1', 'tail2', 'tail3'})
    if name.startswith('tspike'):
        c = parts[name].data.vertices[0].co
        return 'horn', ('rigid', min(('tail0', 'tail1', 'tail2', 'tail3'), key=lambda b: (c - J['t' + b[4:]]).length))
    if name in ('haft', 'ferrule', 'socket', 'spear') or name.startswith(('axeup', 'axelo')): return 'plate', ('rigid', 'hand.L')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 12000
    if name == 'hands': return 3000
    if name == 'helm': return 1200
    if name.startswith('membrane'): return 2400
    if name == 'cloak': return 3600
    if name.startswith('wingbone'): return 1400
    if name == 'tail': return 1400
    if name in ('cuirass',): return 2400
    if name.startswith(('pauldron', 'vambrace', 'greave', 'cuisse', 'belt', 'fauld', 'rerebrace', 'sabaton', 'kneecop')): return 700
    if name.startswith(('pthorns', 'vthorns', 'gthorns')): return 900
    if name.startswith('horn.'): return 900
    if name == 'chain': return 1600
    if name in ('banner', 'tabard'): return 900
    return min(tris, 300)

TRIM = (0.85, 0.05, 0.02)
MATS = {
    # black scale under the plate, split by molten veins
    'scales': mat_hide('scales', [(0.3, (0.012, 0.008, 0.01)), (0.6, (0.04, 0.02, 0.02)), (0.85, (0.08, 0.03, 0.03))],
                       fissure=(0.9, 0.08, 0.02), scale=46.0, big=5.0, rough=(0.5, 0.28), bump=(0.5, 0.9)),
    'membrane': mat_hide('membrane', [(0.3, (0.02, 0.006, 0.008)), (0.8, (0.12, 0.015, 0.015))], fissure=(0.7, 0.05, 0.02), scale=14.0, big=3.5, rough=(0.6, 0.45), bump=(0.2, 0.4)),
    # black war-plate, engraved, its sharpest edges burning red like gilt trim
    'plate': mat_metal('plate', (0.02, 0.018, 0.02), (0.22, 0.2, 0.21), rough=0.36, engrave=(0.3, 0.03, 0.025), glow_edge=TRIM),
    'horn': mat_horn('horn', 0.0, 3.4, [(0.0, (0.012, 0.01, 0.01)), (0.7, (0.03, 0.02, 0.02)), (1.0, (0.18, 0.04, 0.03))], rough=0.38, bands=26.0),
    'cloth': mat_cloth('cloth', 0.0, 1.5, [(0.0, (0.16, 0.01, 0.01)), (0.3, (0.035, 0.008, 0.01)), (1.0, (0.012, 0.01, 0.012))], rough=0.9, sheen=0.3),
    'banner': mat_cloth('banner', 0.0, 3.4, [(0.0, (0.08, 0.005, 0.006)), (0.5, (0.3, 0.02, 0.02)), (1.0, (0.22, 0.015, 0.015))], rough=0.85, sheen=0.35),
}
FLAT = {'scales': (0.05, 0.02, 0.02, 0.4, 0), 'membrane': (0.1, 0.015, 0.015, 0.5, 0), 'plate': (0.03, 0.03, 0.035, 0.35, 1),
        'horn': (0.05, 0.03, 0.03, 0.4, 0), 'cloth': (0.04, 0.01, 0.012, 0.9, 0), 'banner': (0.3, 0.02, 0.02, 0.85, 0)}

def idle(t):
    T = 4.4
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.9)
    for n, sg in (('L', 1), ('R', -1)):
        p['wing.' + n] = (0.05 * s, sg * -0.05 * s, sg * 0.04 * c)         # the wings breathe, held high
        p['wingtip.' + n] = (0, sg * 0.06 * s, 0)
    p['upperarm.L'] = (-0.15, -0.08, 0); p['forearm.L'] = (-0.55, 0, 0)    # the halberd held planted
    for i in range(4):
        p[f'tail{i}'] = (0, 0, 0.05 * (i + 1) / 4 * math.sin(TAU * t / T - i * 0.8))
    return p

def roar(t):
    p = roar_pose(t, idle)
    b = p['_b']
    for n, sg in (('L', 1), ('R', -1)):
        p['wing.' + n] = (p['wing.' + n][0], p['wing.' + n][1] - sg * 0.5 * b, p['wing.' + n][2])   # wings flung wide
        p['wingtip.' + n] = (0, -sg * 0.35 * b, 0)
    return p

def attack(t):
    # "Sovereign's Judgement": the halberd lifted high, the wings spread, then driven down into the earth
    up = ease(t / 0.8) * (1 - ease((t - 0.85) / 0.2))
    down = ease((t - 0.85) / 0.2) * (1 - ease((t - 2.2) / 0.8))
    shake = math.sin(t * 70) * 0.02 * ease((t - 1.0) / 0.1) * (1 - ease((t - 1.5) / 0.3))
    p = idle(t)
    k = 1 - max(up, down)
    p = {key: tuple(v * k for v in val) if isinstance(val, tuple) else val for key, val in p.items()}
    def add(key, x=0, y=0, z=0):
        q = p.get(key, (0, 0, 0)); p[key] = (q[0] + x, q[1] + y, q[2] + z)
    add('spine', -0.15 * up + 0.3 * down + shake); add('chest', -0.15 * up + 0.22 * down); add('neck', -0.1 * up + 0.05 * down)
    add('head', -0.25 * up + 0.15 * down)
    add('upperarm.L', -2.5 * up - 0.9 * down, -0.15 * up); add('forearm.L', -0.4 * up - 0.3 * down)
    add('hand.L', 2.6 * up + 1.0 * down)   # the wrist keeps the halberd upright, raised and then planted
    add('upperarm.R', -0.3 * up - 0.4 * down, 0.5 * up + 0.2 * down); add('forearm.R', -0.6 * up - 0.4 * down)
    add('thigh.L', -0.1 * up - 0.4 * down); add('thigh.R', 0.15 * down); add('shin.L', 0.1 * up + 0.55 * down); add('shin.R', 0.2 * down)
    add('foot.L', -0.15 * down)
    for n, sg in (('L', 1), ('R', -1)):
        add('wing.' + n, -0.2 * up + 0.35 * down, -sg * 0.6 * up, sg * 0.4 * down)
        add('wingtip.' + n, 0, -sg * 0.4 * up + sg * 0.2 * down)
    p['_hips_loc'] = (0, 0, -0.12 * down)
    return p

parts = {'body_high': body, **gear}
finish('Antares', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, (1.0, 0.1, 0.04),
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0)
