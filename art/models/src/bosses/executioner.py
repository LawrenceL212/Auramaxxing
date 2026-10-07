# The Phantom Executioner (weekly boss): a headsman in black war-plate, every plate the shape of the
# muscle under it. Read from its shadow alone: a tall peaked hood over a closed helm, a heavy cowl
# of mail on the shoulders, and a great crescent-bladed headsman's axe held across the body.
# Its attack: the axe swung up overhead with both hands and brought straight down.
#   python3.11 executioner.py [--bake] [--tex 1024] [--out ../../executioner.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(71)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'executioner.glb'))

J = {'pelvis': V((0, 0.02, 1.81)), 'waist': V((0, 0.03, 2.06)), 'chest': V((0, 0.0, 2.41)), 'upchest': V((0, 0.02, 2.63)),
     'neck': V((0, -0.03, 2.81)), 'head': V((0, -0.06, 2.98)), 'crown': V((0, -0.05, 3.17))}
mirrored(J, {'shoulder': (0.52, 0.03, 2.63), 'elbow': (0.74, 0.1, 2.12), 'wrist': (0.84, -0.08, 1.64), 'knuckle': (0.87, -0.14, 1.47),
             'hip': (0.18, 0.02, 1.77), 'knee': (0.25, -0.07, 0.98), 'ankle': (0.28, 0.08, 0.14), 'toe': (0.32, -0.27, 0.04)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.12, waist=0.9)
M = lambda pts: [H + V(p) for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def build_helm():
    # a closed bucket of a helm, all flat planes: a flat face with a single cross slit, a ridge down it
    shell_ = hull('helmshell', M(both([(0.0, 0.0, 0.16), (0.1, -0.02, 0.14), (0.12, -0.12, 0.06), (0.0, -0.16, 0.08), (0.12, -0.1, -0.1),
                                       (0.0, -0.15, -0.16), (0.1, 0.1, 0.04), (0.0, 0.14, 0.0), (0.09, 0.08, -0.12), (0.06, -0.12, -0.17)])))
    keel = hull('keel', M(both([(0.012, -0.165, 0.07), (0.0, -0.175, -0.02), (0.012, -0.155, -0.15), (0.01, -0.06, 0.16)])))
    rv = []
    for s in (1, -1):
        for k in range(6):
            p = H + V((s * 0.122, -0.11 + 0.04 * k, -0.06 + 0.02 * math.sin(k)))
            rv.append(orb('hrv', p + V((s * 0.01, 0, 0)), (0.008, 0.008, 0.008), seg=(8, 5)))
    helm = join([shell_, keel] + rv, 'helm')
    return helm

def build_gear():
    P = {'hands': hands, 'helm': build_helm()}
    muscle_plates(P, src, FIELDS, scale=1.1)
    # the hood: a tall peak over the helm falling to the shoulders, open at the face, torn at its hem
    def hood(u, t):
        a = u * math.pi * 0.86
        r = 0.17 + t * t * 0.22 + 0.014 * math.sin(u * 17) * t
        peak = (1 - t) ** 3 * 0.16
        return (math.sin(a) * r * (1 - 0.5 * (1 - t) ** 4), H.y + 0.03 - math.cos(a) * r * 0.9 + peak * 0.9, H.z + 0.22 + peak - t * 0.5)
    P['hood'] = cloth('hood', 30, 18, hood, thick=0.014, strips=(0.22, 0.05, 11))
    # a mail cowl from the neck over the shoulders
    def cowl(u, t):
        a = u * math.pi
        r = 0.16 + t * 0.24
        return (math.sin(a) * r, J['neck'].y + 0.02 - math.cos(a) * r * 0.75, J['neck'].z - 0.02 - t * 0.3 + 0.02 * math.sin(u * 23) * t)
    P['cowl'] = cloth('cowl', 40, 8, cowl, thick=0.01, sub=1)
    for s, n in SIDES:
        el, ke, an, to = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.11 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.12 and p.y < ke.y, push=0.05, thick=0.018, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.1, 0.02)), ke + V((s * 0.04, -0.26, 0.14)), 0.04, curve=V((0, 0, 0.04)), thick=0.5)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.07 and abs(p.x - an.x) < 0.14, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
    # the belt and a heavy leather apron to the knees, front and back
    P['belt'] = plate(shell, 'belt', lambda p: 1.81 < p.z < 1.92 and abs(p.x) < 0.4, push=0.05, thick=0.02, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    P['apron'] = cloth('apron', 14, 22, lambda u, t: (u * (0.2 + t * 0.04), -0.27 - t * 0.08 + u * u * 0.05, 1.86 - t * 0.95), thick=0.016, strips=(0.5, 0.05, 5))
    P['apronb'] = cloth('apronb', 14, 22, lambda u, t: (u * (0.22 + t * 0.05), 0.22 + t * 0.1 - u * u * 0.05, 1.86 - t * 0.9), thick=0.016, strips=(0.5, 0.05, 5))
    # straps on the inside of each limb
    for s, n in SIDES:
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        hp, ke, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, hp, ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.035)
    # the axe: both hands on a long haft held across the body, a great bearded crescent blade at the top
    gR = J['wrist.R'].lerp(J['knuckle.R'], 0.6)
    gL = J['wrist.L'].lerp(J['knuckle.L'], 0.6)
    up = V((0.1, -0.06, 1.0)).normalized()   # held upright at the right side, the head high beside the hood
    bot, top = gR - up * 0.75, gR + up * 1.45
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.5), top], [0.032, 0.034, 0.036], sub=1), 50)
    grip = [ring(f'grip{i}', gR + up * (-0.1 + i * 0.03), 0.036, 0.007, rot=up.to_track_quat('Z', 'Y').to_euler(), seg=(18, 6)) for i in range(16)]
    P['grip'] = join(grip, 'grip')
    side = up.cross(V((0, 1, 0))).normalized()
    if side.x < 0: side = -side   # the blade faces outward, away from the body
    c = top - up * 0.3
    pts, edge = [], []
    for k in range(13):   # the crescent: a broad bearded edge, sweeping down past the haft
        a = -1.1 + k * 2.3 / 12
        e = c + side * (0.12 + 0.28 * math.cos(a * 0.8)) + up * (0.36 * math.sin(a))
        pts += [e + V((0, w, 0)) for w in (-0.006, 0.006)]
        edge.append(e + side * 0.004)
    pts += [c + up * 0.32 + V((0, w, 0)) for w in (-0.03, 0.03)] + [c - up * 0.4 + V((0, w, 0)) for w in (-0.03, 0.03)]
    P['axehead'] = hull('axehead', pts, bevel=0.003)
    P['socket'] = hull('socket', [c + up * z + side * x + V((0, y, 0)) for x in (-0.05, 0.08) for y in (-0.045, 0.045) for z in (-0.32, 0.36)])
    P['axespike'] = blade('axespike', top, top + up * 0.3, 0.05, thick=0.4)
    P['axehook'] = blade('axehook', c - side * 0.04, c - side * 0.3 - up * 0.08, 0.05, curve=V((0, 0, 0.06)), thick=0.3)
    P['ferrule'] = blade('ferrule', bot, bot - up * 0.2, 0.034, thick=1.0)
    return P, edge

gear, EDGE = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    slit = [orb('slith', H + V((0, -0.165, 0.03)), (0.075, 0.012, 0.01)), orb('slitv', H + V((0, -0.17, -0.04)), (0.009, 0.012, 0.075))]
    g['eyes'] = (join(slit, 'eyes'), 'head')
    # the edge of the axe smoulders
    g['edge'] = (tube('edge', EDGE, [0.006] * len(EDGE), sub=1), 'hand.R')
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
    if name == 'hood': return 'cloth', ('smooth', {'head', 'neck'})
    if name == 'cowl': return 'mail', ('smooth', {'neck', 'chest'})
    if name.startswith(('couter',)): return steel, ('rigid', 'forearm.' + side)
    if name.startswith(('kneecop', 'kspike')): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name in ('apron', 'apronb'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name in ('haft', 'axehead', 'socket', 'axespike', 'axehook', 'ferrule'): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name == 'hands': return 2400
    if name == 'helm': return 1400
    if name.startswith('m.'): return plate_tris(name)
    if name in ('hood', 'cowl'): return 2600
    if name.startswith(('apron',)): return 1000
    if name == 'axehead': return 900
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt')): return 600
    if name == 'grip': return 1200
    return min(tris, 300)

def uv_weight(name):
    if name in ('helm', 'axehead'): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name in ('hood', 'cowl', 'apron', 'apronb'): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

MATS, FLAT = knight_mats(accent=(0.9, 0.08, 0.04), paint=(0.05, 0.006, 0.005),
                         cloth=[(0.0, (0.02, 0.004, 0.004)), (0.4, (0.014, 0.01, 0.012)), (1.0, (0.01, 0.009, 0.011))])

def idle(t):
    T = 4.0
    s = math.sin(TAU * t / T)
    p = idle_pose(t, T=T, k=0.8)
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R'):   # the axe hand stays steady
        p[k] = idle(t)[k]
    return p

def attack(t):
    # "The Verdict": the axe raised high overhead in both hands, a breath held, then the blade
    # brought straight down and buried in the floor
    up = ease(t / 0.75) * (1 - ease((t - 1.0) / 0.18))
    down = ease((t - 1.0) / 0.18) * (1 - ease((t - 2.3) / 0.7))
    shake = math.sin(t * 70) * 0.02 * ease((t - 1.15) / 0.06) * (1 - ease((t - 1.6) / 0.3))
    p = fade_idle(idle(t), 1 - max(up, down))
    for n in ('L', 'R'):
        p = posed(p, **{f'upperarm_{n}': (-2.4 * up - 0.5 * down, 0, 0), f'forearm_{n}': (-0.5 * up - 0.2 * down, 0, 0), f'hand_{n}': (0.4 * up - 0.3 * down, 0, 0)})
    p = posed(p, spine=(-0.18 * up + 0.42 * down + shake, 0, 0), chest=(-0.14 * up + 0.3 * down, 0, 0), head=(-0.2 * up + 0.1 * down, 0, 0),
              thigh_L=(-0.15 * up - 0.5 * down, 0, 0), shin_L=(0.15 * up + 0.7 * down, 0, 0), thigh_R=(0.2 * down, 0, 0), shin_R=(0.25 * down, 0, 0))
    p['_hips_loc'] = (0, -0.16 * down, 0)   # in the hips bone's frame, y runs up the bone
    return p

parts = {'body_high': body, **gear}
finish('Executioner', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, (0.9, 0.08, 0.04),
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
