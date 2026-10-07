# The Mirror Phantom (weekly boss): a slim, tall duelist in pale polished plate, every plate the shape
# of the muscle under it and cut in facets like broken mirror. Read from its shadow alone: a crown of
# long mirror shards fanning up off the shoulders and the back like a broken halo, a blank faceted
# mask-helm with a fan of shards behind it, and a long straight blade in each hand.
# Its attack: both blades raised high and crossed behind the head, then a lunge and a blinding cross
# slash, the two blades sweeping down through each other in a wide X.
#   python3.11 phantom.py [--bake] [--tex 1024] [--out ../../phantom.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(97)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'phantom.glb'))
GLOW = (0.62, 0.3, 0.85)   # #9B59B6, lifted to burn

# tall and slim: long legs, a narrow waist, a duelist's long arms
J = {'pelvis': V((0, 0.02, 1.96)), 'waist': V((0, 0.03, 2.2)), 'chest': V((0, 0.0, 2.53)), 'upchest': V((0, 0.02, 2.74)),
     'neck': V((0, -0.03, 2.92)), 'head': V((0, -0.05, 3.09)), 'crown': V((0, -0.04, 3.28))}
mirrored(J, {'shoulder': (0.46, 0.03, 2.73), 'elbow': (0.66, 0.1, 2.2), 'wrist': (0.76, -0.06, 1.7), 'knuckle': (0.79, -0.12, 1.53),
             'hip': (0.16, 0.02, 1.92), 'knee': (0.22, -0.07, 1.04), 'ankle': (0.25, 0.08, 0.14), 'toe': (0.29, -0.27, 0.04)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=0.86, waist=0.78)
Mh = lambda pts: [H + V(p) for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def shard(name, base, tip, w, seed=0, lean=None):
    """A mirror shard: a long faceted sliver, its section an uneven lozenge, widest a third of the
    way up, broken off to an angled point."""
    base, tip = V(base), V(tip)
    d = (tip - base).normalized()
    a = d.orthogonal().normalized() if lean is None else (V(lean) - d * V(lean).dot(d)).normalized()
    b = d.cross(a)
    r = random.Random(seed)
    pts = []
    for u, k in ((0.0, 0.7), (0.32, 1.0), (0.7, 0.62)):
        c = base.lerp(tip, u)
        pts += [c + a * w * k * r.uniform(0.85, 1.1), c - a * w * k * r.uniform(0.85, 1.1),
                c + b * w * 0.35 * k * r.uniform(0.8, 1.1), c - b * w * 0.35 * k * r.uniform(0.8, 1.1)]
    pts.append(tip + a * w * r.uniform(-0.2, 0.2))
    return hull(name, pts, bevel=0.002)

def build_helm():
    # a blank mask: no mouth, no nose, a faceted ovoid of polished steel coming to a keel at the chin,
    # with two long angled eye-slits (see build_glow); a narrow brow ridge over them
    mask = hull('mask', Mh(both([(0.0, -0.005, 0.17), (0.08, -0.04, 0.14), (0.105, -0.12, 0.06), (0.0, -0.17, 0.07), (0.11, -0.1, -0.06),
                                 (0.07, -0.13, -0.15), (0.0, -0.165, -0.21), (0.09, 0.09, 0.06), (0.0, 0.135, 0.02), (0.07, 0.07, -0.14),
                                 (0.05, -0.16, -0.04), (0.0, -0.18, -0.05), (0.0, 0.05, 0.19)])))
    brow = hull('brow', Mh(both([(0.0, -0.18, 0.06), (0.1, -0.135, 0.05), (0.11, -0.1, 0.08), (0.0, -0.15, 0.1)])))
    parts = [mask, brow]
    for s, n in SIDES:   # facet ridges sweeping back from the cheek to the nape, like cracks in a mirror
        parts.append(hull('cheekfacet.' + n, Mh([(s * 0.1, -0.12, -0.02), (s * 0.115, -0.05, 0.0), (s * 0.1, 0.06, 0.05), (s * 0.11, 0.08, -0.05),
                                                  (s * 0.12, -0.02, -0.06), (s * 0.08, -0.13, -0.1)])))
    helm = join(parts, 'helm')
    return helm

def build_crown():
    # the shard crest behind the head: five shards fanning up and back out of a collar at the nape
    obs = []
    for k, (ang, L) in enumerate(((-0.55, 0.32), (-0.27, 0.44), (0.0, 0.56), (0.27, 0.44), (0.55, 0.32))):
        b = H + V((math.sin(ang) * 0.07, 0.1, 0.08 - abs(ang) * 0.06))
        d = V((math.sin(ang) * 0.8, 0.45, math.cos(ang))).normalized()
        obs.append(shard('crestshard', b, b + d * L, 0.032 - 0.004 * abs(k - 2), seed=k, lean=(1, 0, 0)))
    collar = hull('collar', Mh(both([(0.07, 0.08, 0.1), (0.1, 0.1, -0.02), (0.0, 0.14, 0.12), (0.0, 0.15, -0.06), (0.06, 0.05, 0.02)])))
    return join(obs + [collar], 'crown')

def build_blade(n):
    # a long straight duelling blade, a mirror-bright edge on a narrow faceted body, held forward out of
    # the fist; a crossguard of swept shards and a shard for a pommel
    G = J['wrist.' + n].lerp(J['knuckle.' + n], 0.5)
    s = 1 if n == 'L' else -1
    F, U, X = V((0, -1, 0)), V((0, 0, 1)), V((1, 0, 0))
    g0, tip = G + F * 0.12, G + F * 1.62
    pts = [g0 + U * z * 0.05 + X * x for z in (-1, 1) for x in (0,)] + [g0 + X * x * 0.011 for x in (-1, 1)]
    mid = g0.lerp(tip, 0.82)
    pts += [mid + U * z * 0.036 for z in (-1, 1)] + [mid + X * x * 0.008 for x in (-1, 1)]
    pts += [tip + U * 0.012]
    bl = hull('blade.' + n, pts, bevel=0.0015)
    fuller = hull('fuller.' + n, [g0 + F * 0.02 + X * x * 0.0125 + U * z * 0.008 for x in (-1, 1) for z in (-1, 1)] +
                  [g0.lerp(tip, 0.6) + X * x * 0.0095 + U * z * 0.004 for x in (-1, 1) for z in (-1, 1)], bevel=0)
    guard = [hull('guard', [G + F * 0.1 + U * z * 0.07 + X * x * 0.022 for z in (-1, 1) for x in (-1, 1)] +
                  [G + F * 0.135 + U * z * 0.05 + X * x * 0.015 for z in (-1, 1) for x in (-1, 1)], bevel=0.002)]
    for z in (-1, 1):   # swept quillons, shards raking forward
        guard.append(shard('quillon', G + F * 0.11 + U * z * 0.06, G + F * 0.26 + U * z * 0.2, 0.02, seed=3 + z, lean=(1, 0, 0)))
    pommel = shard('pommel', G - F * 0.07, G - F * 0.2, 0.026, seed=7, lean=(0, 0, 1))
    grip = [ring(f'grip{i}', G + F * (-0.06 + i * 0.022), 0.024, 0.006, rot=(math.pi / 2, 0, 0), seg=(14, 5)) for i in range(8)]
    edge = [g0 + U * 0.05 + F * 0.0, mid + U * 0.036, tip + U * 0.012]
    return {'blade.' + n: join([bl, fuller], 'blade.' + n), 'guard.' + n: join(guard + [pommel], 'guard.' + n), 'grip.' + n: join(grip, 'grip.' + n)}, (G, F, U, mid, tip)

BLADES = {}
def build_gear():
    P = {'hands': hands, 'helm': build_helm(), 'crown': build_crown()}
    muscle_plates(P, src, FIELDS, scale=0.95)
    for s, n in SIDES:
        el, ke, an, to = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.1 and p.y > el.y - 0.02, push=0.036, thick=0.015, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.11 and p.y < ke.y, push=0.045, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.07 and abs(p.x - an.x) < 0.14, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, J['hip.' + n], ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.03)
        # mirror shards: off the knee cop and the elbow, raking up and back
        P['kshard.' + n] = shard('kshard.' + n, ke + V((s * 0.02, -0.1, 0.0)), ke + V((s * 0.06, -0.2, 0.26)), 0.03, seed=11 + s, lean=(1, 0, 0))
        P['eshard.' + n] = shard('eshard.' + n, el + V((s * 0.03, 0.06, 0.02)), el + V((s * 0.1, 0.3, 0.12)), 0.03, seed=13 + s, lean=(0, 0, 1))
        # the shoulder crests: three shards each, sprung from the side-deltoid plate, fanning up and out
        sh = J['shoulder.' + n]
        sp = []
        for k, (dx, dy, L) in enumerate(((0.25, -0.25, 0.42), (0.45, 0.1, 0.62), (0.3, 0.45, 0.48))):
            b = sh + V((s * (0.06 + 0.02 * k), -0.06 + 0.07 * k, 0.07))
            d = V((s * dx, dy, 1.0)).normalized()
            sp.append(shard('pshard', b, b + d * L, 0.04 - 0.004 * k, seed=k + 20 * s, lean=(0, 1, 0)))
        P['pshards.' + n] = join(sp, 'pshards.' + n)
        # forearm guards: a long faceted vambrace, a mirror panel
        wr = J['wrist.' + n]
        P['vambrace.' + n] = plate(shell, 'vambrace.' + n, lambda p, el=el, wr=wr: 0.25 < seg_t(p, el, wr) < 0.95 and (p - el.lerp(wr, seg_t(p, el, wr))).length < 0.2,
                                   push=0.045, thick=0.014, smooth=4, facets=0.1, rim=0.01, rivets=0.0, bead=True)
    # the back fan: five long shards out of a spine-plate between the shoulder blades, fanning up and
    # back past the head like a broken halo
    bk = []
    for k, ang in enumerate((-0.95, -0.5, 0.0, 0.5, 0.95)):
        b = V((math.sin(ang) * 0.1, 0.2, 2.62 - abs(ang) * 0.06))
        d = V((math.sin(ang) * 1.0, 0.55, math.cos(ang) * 1.1)).normalized()
        L = 1.05 - abs(ang) * 0.32
        bk.append(shard('bshard', b, b + d * L, 0.075 - abs(ang) * 0.015, seed=40 + k, lean=(0, 1, 0)))
    bk.append(hull('spineplate', [V((x, y, z)) for x in (-0.13, 0.13) for y in (0.17, 0.24) for z in (2.5, 2.74)] + [V((0, 0.27, 2.62))], bevel=0.004))
    P['backfan'] = join(bk, 'backfan')
    # the belt and a long split coat-tail behind, torn into points
    P['belt'] = plate(shell, 'belt', lambda p: 1.94 < p.z < 2.04 and abs(p.x) < 0.4, push=0.045, thick=0.016, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    P['coattail'] = cloth('coattail', 18, 26, lambda u, t: (u * (0.2 + t * 0.12) + 0.03 * math.sin(u * 9) * t, 0.21 + t * 0.2 - u * u * 0.07, 1.99 - t * 1.4),
                          thick=0.012, strips=(0.35, 0.25, 31))
    P['tasset'] = cloth('tasset', 12, 10, lambda u, t: (u * (0.19 + t * 0.05), -0.24 - t * 0.08 + u * u * 0.06, 1.99 - t * 0.4), thick=0.012, strips=(0.5, 0.1, 37))
    for n in ('L', 'R'):
        bp, BLADES[n] = build_blade(n)
        P.update(bp)
    return P

gear = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:   # two long slits, angled up toward the temples
        ob = orb('slit.' + n, H + V((s * 0.05, -0.17, 0.03)), (0.05, 0.01, 0.008), rot=(0, s * -0.32, 0))
        sit_on(ob, gear['helm'], gap=-0.004); eyes.append(ob)
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    # a violet light runs up each blade's edge
    for n in ('L', 'R'):
        G, F, U, mid, tip = BLADES[n]
        e = hull('edge.' + n, [G + F * 0.16 + U * 0.047 + V((x, 0, 0)) for x in (-0.003, 0.003)] + [mid + U * 0.034 + V((x, 0, 0)) for x in (-0.003, 0.003)] +
                 [tip + U * 0.011, G + F * 0.16 + U * 0.04, mid + U * 0.029], bevel=0)
        g['edge.' + n] = (e, 'hand.' + n)
    # a core of violet behind the spine plate, where the shards are rooted
    g['core'] = (hull('core', [V((x, 0.245, z)) for x in (-0.05, 0.05) for z in (2.56, 2.68)] + [V((0, 0.26, 2.62))], bevel=0), 'chest')
    return g
glow = build_glow()

PAINTED = ('kneecop', 'couter', 'm.sidedelt')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm', 'crown'): return 'helm', ('rigid', 'head')
    if name.startswith(('couter', 'eshard', 'vambrace')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith(('kneecop', 'kshard')): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name.startswith('pshards'): return 'steel', ('smooth', {'chest', 'upperarm.' + side})
    if name == 'backfan': return 'steel', ('rigid', 'chest')
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'coattail': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'tasset': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name.startswith(('blade', 'guard')): return 'steel', ('rigid', 'hand.' + side)
    if name.startswith('grip'): return 'leather', ('rigid', 'hand.' + side)
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name == 'hands': return 2400
    if name == 'helm': return 1200
    if name == 'crown': return 700
    if name.startswith('m.'): return plate_tris(name)
    if name == 'coattail': return 2200
    if name == 'tasset': return 700
    if name == 'backfan': return 900
    if name.startswith(('pshards', 'guard', 'grip')): return 600
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt', 'vambrace')): return 600
    return min(tris, 300)

def uv_weight(name):
    if name in ('helm', 'crown'): return 2.6
    if name.startswith(('pshards', 'backfan', 'blade')): return 1.8
    if name.startswith('m.'): return plate_uv(name)
    if name in ('coattail', 'tasset'): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

# dark mirror-polished steel (a black glass sheen, not chrome: the set stays dark), a violet lacquer on the breast, a black-violet coat
MATS, FLAT = knight_mats(accent=GLOW, steel=(0.075, 0.077, 0.09), paint=(0.04, 0.012, 0.06),
                         cloth=[(0.0, (0.035, 0.012, 0.05)), (0.4, (0.014, 0.01, 0.018)), (1.0, (0.01, 0.009, 0.012))])
FLAT.update({'steel': (0.09, 0.09, 0.105, 0.22, 1), 'helm': (0.1, 0.1, 0.12, 0.2, 1), 'paint': (0.12, 0.05, 0.17, 0.35, 1)})

def idle(t):
    T = 4.0
    s = math.sin(TAU * t / T)
    p = idle_pose(t, T=T, k=0.8)
    # the blades held low and forward, points toward the floor ahead, the weight on the balls of the feet
    return posed(p, upperarm_L=(-0.12, -0.12, 0), upperarm_R=(-0.12, 0.12, 0), forearm_L=(-0.3, 0, 0.1), forearm_R=(-0.3, 0, -0.1),
                 hand_L=(0.85 + 0.03 * s, 0, 0), hand_R=(0.85 + 0.03 * s, 0, 0))

def roar(t):
    p = roar_pose(t, idle)
    b = p['_b']
    return posed(p, hand_L=(0.6 * b, 0, 0), hand_R=(0.6 * b, 0, 0))

def attack(t):
    # "Shattered Reflection": both blades lifted high and crossed behind the head (the body coiled,
    # drawn up tall), a breath, then a lunge off the back foot as both blades sweep down and across
    # through each other in a wide X, held, then the recovery
    up = ease(t / 0.75) * (1 - ease((t - 0.95) / 0.16))
    cut = ease((t - 0.95) / 0.16) * (1 - ease((t - 2.1) / 0.75))
    k = max(up, cut)
    shake = math.sin(t * 70) * 0.015 * ease((t - 1.1) / 0.05) * (1 - ease((t - 1.5) / 0.3))
    p = fade_idle(idle(t), 1 - k)
    for s, n in SIDES:
        # wound up: arms high and wide, elbows bent, the blades laid back across each other behind the head
        # struck: each arm swept down and across the body to the far hip, the blade trailing out level
        p = posed(p, **{f'upperarm_{n}': (-2.7 * up - 1.55 * cut, -s * 0.35 * up + s * 0.7 * cut, s * 0.2 * up - s * 0.3 * cut),
                        f'forearm_{n}': (-0.9 * up - 0.15 * cut, 0, s * 0.3 * cut),
                        f'hand_{n}': (2.0 * up + 0.9 * cut, s * 0.55 * up - s * 0.65 * cut, -s * 0.3 * up - s * 2.3 * cut)})
    p = posed(p, spine=(-0.12 * up + 0.3 * cut + shake, 0, 0), chest=(-0.1 * up + 0.2 * cut, 0, 0), head=(-0.1 * up + 0.05 * cut, 0, 0),
              thigh_L=(0.12 * up - 0.95 * cut, 0, 0), shin_L=(0.05 * up + 0.95 * cut, 0, 0), foot_L=(-0.1 * cut, 0, 0),
              thigh_R=(-0.05 * up + 0.45 * cut, 0, 0), shin_R=(0.25 * cut, 0, 0), foot_R=(0.25 * cut, 0, 0))
    # the lunge carries the hips forward and down (hips bone space: y is up, z is back to front)
    p['_hips_loc'] = (0, 0.04 * up - 0.3 * cut, 0.45 * cut)
    return p

parts = {'body_high': body, **gear}
finish('Phantom', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, GLOW,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
