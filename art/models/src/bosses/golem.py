# The Stone Golem (D-rank gate): an awakened construct of fractured boulders around a core of
# living rock that glows through every joint ("brittle at its joints"), moss on its shoulders,
# crystals grown out of its back. ~3 m.
#   python3.11 golem.py --bake --out ../../golem.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(23)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'golem.glb'))

J = {'pelvis': V((0, 0.05, 1.08)), 'waist': V((0, 0.06, 1.34)), 'chest': V((0, 0.04, 1.74)), 'upchest': V((0, 0.08, 2.08)),
     'neck': V((0, -0.06, 2.2)), 'head': V((0, -0.22, 2.24)), 'crown': V((0, -0.22, 2.5))}
mirrored(J, {'shoulder': (0.78, 0.06, 2.06), 'elbow': (1.0, 0.12, 1.5), 'wrist': (1.08, -0.04, 0.98), 'knuckle': (1.1, -0.1, 0.72),
             'hip': (0.34, 0.05, 1.02), 'knee': (0.44, -0.06, 0.58), 'ankle': (0.47, 0.05, 0.14), 'toe': (0.5, -0.3, 0.06)})
BONES = human_bones()

def along(a, b):
    # euler rotation that points a rock's local Z from a to b
    return (b - a).to_track_quat('Z', 'Y').to_euler()

def build_core():
    # the core: a slimmer body of living rock that the boulders hang on; it shows, glowing, at the joints
    t = Tree()
    pel = t.add(J['pelvis'], 0.24)
    wai = t.add(J['waist'], 0.2, pel)
    che = t.add(J['chest'], 0.3, wai)
    up = t.add(J['upchest'], 0.32, che)
    nk = t.add(J['neck'], 0.2, up)
    t.add(J['head'], 0.17, nk)
    for s, n in SIDES:
        sh = t.add(J['shoulder.' + n], 0.17, up)
        el = t.add(J['elbow.' + n], 0.12, sh)
        wr = t.add(J['wrist.' + n], 0.11, el)
        t.add(J['knuckle.' + n], 0.12, wr)
        hp = t.add(J['hip.' + n], 0.15, pel)
        kn = t.add(J['knee.' + n], 0.12, hp)
        an = t.add(J['ankle.' + n], 0.1, kn)
        t.add(J['toe.' + n], 0.12, an)
    core = remesh([t.build('core_skin')], 'body_high', voxel=0.02, smooth=4)
    displace(core, scale=5.0, amount=0.04)
    return core

core = build_core()

def build_rocks():
    P = {}
    k = [0]
    def R(name, c, s, rot=(0, 0, 0), rough=0.16):
        k[0] += 1
        P[name] = rock(name, c, s, rot, seed=k[0] * 3.7, rough=rough * 1.6)
        # chipped: subdivide the facets so cell-noise can dent them, keeping the hard edges
        ob = P[name]
        r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.018; r.adaptivity = 0
        apply_mods(ob)
        displace(ob, scale=7.0, amount=0.012, seed=k[0])
    # torso: a great chest slab, a broken ring of rocks round the belly, a pelvis block
    R('chestrock', J['chest'] + V((0, -0.06, 0.18)), (0.62, 0.42, 0.42), (0.1, 0, 0.05))
    R('backrock', J['upchest'] + V((0, 0.26, -0.05)), (0.5, 0.3, 0.42), (-0.2, 0, -0.08))
    for i, a in enumerate((-1.6, -0.8, 0.0, 0.8, 1.6, 2.6, 3.7)):
        R(f'belly{i}', J['waist'] + V((math.sin(a) * 0.2, -math.cos(a) * 0.17 + 0.05, 0.03 * (i % 2))), (0.17, 0.15, 0.15), (0.3 * i, 0.2, a))
    R('pelvisrock', J['pelvis'] + V((0, 0.0, -0.02)), (0.42, 0.32, 0.22), (0, 0, 0.04))
    # head: a small block sunk between the shoulders, a heavy brow over deep sockets
    R('headrock', J['head'] + V((0, 0.02, 0.06)), (0.2, 0.2, 0.17), (0.15, 0, 0.1), rough=0.1)
    R('jawrock', J['head'] + V((0, -0.05, -0.1)), (0.17, 0.13, 0.08), (0.2, 0, -0.05), rough=0.1)
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an, to = J['hip.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        R('shoulderrock.' + n, sh + V((s * 0.04, 0.0, 0.1)), (0.38, 0.36, 0.3), (0.2, s * 0.3, s * 0.4))
        def limb(tag, a, b, r):
            # two boulders per limb segment, a gap of glowing core at each joint
            for i, u in enumerate((0.28, 0.7)):
                R(f'{tag}{i}.' + n, a.lerp(b, u), (r * (1.05 - 0.1 * i), r * (1.0 - 0.08 * i), (b - a).length * 0.34), along(a, b))
        limb('upperarm', sh, el, 0.21)
        limb('forearm', el, wr, 0.27)
        R('fist.' + n, wr.lerp(kn, 0.5) + V((0, -0.04, -0.04)), (0.25, 0.23, 0.24), (0.2, 0, s * 0.3))
        for f in range(3):   # knuckle stones
            R(f'knuckle{f}.' + n, kn + V((s * (0.06 - f * 0.08) * 0.8, -0.16, -0.08)), (0.08, 0.08, 0.09), (f, 0.4, 0.2), rough=0.1)
        limb('thigh', hp, ke, 0.25)
        limb('shin', ke, an, 0.23)
        R('hiprock.' + n, hp + V((s * 0.1, 0.0, 0.05)), (0.24, 0.24, 0.2), (0.3, s * 0.4, 0.2))
        R('siderock.' + n, J['chest'] + V((s * 0.38, 0.05, -0.12)), (0.2, 0.26, 0.3), (0.2, s * 0.2, s * 0.3))
        R('foot.' + n, an.lerp(to, 0.5) + V((0, -0.02, -0.04)), (0.2, 0.3, 0.1), (0, 0, s * 0.05))
    # crystals grown out of the back and one shoulder: amber, lit from inside
    for i, (b, d, r) in enumerate(((V((0.12, 0.42, 2.1)), V((0.15, 0.4, 0.55)), 0.09), (V((-0.1, 0.42, 1.98)), V((-0.2, 0.42, 0.45)), 0.08),
                                   (V((0.0, 0.4, 1.85)), V((0.02, 0.5, 0.3)), 0.07), (V((-0.24, 0.32, 2.2)), V((-0.25, 0.25, 0.32)), 0.06),
                                   (V((0.95, 0.1, 2.4)), V((0.2, 0.05, 0.42)), 0.075), (V((1.0, 0.22, 2.32)), V((0.3, 0.2, 0.28)), 0.055))):
        P[f'crystal{i}'] = spike(f'crystal{i}', b, b + d, r, n=4, power=0.6, sub=0)
    return P

rocks = build_rocks()

def build_glow():
    g = {}
    for s, n in SIDES:
        ob = orb('eye.' + n, J['head'] + V((s * 0.075, -0.2, 0.02)), (0.04, 0.015, 0.022), rot=(0, s * -0.25, s * 0.15))
        sit_on(ob, rocks['headrock'], gap=-0.004)
        g['eye.' + n] = (ob, 'head')
    # the rune in the chest stone: a circle and a bar, cut in and lit
    # the rune: algiz, a stave with two arms raised, cut into the chest stone and lit
    c = J['chest'] + V((0, -0.5, 0.2))
    bars = [box('rb0', c, (0.03, 0.02, 0.36), bevel=0.005)]
    for s in (1, -1):
        bars.append(box('rb', c + V((s * 0.075, 0, 0.1)), (0.028, 0.02, 0.2), rot=(0, s * 0.75, 0), bevel=0.005))
    rune = join(bars, 'rune')
    sit_on(rune, rocks['chestrock'], gap=-0.008)
    g['rune'] = (rune, 'chest')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'core', ('smooth', None)
    if name.startswith('crystal'): return 'crystal', (('smooth', {'chest', 'upperarm.L'}) if name in ('crystal4', 'crystal5') else ('rigid', 'chest'))
    bone = {'chestrock': 'chest', 'backrock': 'chest', 'pelvisrock': 'hips', 'headrock': 'head', 'jawrock': 'head'}.get(name)
    if bone: return 'stone', ('rigid', bone)
    if name.startswith('belly'): return 'stone', ('rigid', 'spine')
    if name.startswith('shoulderrock'): return 'stone', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith(('fist', 'knuckle')): return 'stone', ('rigid', 'hand.' + side)
    if name.startswith('hiprock'): return 'stone', ('smooth', {'hips', 'thigh.' + side})
    if name.startswith('siderock'): return 'stone', ('rigid', 'chest')
    part = name.split('.')[0].rstrip('01')
    if part in ('upperarm', 'forearm', 'thigh', 'shin', 'foot'): return 'stone', ('rigid', part + '.' + side)
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name in ('chestrock', 'backrock'): return 2200
    if name.startswith(('shoulderrock', 'fist')): return 1500
    if name.startswith('crystal'): return min(tris, 200)
    return min(tris, 900)

MATS = {
    'stone': mat_stone('stone', [(0.25, (0.13, 0.12, 0.11)), (0.55, (0.27, 0.25, 0.22)), (0.85, (0.4, 0.37, 0.32))], moss=(0.12, 0.2, 0.06), scale=2.2),
    'core': mat_stone('core', [(0.3, (0.06, 0.05, 0.05)), (0.7, (0.14, 0.11, 0.09))], glow=(1.0, 0.55, 0.15), scale=4.0, glow_width=0.06),
    'crystal': mat_plain('crystal', (0.9, 0.55, 0.18), 0.15, emit=(1.0, 0.5, 0.12), bump=0.05, scale=8.0),
}
FLAT = {'stone': (0.3, 0.28, 0.25, 0.9, 0), 'core': (0.3, 0.12, 0.05, 0.8, 0), 'crystal': (0.9, 0.55, 0.18, 0.2, 0)}

def idle(t):
    p = idle_pose(t, T=5.5, k=0.7)   # slow: a mountain breathing
    for n in ('L', 'R'):
        p['upperarm.' + n] = (0.03 * math.sin(TAU * t / 5.5), (-0.1 if n == 'L' else 0.1), 0)
        p['forearm.' + n] = (-0.2, 0, 0)
    return p

finish('Golem', OUT, J, BONES, {'body_high': core, **rocks}, glow, part_info, MATS, FLAT, tri_target, (1.0, 0.7, 0.3),
       idle=idle, roar=lambda t: roar_pose(t, idle), mid=0.2, emit_strength=4.0)
