# The Serpent (the weekly Coiled Serpent and Iron Serpent): a naga. A lean scaled torso and clawed
# arms rise out of a great snake tail coiled on the floor; a viper's head with long fangs under a
# flared cobra hood marked with glowing eyespots; bronze bracers and a glaive. ~3.3 m when reared.
#   python3.11 serpent.py --bake --out ../../serpent.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(61)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'serpent.glb'))

J = {'pelvis': V((0, 0.0, 1.42)), 'waist': V((0, 0.0, 1.66)), 'chest': V((0, -0.04, 2.02)), 'upchest': V((0, -0.04, 2.24)),
     'neck': V((0, -0.1, 2.42)), 'head': V((0, -0.2, 2.6)), 'crown': V((0, -0.2, 2.8))}
# the legs' bones are kept (the clips drive them) but sit inside the tail's root, holding nothing
mirrored(J, {'shoulder': (0.48, -0.02, 2.24), 'elbow': (0.78, 0.04, 1.8), 'wrist': (0.86, -0.16, 1.38), 'knuckle': (0.88, -0.24, 1.24),
             'hip': (0.1, 0.0, 1.38), 'knee': (0.1, 0.0, 1.2), 'ankle': (0.1, 0.0, 1.05), 'toe': (0.1, -0.05, 1.0)})
H = J['head']

# the tail: down from the hips, round the body in a coil on the floor, the tip lifting behind
def tail_path():
    pts = [V((0, 0.02, 1.5)), V((0, 0.02, 1.18)), V((0.0, -0.04, 0.8)), V((0.05, -0.12, 0.45)), V((0.18, -0.2, 0.2))]
    c, R = V((0.0, 0.42, 0.17)), 0.68
    a0 = math.atan2(-0.2 - c.y, 0.18) + 0.25
    for k in range(1, 15):
        a = a0 + k * 0.42
        r = R - k * 0.012
        pts.append(V((c.x + math.cos(a) * r, c.y + math.sin(a) * r, 0.17 + max(0, k - 9) * 0.07)))
    pts += [pts[-1] + V((-0.12, 0.08, 0.28)), pts[-1] + V((-0.18, 0.2, 0.55))]
    return pts
TP = tail_path()
TR = [0.2, 0.21, 0.21, 0.2, 0.19] + [0.185 - k * 0.0095 for k in range(1, 15)] + [0.035, 0.012]
# tail bones every few points along the path
TB = [0, 2, 4, 7, 10, 13, 16, 20]
for i, k in enumerate(TB):
    J[f't{i}'] = TP[k]
BONES = human_bones() + [(f'tail{i}', f't{i}', f't{i + 1}', 'hips' if i == 0 else f'tail{i - 1}') for i in range(len(TB) - 1)]
TAIL = {f'tail{i}' for i in range(len(TB) - 1)}

def build_body():
    t = Tree()
    pel = t.add(J['pelvis'], (0.2, 0.17))
    wai = t.add(J['waist'], (0.2, 0.16), pel)
    che = t.add(J['chest'], (0.34, 0.24), wai)
    up = t.add(J['upchest'], (0.38, 0.24), che)
    nk = t.add(J['neck'], (0.12, 0.13), up)
    hd = t.add(H, (0.13, 0.15), nk)
    # the viper's head: a broad flat wedge, the snout narrowing forward, the lower jaw a little open
    sn = t.add(H + V((0, -0.2, -0.03)), (0.11, 0.07), hd)
    t.add(H + V((0, -0.34, -0.05)), (0.06, 0.045), sn)
    jw = t.add(H + V((0, -0.1, -0.1)), (0.1, 0.05), hd)
    t.add(H + V((0, -0.3, -0.16)), (0.05, 0.03), jw)
    for s, n in SIDES:
        sh = t.add(J['shoulder.' + n], 0.15, up)
        el = t.add(J['elbow.' + n], 0.1, sh)
        wr = t.add(J['wrist.' + n], 0.08, el)
        palm = t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.6), (0.08, 0.05), wr)
        d = (J['knuckle.' + n] - J['wrist.' + n]).normalized()
        for i in range(4):
            off = V((0, -0.06 + i * 0.04, 0))
            k1 = t.add(J['knuckle.' + n] + off, 0.024, palm)
            t.add(J['knuckle.' + n] + off + d * 0.09 + V((0, -0.03, 0)), 0.019, k1)
        t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.35) + V((-s * 0.05, -0.07, 0)), 0.026, palm)
    B = [t.build('skin')]
    for s, n in SIDES:
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        B += [blob(sh + V((s * 0.03, 0, 0.02)), (0.18, 0.17, 0.15)), blob(V((s * 0.17, -0.2, 2.08)), (0.18, 0.1, 0.13), (0.25, 0, s * 0.2)),
              blob(V((s * 0.17, 0.14, 2.3)), (0.18, 0.1, 0.1), (0, 0, s * -0.4)), blob(V((s * 0.18, 0.12, 1.94)), (0.16, 0.11, 0.24), (0, s * 0.2, 0)),
              blob(sh.lerp(el, 0.5) + V((0, -0.04, 0)), (0.11, 0.11, 0.2), (0.1, s * -0.5, 0)), blob(el.lerp(wr, 0.3), (0.1, 0.1, 0.16), (0.3, s * -0.2, 0)),
              blob(H + V((s * 0.09, -0.06, 0.05)), (0.06, 0.09, 0.04), (0.2, 0, s * 0.35))]     # the brow scale over each eye
        for i in range(3):
            B.append(blob(V((s * 0.07, -0.15, 1.6 + i * 0.1)), (0.065, 0.05, 0.05)))
    body = remesh(B, 'body_high', voxel=0.012, smooth=6)
    return body

body = build_body()

def build_gear():
    P = {}
    P['tail'] = tube('tail', TP, TR, flat=0.85, sub=2)
    # belly plates: broad pale scutes down the front of the torso, ridged
    P['belly'] = extract(body, 'belly', lambda p: 1.42 < p.z < 2.0 and abs(p.x) < 0.12 and p.y < -0.06, push=0.012, thick=0.012, smooth=3)
    # the cobra hood: a flared fan behind the head and neck, ribbed
    def hood(u, t):
        a = u * 1.25
        w = 0.12 + 0.36 * math.sin(min(1, t * 1.15) * math.pi) ** 0.8
        z = H.z + 0.2 - t * 0.62
        return (math.sin(a) * w, -0.02 + math.cos(a) * 0.06 + (u * u) * 0.12 - 0.04 * (1 - t), z)
    P['hood'] = cloth('hood', 16, 14, hood, thick=0.03)
    for i, u in enumerate((-0.85, -0.5, -0.17, 0.17, 0.5, 0.85)):   # the ribs that spread it
        P[f'hoodrib{i}'] = tube(f'hoodrib{i}', [V(hood(u * 0.25, 0.0)), V(hood(u * 0.8, 0.45)), V(hood(u, 0.85))], [0.02, 0.016, 0.006], sub=2)
    # fangs, long and curved, and a crest of horn-scales down the back of the head
    for s, n in SIDES:
        P['fang.' + n] = spike('fang.' + n, H + V((s * 0.05, -0.3, -0.07)), H + V((s * 0.045, -0.33, -0.24)), 0.018, curve=V((0, 0.03, 0)))
        P['brow.' + n] = spike('brow.' + n, H + V((s * 0.09, -0.08, 0.08)), H + V((s * 0.16, 0.1, 0.16)), 0.03, curve=V((0, 0, 0.03)))
    for i in range(5):
        b = H + V((0, 0.02 + i * 0.07, 0.12 - i * 0.05))
        P[f'crest{i}'] = spike(f'crest{i}', b, b + V((0, 0.07, 0.1 - i * 0.012)), 0.03 - i * 0.003, n=4)
    # tail spikes along the coil's ridge, and a barbed tip
    for i, k in enumerate(range(6, 19, 2)):
        b = TP[k] + V((0, 0, TR[k] * 0.85))
        P[f'tspike{i}'] = spike(f'tspike{i}', b, b + V((0, 0, 0.12)) + (TP[k + 1] - TP[k]).normalized() * 0.08, 0.04, n=4)
    P['barb'] = spike('barb', TP[-1], TP[-1] + (TP[-1] - TP[-2]).normalized() * 0.3, 0.05, flat=0.3, n=5)
    # bronze: a belt hiding the seam where the torso meets the tail, bracers, a torc
    P['belt'] = extract(body, 'belt', lambda p: 1.4 < p.z < 1.56, push=0.06, thick=0.04, smooth=4)
    P['torc'] = ring('torc', J['neck'] + V((0, 0.0, -0.08)), 0.15, 0.025, rot=(0.3, 0, 0), flat=1.0)
    for s, n in SIDES:
        el, wr = J['elbow.' + n], J['wrist.' + n]
        P['bracer.' + n] = extract(body, 'bracer.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.4 and near_seg(p, el, wr, 0.35, 0.95), push=0.03, thick=0.025)
        P['armband.' + n] = ring('armband.' + n, J['shoulder.' + n].lerp(el, 0.55), 0.11, 0.02, rot=(el - J['shoulder.' + n]).to_track_quat('Z', 'Y').to_euler(), flat=2.0)
    # a loin wrap over the belt
    P['loin'] = cloth('loin', 8, 10, lambda u, t: (u * (0.17 + t * 0.03), -0.2 - t * 0.05 + u * u * 0.06, 1.5 - t * 0.42), thick=0.016, torn=hem(4.0, 0.08))
    # the glaive in the right hand: a long haft, a curved blade, a hook behind
    g = J['wrist.R'].lerp(J['knuckle.R'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((0, -0.04, 1.3)), g + V((0, 0.02, -0.9))
    P['haft'] = tube('haft', [bot, bot.lerp(top, 0.5), top], [0.026, 0.024, 0.022], sub=1)
    P['glaive'] = spike('glaive', top + V((0, 0, -0.04)), top + V((0, -0.12, 0.6)), 0.09, curve=V((0, 0.12, 0)), flat=0.12, power=0.7)
    P['ghook'] = spike('ghook', top + V((0, 0.02, 0.0)), top + V((0, 0.2, 0.12)), 0.035, curve=V((0, 0, -0.04)), flat=0.3)
    return P

gear = build_gear()

def build_glow():
    g = {}
    for s, n in SIDES:
        ob = orb('eye.' + n, H + V((s * 0.085, -0.13, 0.03)), (0.04, 0.016, 0.02), rot=(0, s * -0.55, s * -0.3))
        sit_on(ob, body, gap=0.003)
        g['eye.' + n] = (ob, 'head')
        # eyespots on the hood, the cobra's warning
        for i, (u, t, r) in enumerate(((0.55, 0.35, 0.045), (0.75, 0.55, 0.035), (0.6, 0.72, 0.028))):
            a = s * u * 1.25
            w = 0.12 + 0.36 * math.sin(min(1, t * 1.15) * math.pi) ** 0.8
            c = V((math.sin(a) * w, -0.02 + math.cos(a) * 0.06 + (u * u) * 0.12 - 0.04 * (1 - t) - 0.025, H.z + 0.2 - t * 0.62))
            g[f'spot{i}.' + n] = (orb(f'spot{i}.' + n, c, (r, 0.01, r * 1.3)), 'neck')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'scales', ('smooth', None)
    if name == 'tail': return 'scales', ('smooth', TAIL | {'hips'})
    if name == 'belly': return 'belly', ('smooth', {'hips', 'spine', 'chest'})
    if name.startswith(('hood', 'crest')): return ('hood' if name == 'hood' else 'horn'), ('smooth', {'neck', 'head', 'chest'}) if name.startswith('hood') else ('rigid', 'head')
    if name.startswith(('fang', 'brow')): return 'horn', ('rigid', 'head')
    if name.startswith('tspike') or name == 'barb':
        c = parts[name].data.vertices[0].co
        near = min(TAIL, key=lambda b: (c - J['t' + b[4:]]).length)
        return 'horn', ('rigid', near)
    if name == 'belt': return 'bronze', ('rigid', 'hips')
    if name == 'torc': return 'bronze', ('rigid', 'neck')
    if name.startswith('bracer'): return 'bronze', ('rigid', 'forearm.' + side)
    if name.startswith('armband'): return 'bronze', ('rigid', 'upperarm.' + side)
    if name == 'loin': return 'cloth', ('smooth', {'hips', 'tail0'})
    if name == 'haft': return 'cloth', ('rigid', 'hand.R')
    if name in ('glaive', 'ghook'): return 'bronze', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 15000
    if name == 'tail': return 7000
    if name == 'hood': return 2200
    if name in ('belt', 'belly'): return 1200
    if name.startswith('bracer'): return 800
    return min(tris, 400)

MATS = {
    'scales': mat_hide('scales', [(0.3, (0.02, 0.05, 0.035)), (0.55, (0.05, 0.13, 0.08)), (0.8, (0.12, 0.24, 0.12))], scale=34.0, big=10.0, rough=(0.55, 0.3), bump=(0.7, 0.5)),
    'belly': mat_horn('belly', 1.4, 2.0, [(0.0, (0.5, 0.42, 0.24)), (1.0, (0.7, 0.62, 0.4))], rough=0.5, bands=60.0),
    'hood': mat_skin('hood', [(0.3, (0.03, 0.08, 0.05)), (0.6, (0.1, 0.2, 0.1)), (0.85, (0.32, 0.3, 0.12))], pores=40.0, wrinkle=6.0, rough=0.55),
    'horn': mat_horn('horn', 0.0, 2.9, [(0.0, (0.05, 0.04, 0.03)), (0.6, (0.2, 0.16, 0.1)), (1.0, (0.7, 0.64, 0.5))]),
    'bronze': mat_metal('bronze', (0.5, 0.3, 0.12), (0.95, 0.75, 0.45), rough=0.3, engrave=(0.12, 0.3, 0.2)),
    'cloth': mat_cloth('cloth', 1.0, 1.6, [(0.0, (0.02, 0.04, 0.03)), (1.0, (0.08, 0.16, 0.12))]),
}
FLAT = {'scales': (0.05, 0.13, 0.08, 0.4, 0), 'belly': (0.6, 0.52, 0.32, 0.5, 0), 'hood': (0.1, 0.2, 0.1, 0.55, 0),
        'horn': (0.3, 0.24, 0.2, 0.45, 0), 'bronze': (0.7, 0.45, 0.2, 0.3, 1), 'cloth': (0.05, 0.1, 0.08, 0.85, 0)}

def idle(t):
    T = 3.2
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=1.3)
    # swaying, as a snake rears: the torso weaves side to side, the head stays level
    p['hips'] = (0, 0.06 * s, 0.05 * c)
    p['spine'] = (0.04, -0.05 * s, -0.04 * c)
    p['chest'] = (0.02, -0.03 * s, -0.02 * c)
    p['head'] = (0.08, 0.08 * s, 0.06 * c)
    for i in range(len(TB) - 1):   # the coil ripples, more toward the tip
        k = i / (len(TB) - 2)
        p[f'tail{i}'] = (0, 0, 0.04 * k * math.sin(TAU * t / T - i * 0.7))
    p['upperarm.L'] = (0.05 * s, -0.12, 0); p['upperarm.R'] = (0.05 * s, 0.1, 0)
    return p

def roar(t):
    p = roar_pose(t, idle)
    b = p['_b']
    p['head'] = (p['head'][0] - 0.1 * b, p['head'][1], p['head'][2])   # the head rears back to strike
    return p

parts = {'body_high': body, **gear}
finish('Serpent', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, (0.45, 1.0, 0.55),
       idle=idle, roar=roar, mid=0.06)
