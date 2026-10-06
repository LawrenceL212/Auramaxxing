# The Void Warden (B-rank gate): a guardian built to outlast. Full plate over a body of void,
# a great helm with a burning slit, a void core set in the breastplate, a tower shield and a
# halberd, two halo rings turning behind it. ~3.4 m.
#   python3.11 void_warden.py --bake --out ../../void-warden.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(41)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'void-warden.glb'))

J = {'pelvis': V((0, 0.02, 1.22)), 'waist': V((0, 0.03, 1.48)), 'chest': V((0, 0.0, 1.86)), 'upchest': V((0, 0.02, 2.08)),
     'neck': V((0, -0.0, 2.26)), 'head': V((0, -0.03, 2.44)), 'crown': V((0, -0.02, 2.66))}
mirrored(J, {'shoulder': (0.54, 0.04, 2.1), 'elbow': (0.74, 0.08, 1.62), 'wrist': (0.8, -0.12, 1.24), 'knuckle': (0.82, -0.22, 1.12),
             'hip': (0.24, 0.02, 1.16), 'knee': (0.3, -0.05, 0.64), 'ankle': (0.32, 0.06, 0.13), 'toe': (0.34, -0.28, 0.05)})
BONES = human_bones()

def build_body():
    t = Tree()
    pel = t.add(J['pelvis'], (0.3, 0.24))
    wai = t.add(J['waist'], (0.28, 0.22), pel)
    che = t.add(J['chest'], (0.42, 0.3), wai)
    up = t.add(J['upchest'], (0.46, 0.3), che)
    nk = t.add(J['neck'], 0.16, up)
    t.add(J['head'], (0.16, 0.19), nk)
    for s, n in SIDES:
        sh = t.add(J['shoulder.' + n], 0.2, up)
        el = t.add(J['elbow.' + n], 0.15, sh)
        wr = t.add(J['wrist.' + n], 0.12, el)
        t.add(J['knuckle.' + n], (0.12, 0.08), wr)
        hp = t.add(J['hip.' + n], 0.2, pel)
        kn = t.add(J['knee.' + n], 0.15, hp)
        an = t.add(J['ankle.' + n], 0.11, kn)
        t.add(J['toe.' + n], (0.1, 0.06), an)
    B = [t.build('skin')]
    for s, n in SIDES:
        sh, el = J['shoulder.' + n], J['elbow.' + n]
        B += [blob(sh + V((s * 0.04, 0, 0.03)), (0.24, 0.23, 0.2)), blob(V((s * 0.21, -0.18, 1.92)), (0.23, 0.12, 0.17), (0.25, 0, s * 0.2)),
              blob(sh.lerp(el, 0.5), (0.15, 0.15, 0.24), (0.1, s * -0.4, 0)), blob(el.lerp(J['wrist.' + n], 0.3), (0.14, 0.14, 0.2), (0.3, s * -0.2, 0)),
              blob(J['hip.' + n].lerp(J['knee.' + n], 0.45), (0.19, 0.19, 0.3)), blob(J['knee.' + n].lerp(J['ankle.' + n], 0.3) + V((0, 0.05, 0)), (0.13, 0.14, 0.2))]
    body = remesh(B, 'body_high', voxel=0.016, smooth=6)
    return body

body = build_body()

def build_armour():
    P = {}
    P['cuirass'] = extract(body, 'cuirass', lambda p: 1.4 < p.z < 2.22 and abs(p.x) < 0.45 - max(0, p.z - 2.0) * 0.5, push=0.05, thick=0.05, smooth=6)
    P['fauld'] = extract(body, 'fauld', lambda p: 1.16 < p.z < 1.44 and abs(p.x) < 0.5, push=0.08, thick=0.04, smooth=4)
    P['gorget'] = extract(body, 'gorget', lambda p: 2.12 < p.z < 2.32 and abs(p.x) < 0.3, push=0.07, thick=0.04, smooth=6)
    # the great helm: a tall smooth barrel over the head
    P['helm'] = shell('helm', J['head'] + V((0, -0.03, 0.06)), (0.2, 0.23, 0.27), thick=0.03)
    P['crest'] = tube('crest', [V((0, -0.2, 2.5)), V((0, -0.16, 2.72)), V((0, 0.0, 2.82)), V((0, 0.2, 2.76)), V((0, 0.34, 2.56))],
                      [0.02, 0.03, 0.035, 0.03, 0.01], flat=4.0)
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        P['rerebrace.' + n] = extract(body, 'rerebrace.' + n, lambda p, sh=sh, el=el, s=s: s * p.x > 0.5 and near_seg(p, sh, el, 0.35, 0.95), push=0.04, thick=0.035)
        P['vambrace.' + n] = extract(body, 'vambrace.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.5 and near_seg(p, el, wr, 0.1, 1.05), push=0.045, thick=0.035)
        P['gauntlet.' + n] = extract(body, 'gauntlet.' + n, lambda p, wr=wr, kn=kn, s=s: near_seg(p, wr, kn, 0.0, 1.6, 0.2) and s * p.x > 0.6, push=0.03, thick=0.03, smooth=2)
        P['cuisse.' + n] = extract(body, 'cuisse.' + n, lambda p, hp=hp, ke=ke, s=s: s * p.x > 0.04 and near_seg(p, hp, ke, 0.1, 0.9) and p.z < 1.14, push=0.04, thick=0.04)
        P['greave.' + n] = extract(body, 'greave.' + n, lambda p, ke=ke, an=an, s=s: s * p.x > 0.08 and near_seg(p, ke, an, 0.1, 1.15) and p.z > 0.04, push=0.04, thick=0.04)
        # pauldrons: four broad rounded lames, the top one rimmed in gold
        out = V((s * 0.6, 0.04, 2.16))
        for i, sc in enumerate((1.0, 0.9, 0.8)):
            P[f'pauldron{i}.' + n] = shell(f'pauldron{i}.' + n, out + V((s * 0.05 * i, 0, -0.1 * i)), (0.33 * sc, 0.31 * sc, 0.19 * sc),
                                       rot=(0, s * (0.3 + 0.16 * i), 0), cut=lambda c: c.z > -0.15, thick=0.045)
        P['prim.' + n] = ring('prim.' + n, out + V((0, 0, -0.02)), 0.3, 0.02, rot=(0, s * 0.3, 0), flat=1.0)
        P['kneecop.' + n] = shell('kneecop.' + n, ke + V((0, -0.15, 0.02)), (0.15, 0.09, 0.15), cut=lambda c: c.y < 0.3)
        P['couter.' + n] = shell('couter.' + n, el + V((s * 0.02, 0.1, 0)), (0.15, 0.1, 0.15), cut=lambda c: c.y > -0.3)
    # tassets over the thighs, and a long tabard front and back between them
    for i, ax in enumerate((-0.32, 0.32)):
        P[f'tasset{i}'] = box(f'tasset{i}', (ax, -0.3 + abs(ax) * 0.22, 1.02), (0.22, 0.04, 0.34), rot=(-0.15, 0, -ax * 0.6), bevel=0.014)
    for tag, y0, sg in (('front', -0.3, -1), ('back', 0.3, 1)):
        P['tabard.' + tag] = cloth('tabard.' + tag, 8, 16, lambda u, t, y0=y0, sg=sg: (u * (0.2 + t * 0.05), y0 + sg * (t * 0.08 - u * u * 0.06), 1.36 - t * 0.98),
                                   thick=0.02, torn=hem(2.0 if tag == 'front' else 6.0, 0.06))
    # the core frame: a gold ring set into the breastplate
    P['coreframe'] = ring('coreframe', J['chest'] + V((0, -0.36, 0.06)), 0.12, 0.03, rot=(math.pi / 2, 0, 0), flat=1.0)
    sit_on(P['coreframe'], P['cuirass'], gap=-0.01)
    # the tower shield, on the left forearm: a tall curved slab, rimmed, a boss in the middle
    sc = J['elbow.L'].lerp(J['wrist.L'], 0.5) + V((0.05, -0.3, -0.05))
    bm = bmesh.new()
    nx, nz = 10, 16
    rows = []
    for j in range(nz + 1):
        tz = j / nz
        row = []
        for i in range(nx + 1):
            u = i / nx * 2 - 1
            w = 0.36 * (1 - 0.25 * max(0, tz - 0.8) / 0.2 * abs(u))
            x = sc.x + u * w
            y = sc.y + (u * u) * 0.12
            z = sc.z + 0.85 - tz * 1.7 - (0.12 if (j == nz) else 0) * (1 - abs(u))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    sh = mesh_from_bm('shield', bm)
    so = sh.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.06; so.offset = 0
    bv = sh.modifiers.new('bv', 'BEVEL'); bv.width = 0.015; bv.segments = 2
    apply_mods(sh); smooth_shade(sh)
    P['shield'] = sh
    # gold rim down both edges and a boss in the centre
    for sg in (1, -1):
        P[f'srim{sg}'] = tube(f'srim{sg}', [V((sc.x + sg * 0.36, sc.y + 0.1, sc.z + 0.85 - k * 0.3)) for k in range(6)], [0.03] * 6, sub=1)
    P['sboss'] = shell('sboss', V((sc.x, sc.y - 0.02, sc.z + 0.05)), (0.15, 0.05, 0.15), cut=lambda c: c.y < 0.1, thick=0.02)
    # the halberd, held upright in the right hand: a long haft, an axe blade, a spike and a hook
    g = J['wrist.R'].lerp(J['knuckle.R'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((0, -0.05, 1.6)), g + V((0, 0.03, -1.05))
    P['haft'] = tube('haft', [bot, bot.lerp(top, 0.5), top], [0.03, 0.028, 0.026], sub=1)
    head = top + V((0, 0, -0.15))
    bm = bmesh.new()
    prof = [(0.0, 0.18), (0.38, 0.32), (0.44, 0.05), (0.38, -0.32), (0.0, -0.12)]
    vs = [bm.verts.new((-0.03 * 0 + 0.0 + head.x, head.y - y * 0 - x, head.z + y)) for x, y in prof]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.x += 0.03
    for v in bm.verts:
        v.co.x -= 0.015
    ax = mesh_from_bm('axe', bm)
    bv = ax.modifiers.new('bv', 'BEVEL'); bv.width = 0.008; bv.segments = 2
    apply_mods(ax); smooth_shade(ax)
    P['axe'] = ax
    P['spike'] = spike('hspike', top, top + V((0, -0.02, 0.45)), 0.045, flat=0.4)
    P['hook'] = spike('hook', head + V((0, 0.03, 0.05)), head + V((0, 0.3, 0.2)), 0.04, curve=V((0, 0, -0.06)), flat=0.3)
    P['ferrule'] = spike('ferrule', bot, bot + V((0, 0, -0.18)), 0.04)
    # two halo rings turning behind the shoulders
    P['halo0'] = ring('halo0', J['upchest'] + V((0, 0.62, 0.35)), 0.72, 0.03, rot=(math.pi / 2 - 0.15, 0, 0), seg=(64, 8), flat=1.5)
    P['halo1'] = ring('halo1', J['upchest'] + V((0, 0.68, 0.35)), 0.58, 0.025, rot=(math.pi / 2 - 0.15, 0.5, 0), seg=(64, 8), flat=1.5)
    for i in range(8):
        a = i / 8 * math.tau
        c = J['upchest'] + V((math.cos(a) * 0.72, 0.62 + math.sin(a) * 0.72 * math.sin(0.15), 0.35 + math.sin(a) * 0.72 * math.cos(0.15)))
        P[f'halospike{i}'] = spike(f'halospike{i}', c, c + V((math.cos(a) * 0.16, 0, math.sin(a) * 0.16)), 0.03, n=4)
    return P

armour = build_armour()

def build_glow():
    g = {}
    # the visor: a T of light across the eyes and down the face
    c = J['head'] + V((0, -0.3, 0.04))
    bars = [box('vis0', c, (0.2, 0.03, 0.025), bevel=0.006), box('vis1', c + V((0, 0, -0.08)), (0.03, 0.03, 0.15), bevel=0.006)]
    vis = join(bars, 'visor')
    sit_on(vis, armour['helm'], gap=0.002)
    g['visor'] = (vis, 'head')
    core = orb('core', J['chest'] + V((0, -0.4, 0.06)), (0.1, 0.06, 0.1))
    sit_on(core, armour['cuirass'], gap=0.0)
    g['core'] = (core, 'chest')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'void', ('smooth', None)
    if name == 'cuirass': return 'plate', ('smooth', {'chest', 'spine'})
    if name == 'fauld': return 'plate', ('rigid', 'hips')
    if name == 'gorget': return 'plate', ('smooth', {'neck', 'chest'})
    if name in ('helm',): return 'plate', ('rigid', 'head')
    if name == 'crest': return 'gold', ('rigid', 'head')
    if name.startswith(('rerebrace', 'couter')): return 'plate', ('rigid', 'upperarm.' + side) if name.startswith('rere') else ('rigid', 'forearm.' + side)
    if name.startswith('vambrace'): return 'plate', ('rigid', 'forearm.' + side)
    if name.startswith('gauntlet'): return 'plate', ('rigid', 'hand.' + side)
    if name.startswith('cuisse'): return 'plate', ('rigid', 'thigh.' + side)
    if name.startswith(('greave', 'kneecop')): return 'plate', ('rigid', 'shin.' + side)
    if name.startswith('pauldron'): return 'plate', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('prim'): return 'gold', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('tasset'): return 'plate', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name.startswith('tabard'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'coreframe': return 'gold', ('rigid', 'chest')
    if name in ('shield',): return 'plate', ('rigid', 'forearm.L')
    if name.startswith('srim'): return 'gold', ('rigid', 'forearm.L')
    if name == 'sboss': return 'plate', ('rigid', 'forearm.L')
    if name in ('haft',): return 'void', ('rigid', 'hand.R')
    if name in ('axe', 'spike', 'hook', 'ferrule'): return 'plate', ('rigid', 'hand.R')
    if name.startswith('halo'): return ('gold' if name == 'halo0' or name.startswith('halospike') else 'void'), ('rigid', 'chest')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name in ('cuirass',): return 4000
    if name in ('helm', 'fauld', 'shield'): return 2400
    if name.startswith(('pauldron', 'vambrace', 'cuisse', 'greave', 'rerebrace')): return 1100
    if name.startswith('halo') and not name.startswith('halospike'): return 1000
    return min(tris, 600)

MATS = {
    'plate': mat_metal('plate', (0.13, 0.12, 0.17), (0.6, 0.58, 0.7), rough=0.3, engrave=(0.62, 0.42, 1.0)),
    'gold': mat_metal('gold', (0.7, 0.48, 0.2), (1.0, 0.85, 0.55), rough=0.28),
    'void': mat_hide('void', [(0.3, (0.02, 0.01, 0.04)), (0.8, (0.08, 0.04, 0.14))], fissure=(0.6, 0.3, 1.0), scale=30.0, big=6.0, rough=(0.5, 0.3)),
    'cloth': mat_cloth('cloth', 0.3, 1.4, [(0.0, (0.03, 0.015, 0.05)), (0.5, (0.12, 0.05, 0.22)), (1.0, (0.2, 0.08, 0.34))]),
}
FLAT = {'plate': (0.2, 0.19, 0.26, 0.3, 1), 'gold': (0.8, 0.55, 0.22, 0.3, 1), 'void': (0.06, 0.03, 0.1, 0.4, 0), 'cloth': (0.15, 0.06, 0.26, 0.85, 0)}

def idle(t):
    p = idle_pose(t, T=5.0, k=0.6)   # patient, barely moving
    p['upperarm.L'] = (0.1, -0.05, 0); p['forearm.L'] = (-0.45, 0, 0)
    p['upperarm.R'] = (0.05, 0.06, 0); p['forearm.R'] = (-0.25, 0, 0)
    return p

finish('VoidWarden', OUT, J, BONES, {'body_high': body, **armour}, glow, part_info, MATS, FLAT, tri_target, (0.62, 0.44, 1.0),
       idle=idle, roar=lambda t: roar_pose(t, idle))
