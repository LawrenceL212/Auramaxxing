# The Abyss Stalker (weekly boss): a lean, very tall hunter in close black plate, every plate the
# shape of the muscle under it. Read from its shadow alone: reverse-jointed legs that stand it on
# the balls of its feet, long arms each ending in a forearm blade reaching past the hand, a narrow,
# eyeless helm drawn up into a swept-back fin with one vertical burning slit for a face, and a
# ragged scarf streaming out behind it.
# Its attack: it sinks low, blades cocked back, then lunges and scissors both blades across.
#   python3.11 stalker.py [--bake] [--tex 1024] [--out ../../stalker.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(97)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'stalker.glb'))

# long proportions: the hips at 2.2 m, a short torso, a small head; the legs bend the wrong way, the
# heel high off the floor behind and the long foot standing on its toes
J = {'pelvis': V((0, 0.02, 2.2)), 'waist': V((0, 0.03, 2.44)), 'chest': V((0, 0.0, 2.78)), 'upchest': V((0, 0.02, 3.0)),
     'neck': V((0, -0.03, 3.17)), 'head': V((0, -0.06, 3.32)), 'crown': V((0, -0.05, 3.5))}
mirrored(J, {'shoulder': (0.46, 0.03, 3.0), 'elbow': (0.68, 0.12, 2.4), 'wrist': (0.78, -0.03, 1.82), 'knuckle': (0.81, -0.11, 1.66),
             'hip': (0.17, 0.02, 2.16), 'knee': (0.23, -0.32, 1.42), 'ankle': (0.26, 0.26, 0.6), 'toe': (0.28, -0.12, 0.05)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=0.86, waist=0.74)
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]
M = lambda pts: [H + V(p) for p in pts]

def crescent(name, path, widths, normal, thick=0.012, side=1):
    """A long faceted blade along path: a thick spine on one side, a sharp edge on the other,
    built as convex segments so every face stays a hard plane. Returns (blade, edge points)."""
    path = [V(p) for p in path]; normal = V(normal).normalized()
    secs, edge = [], []
    for i, c in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        e = t.cross(normal).normalized() * side
        w = widths[i]
        tk = thick * (1 - 0.8 * i / (len(path) - 1)) + 0.002
        secs.append([c - e * w * 0.3 + normal * tk, c - e * w * 0.3 - normal * tk, c - e * w * 0.4, c + e * w * 0.7 + normal * 0.0015, c + e * w * 0.7 - normal * 0.0015])
        edge.append(c + e * w * 0.71)
    return sharp(join([hull(name + 'seg', a + b, bevel=0) for a, b in zip(secs, secs[1:])], name), 25), edge

def build_helm():
    # narrow and tall, all planes: a keeled face with no eyes, two flanges standing either side of the
    # one vertical slit, a pointed chin, a fin drawn up off the crown and swept far back, two smaller
    # fins swept back off the temples
    parts = [hull('helmshell', M(both([(0.0, 0.0, 0.2), (0.065, -0.02, 0.15), (0.085, -0.1, 0.04), (0.0, -0.165, 0.1), (0.05, -0.15, 0.08),
                                        (0.0, -0.185, -0.04), (0.055, -0.14, -0.13), (0.0, -0.13, -0.22), (0.08, 0.08, 0.02), (0.0, 0.14, 0.0),
                                        (0.06, 0.06, -0.13), (0.08, -0.04, -0.08)])))]
    for s, n in SIDES:   # the flanges either side of the slit: the slit burns at the bottom of a trench
        parts.append(hull('flange.' + n, M([(s * 0.012, -0.19, 0.09), (s * 0.03, -0.165, 0.1), (s * 0.014, -0.2, -0.09), (s * 0.034, -0.17, -0.1),
                                             (s * 0.03, -0.16, 0.0), (s * 0.016, -0.205, 0.0)])))
        parts.append(hull('templefin.' + n, M([(s * 0.075, -0.06, 0.06), (s * 0.09, 0.02, 0.1), (s * 0.085, 0.04, -0.02), (s * 0.15, 0.36, 0.1),
                                                (s * 0.09, 0.06, 0.06), (s * 0.075, -0.04, 0.0)]), bevel=0.002))
        parts.append(hull('cheek.' + n, M([(s * 0.06, -0.14, -0.06), (s * 0.085, -0.06, -0.06), (s * 0.05, -0.12, -0.2), (s * 0.08, 0.0, -0.16),
                                            (s * 0.1, 0.06, -0.12)])))
    fin = [(-0.12, 0.17), (0.0, 0.205), (0.16, 0.22), (0.42, 0.48), (0.58, 0.66), (0.3, 0.26), (0.12, 0.08)]
    parts.append(hull('fin', M([(x, y, z) for x in (-0.009, 0.009) for (y, z) in fin] + [(0, 0.1, 0.24), (0, 0.48, 0.58)]), bevel=0.002))
    for k in range(4):   # teeth notched out along the fin's leading edge
        y = 0.18 + k * 0.09
        b = H + V((0, y, 0.22 + (y - 0.16) * 1.05))
        parts.append(blade('finspur', b, b + V((0, -0.02, 0.07)), 0.016, thick=0.35, sub=0))
    helm = join(parts, 'helm')
    rv = []
    for s in (1, -1):
        for k in range(5):
            rv.append(orb('hrv', H + V((s * 0.083, -0.08 + 0.04 * k, -0.05 + 0.005 * k)), (0.007, 0.007, 0.007), seg=(8, 5)))
    helm['detail'] = join(rv, 'helm_rivets').name
    return helm

def build_scarf():
    P = {}
    nk = J['neck']
    def wrap(u, t):   # wound twice round the neck, bunched
        a = u * math.pi
        r = 0.13 + 0.05 * t + 0.012 * math.sin(u * 19 + t * 5)
        return (math.sin(a) * r, nk.y + 0.0 - math.cos(a) * r * 0.9, nk.z + 0.07 - t * 0.2)
    P['scarfwrap'] = cloth('scarfwrap', 36, 7, wrap, thick=0.016, sub=1)
    # two long tails off the back of the neck, streaming back and out as if in a wind, torn to strips
    for s, n, L, ph in ((1, 'L', 2.2, 0.0), (-1, 'R', 1.7, 1.3)):
        def tail(u, t, s=s, L=L, ph=ph):
            w = 0.12 + 0.1 * t
            x = s * (0.08 + t * 0.5) + u * w
            y = nk.y + 0.12 + t * L * 0.5 + 0.06 * math.sin(t * 7 + ph) * t
            z = nk.z - 0.06 - t * L * 0.72 + 0.06 * math.sin(t * 5 + ph + u) * t
            return (x, y, z)
        P['scarftail.' + n] = cloth('scarftail.' + n, 8, 32, tail, thick=0.012, strips=(0.55, 0.15, 7 + s))
    return P

def build_gear():
    P = {'hands': hands, 'helm': build_helm()}
    P.update(build_scarf())
    muscle_plates(P, src, FIELDS, scale=0.92)
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an, to = J['hip.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.1 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        # the knee points forward on these legs: a cop on it, a spike forward off it
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.12 and p.y < ke.y + 0.02, push=0.05, thick=0.018, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.08, 0.0)), ke + V((s * 0.03, -0.28, 0.12)), 0.045, curve=V((0, 0, 0.05)), thick=0.5)
        # the heel stands high behind: a spur off it; the long foot plated down its front
        P['heelspur.' + n] = blade('heelspur.' + n, an + V((0, 0.04, 0.02)), an + V((s * 0.02, 0.3, 0.12)), 0.045, curve=V((0, 0, 0.04)), thick=0.5)
        P['footplate.' + n] = plate(shell, 'footplate.' + n, lambda p, an=an, to=to: (lambda t: 0.05 < t < 0.85 and (p - an.lerp(to, t)).normalized().dot((to - an).cross(V((1, 0, 0))).normalized()) > 0.2)(
                                    (p - an).dot(to - an) / (to - an).length_squared), push=0.03, thick=0.015, smooth=3, facets=0.06, rim=0.01, rivets=0.06, bead=True)
        for i in range(3):   # three long toe talons
            b = to + V((s * (0.05 - i * 0.05), -0.02, 0.02))
            P[f'toeclaw{i}.' + n] = blade(f'toeclaw{i}.' + n, b, b + V((s * (0.03 - i * 0.03), -0.2, -0.04)), 0.026, curve=V((0, 0, 0.03)), thick=0.6)
        d = (kn - wr).normalized()
        for i in range(4):   # finger talons
            off = V((0, -0.065 + i * 0.13 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.1 + V((0, -0.08, -0.03)), 0.016, curve=V((0, -0.02, 0)), thick=0.6)
        # the forearm blade: bolted along the outside of the forearm, reaching a long way past the hand,
        # its edge forward; a bracer of plate clamps it on
        fa = (wr - el).normalized()
        out = V((s, 0, 0))
        base = el.lerp(wr, 0.15) + out * 0.075
        tip = wr + fa * 1.05 + out * 0.1 + V((0, -0.05, 0))
        path, widths = [], []
        for k in range(14):
            u = k / 13
            p = base.lerp(tip, u) + V((0, 0.05, 0)) * math.sin(u * math.pi)
            path.append(p); widths.append((0.06 + 0.07 * math.sin(min(1, u * 1.6) * math.pi * 0.5) * (1 - u) ** 0.4) + 0.006)
        bl, edge = crescent('fblade.' + n, path, widths, V((1, 0, 0)), thick=0.014, side=1)
        if sum(e.y for e in edge) > sum(p.y for p in path):   # the edge faces forward
            bl, edge = crescent('fblade.' + n, path, widths, V((1, 0, 0)), thick=0.014, side=-1)
        P['fblade.' + n] = bl; EDGES[n] = edge
        P['bracer.' + n] = join([hull('clamp', [el.lerp(wr, t) + out * x + V((0, y, z)) for x in (0.04, 0.1) for y in (-0.06, 0.06) for z in (-0.03, 0.03)])
                                 for t in (0.3, 0.75)], 'bracer.' + n)
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, hp, ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.035)
        # one long thorn off each shoulder, raked back
        if 'm.sidedelt.' + n in P:
            P['pthorns.' + n] = thorns(P['m.sidedelt.' + n], 'pthorns.' + n, lambda c, s=s, sh=sh: c.z > sh.z + 0.02 and s * c.x > abs(sh.x) - 0.04,
                                       2, 0.48, 0.06, up=1.2, back=1.6, curve=0.3, seed=5 + s, flat=0.55)
    pz = J['pelvis'].z
    P['belt'] = plate(shell, 'belt', lambda p: pz - 0.02 < p.z < pz + 0.08 and abs(p.x) < 0.4, push=0.045, thick=0.018, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    # a narrow torn tasset front and back, to the knee
    P['tasset'] = cloth('tasset', 10, 18, lambda u, t: (u * (0.13 + t * 0.03), -0.22 - t * 0.05 + u * u * 0.04, pz + 0.04 - t * 0.75), thick=0.014, strips=(0.5, 0.1, 9))
    P['tassetb'] = cloth('tassetb', 10, 18, lambda u, t: (u * (0.15 + t * 0.04), 0.2 + t * 0.12 - u * u * 0.04, pz + 0.04 - t * 0.7), thick=0.014, strips=(0.5, 0.1, 13))
    return P

EDGES = {}
gear = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    slit = orb('slit', H + V((0, -0.19, 0.0)), (0.009, 0.014, 0.085), seg=(10, 12))
    g['eyes'] = (slit, 'head')
    for n in ('L', 'R'):
        g['edge.' + n] = (tube('edge.' + n, EDGES[n], [0.005] * len(EDGES[n]), sub=1), 'forearm.' + n)
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'kneecop', 'couter')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'helm': return 'helm', ('rigid', 'head')
    if name == 'scarfwrap': return 'cloth', ('smooth', {'neck', 'chest'})
    if name.startswith('scarftail'): return 'cloth', ('smooth', {'neck', 'chest'})
    if name.startswith(('couter', 'fblade', 'bracer')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith(('kneecop', 'kspike')): return steel, ('rigid', 'shin.' + side)
    if name.startswith(('heelspur', 'footplate')): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('toeclaw'): return 'bone', ('rigid', 'foot.' + side)
    if name.startswith('talon'): return 'bone', ('rigid', 'hand.' + side)
    if name.startswith('pthorns'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name in ('tasset', 'tassetb'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 6500
    if name == 'hands': return 2400
    if name == 'helm': return 1800
    if name.startswith('m.'): return plate_tris(name, 520, 300)
    if name == 'scarfwrap': return 1200
    if name.startswith('scarftail'): return 1200
    if name.startswith('fblade'): return 500
    if name in ('tasset', 'tassetb'): return 600
    if name.startswith(('couter', 'kneecop', 'footplate', 'belt')): return 500
    if name.startswith('pthorns'): return 400
    return min(tris, 260)

def uv_weight(name):
    if name in ('helm',) or name.startswith('fblade'): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name.startswith(('scarf', 'tasset')): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

CYAN = (0.024, 0.71, 0.83)
MATS, FLAT = knight_mats(accent=CYAN, paint=(0.003, 0.022, 0.03), leather=(0.02, 0.018, 0.017),
                         cloth=[(0.0, (0.004, 0.025, 0.032)), (0.4, (0.01, 0.013, 0.016)), (1.0, (0.008, 0.009, 0.011))])

def idle(t):
    # it stands hunched over its long legs, blades low, the head turning as it hunts
    T = 3.8
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.8)
    p = posed(p, spine=(0.1, 0, 0), chest=(0.08, 0, 0), neck=(0.05, 0, 0), head=(-0.12, 0, 0.12 * math.sin(TAU * t / T * 0.5)),
              upperarm_L=(-0.15, -0.18, 0), upperarm_R=(-0.15, 0.18, 0), forearm_L=(-0.25, 0, 0), forearm_R=(-0.25, 0, 0),
              thigh_L=(-0.12, 0, 0), thigh_R=(-0.12, 0, 0), shin_L=(0.18, 0, 0), shin_R=(0.18, 0, 0), foot_L=(-0.06, 0, 0), foot_R=(-0.06, 0, 0))
    p['_hips_loc'] = (0, -0.05 - 0.01 * s, 0)
    return p

def roar(t):
    return roar_pose(t, idle)

def attack(t):
    # "Abyssal Rend": it sinks low on its sprung legs, both blades drawn back and out (held), then
    # it springs forward and scissors the blades across in front of it, low to high, and recovers
    cr = ease(t / 0.7) * (1 - ease((t - 0.85) / 0.15))
    ln = ease((t - 0.85) / 0.15) * (1 - ease((t - 1.9) / 0.9))
    p = fade_idle(idle(t), 1 - max(cr, ln))
    p = posed(p, spine=(0.3 * cr + 0.4 * ln, 0, 0), chest=(0.1 * cr + 0.15 * ln, 0, 0), neck=(-0.1 * cr - 0.15 * ln, 0, 0), head=(-0.25 * cr - 0.2 * ln, 0, 0),
              thigh_L=(-0.75 * cr - 0.9 * ln, 0, 0), shin_L=(1.1 * cr + 0.6 * ln, 0, 0), foot_L=(-0.5 * cr - 0.1 * ln, 0, 0),
              thigh_R=(-0.6 * cr + 0.25 * ln, 0, 0), shin_R=(1.0 * cr + 0.55 * ln, 0, 0), foot_R=(-0.55 * cr - 0.5 * ln, 0, 0))
    for s, n in SIDES:   # drawn back and out, then swept forward across the body
        p = posed(p, **{f'upperarm_{n}': (0.7 * cr - 1.45 * ln, -s * 0.7 * cr + s * 0.25 * ln, -s * 0.3 * ln),
                        f'forearm_{n}': (-0.9 * cr - 0.15 * ln, 0, 0), f'hand_{n}': (0.3 * cr - 0.2 * ln, 0, 0)})
    p['_hips_loc'] = (0, -0.4 * cr - 0.18 * ln, 0.55 * ln)   # down into the crouch, then carried forward by the lunge
    return p

parts = {'body_high': body, **gear}
finish('AbyssStalker', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, CYAN,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
