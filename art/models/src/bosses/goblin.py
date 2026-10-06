# The Goblin Scout (E-rank gate): small, hunched and wiry, big head and long ears, scrappy leather,
# a hood thrown back and a rusted knife. Built at goblin size (~1.5 m); the registry scales it.
#   python3.11 goblin.py --bake --out ../../goblin.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(11)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'goblin.glb'))

J = {'pelvis': V((0, 0.05, 0.62)), 'waist': V((0, 0.02, 0.78)), 'chest': V((0, -0.04, 0.97)), 'upchest': V((0, -0.11, 1.1)),
     'neck': V((0, -0.2, 1.18)), 'head': V((0, -0.29, 1.27)), 'crown': V((0, -0.31, 1.5))}
mirrored(J, {'shoulder': (0.22, -0.09, 1.08), 'elbow': (0.34, -0.06, 0.82), 'wrist': (0.4, -0.2, 0.58), 'knuckle': (0.42, -0.27, 0.47),
             'hip': (0.12, 0.04, 0.6), 'knee': (0.2, -0.12, 0.35), 'ankle': (0.21, 0.04, 0.07), 'toe': (0.23, -0.17, 0.02)})
BONES = human_bones()

def build_body():
    t = Tree()
    pel = t.add(J['pelvis'], (0.15, 0.12))
    wai = t.add(J['waist'], (0.13, 0.11), pel)
    che = t.add(J['chest'], (0.17, 0.13), wai)
    up = t.add(J['upchest'], (0.19, 0.13), che)
    nk = t.add(J['neck'], (0.07, 0.07), up)
    hd = t.add(J['head'], (0.13, 0.14), nk)
    for s, n in SIDES:
        sh = t.add(J['shoulder.' + n], (0.075, 0.075), up)
        el = t.add(J['elbow.' + n], (0.05, 0.05), sh)
        wr = t.add(J['wrist.' + n], (0.04, 0.035), el)
        palm = t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.55), (0.045, 0.028), wr)
        d = (J['knuckle.' + n] - J['wrist.' + n]).normalized()
        for i in range(3):   # three long clawed fingers and a thumb
            off = V((s * (0.03 - i * 0.03), -0.01, 0))
            k1 = t.add(J['knuckle.' + n] + off, 0.016, palm)
            k2 = t.add(J['knuckle.' + n] + off + d * 0.07 + V((0, -0.025, 0)), 0.013, k1)
            t.add(J['knuckle.' + n] + off + d * 0.12 + V((0, -0.06, 0.0)), 0.006, k2)
        t1 = t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.3) + V((-s * 0.03, -0.04, 0)), 0.016, palm)
        t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.7) + V((-s * 0.05, -0.08, 0)), 0.01, t1)
        hp = t.add(J['hip.' + n], (0.08, 0.08), pel)
        kn = t.add(J['knee.' + n], (0.055, 0.055), hp)
        an = t.add(J['ankle.' + n], (0.04, 0.04), kn)
        ft = t.add(J['ankle.' + n].lerp(J['toe.' + n], 0.5) + V((0, 0, -0.02)), (0.05, 0.03), an)
        for i in range(3):   # long splayed toes
            t.add(J['toe.' + n] + V((s * (0.03 - i * 0.03), -0.03, 0.0)), 0.012, ft)
    base = t.build('skin')
    H = J['head']
    B = [base,
         blob(H + V((0, 0.04, 0.07)), (0.16, 0.17, 0.15)),                         # cranium, big and long
         blob(H + V((0, -0.08, -0.05)), (0.12, 0.1, 0.08), (0.3, 0, 0)),          # jaw, jutting
         blob(H + V((0, -0.12, 0.06)), (0.11, 0.05, 0.035), (0.2, 0, 0)),         # heavy brow
         blob(V((0, 0.02, 0.86)), (0.14, 0.13, 0.12)),                            # pot belly
         ]
    for s, n in SIDES:
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        B += [blob(H + V((s * 0.075, -0.115, 0.0)), (0.045, 0.04, 0.035)),        # cheekbone
              blob(sh + V((s * 0.02, 0, 0.01)), (0.08, 0.075, 0.07)),            # deltoid, knotty
              blob(sh.lerp(el, 0.5), (0.05, 0.05, 0.1), (0.1, s * -0.3, 0)),     # wiry arm
              blob(el.lerp(wr, 0.3), (0.048, 0.048, 0.08), (0.3, s * -0.2, 0)),
              blob(J['hip.' + n].lerp(J['knee.' + n], 0.45), (0.07, 0.07, 0.11)),
              blob(J['knee.' + n].lerp(J['ankle.' + n], 0.3) + V((0, 0.03, 0)), (0.045, 0.05, 0.08)),
              blob(V((s * 0.07, -0.13, 1.0)), (0.08, 0.04, 0.06), (0.2, 0, 0))]  # pectoral, flat
        for i in range(3):   # ribs showing down the flank
            B.append(blob(V((s * 0.14, -0.06, 0.98 - i * 0.055)), (0.035, 0.09, 0.012), (0.3, 0, s * 0.4)))
    # the ears: long, flat and swept back, as much of the silhouette as the head
    for s, n in SIDES:
        B.append(spike('ear.' + n, H + V((s * 0.13, 0.0, 0.06)), H + V((s * 0.46, 0.12, 0.2)), 0.07, curve=V((0, 0.03, 0.03)), flat=0.28, power=0.9))
    # the nose: long and hooked
    B.append(spike('nose', H + V((0, -0.16, 0.02)), H + V((0, -0.3, -0.06)), 0.04, curve=V((0, -0.02, 0.03)), power=0.8))
    body = remesh(B, 'body_high', voxel=0.008, smooth=5)
    displace(body, scale=28.0, amount=0.0025)
    return body

body = build_body()
H = J['head']

def build_gear():
    P = {}
    # jerkin: patched leather over the torso, open at the throat
    P['jerkin'] = extract(body, 'jerkin', lambda p: 0.66 < p.z < 1.08 and abs(p.x) < 0.2 - max(0, p.z - 1.0) * 0.8 and not (p.y < -0.12 and p.z > 1.0), push=0.018, thick=0.018, smooth=3)
    P['belt'] = extract(body, 'belt', lambda p: 0.66 < p.z < 0.72 and abs(p.x) < 0.24, push=0.03, thick=0.02, smooth=2)
    # hood thrown back: a cowl around the shoulders and the back of the skull, the ears through it
    P['hood'] = extract(body, 'hood', lambda p: (p.z > 1.06 and p.y > -0.24 and abs(p.x) < 0.3 and p.z < 1.38 and not (abs(p.x) > 0.15 and p.z > 1.24)), push=0.03, thick=0.016, smooth=5)
    for s, n in SIDES:
        el, wr, kn, an = J['elbow.' + n], J['wrist.' + n], J['knee.' + n], J['ankle.' + n]
        # cloth wraps on the forearms and shins
        P['wrap.' + n] = extract(body, 'wrap.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.25 and near_seg(p, el, wr, 0.35, 0.95, 0.1), push=0.012, thick=0.01, smooth=2)
        P['legwrap.' + n] = extract(body, 'legwrap.' + n, lambda p, kn=kn, an=an, s=s: s * p.x > 0.08 and near_seg(p, kn, an, 0.25, 0.95, 0.1), push=0.012, thick=0.01, smooth=2)
    # one battered pauldron, riveted, on the knife side
    P['pauldron.R'] = shell('pauldron.R', J['shoulder.R'] + V((-0.03, 0, 0.06)), (0.13, 0.12, 0.08), rot=(0, -0.45, 0), cut=lambda c: c.z > -0.15, thick=0.02)
    for k in range(3):
        P[f'rivet{k}.R'] = orb(f'rivet{k}.R', J['shoulder.R'] + V((-0.06 - k * 0.035, -0.07 + k * 0.05, 0.12 - k * 0.012)), (0.012, 0.012, 0.012))
    # loincloth: a ragged front flap and a back flap from the belt
    for tag, y0, sgn in (('front', -0.12, -1), ('back', 0.14, 1)):
        P['loin.' + tag] = cloth('loin.' + tag, 6, 10, lambda u, t, y0=y0, sgn=sgn: (u * (0.1 + t * 0.03), y0 + sgn * (t * 0.03 + u * u * 0.03), 0.68 - t * 0.3),
                                  thick=0.008, torn=hem(1.3 if tag == 'front' else 4.1, 0.08))
    # pouches on the belt
    for k, x in enumerate((0.17, -0.19)):
        P[f'pouch{k}'] = box(f'pouch{k}', (x, -0.02, 0.64), (0.06, 0.05, 0.07), rot=(0, 0, x * 2), bevel=0.012, sub=1)
    # a cord over one shoulder with a few finger bones hung from it
    cord = [J['shoulder.L'] + V((-0.04, -0.09, 0.03)), V((0.06, -0.19, 0.96)), V((-0.08, -0.15, 0.82)), J['hip.R'] + V((0.0, -0.1, 0.1))]
    P['cord'] = tube('cord', cord, [0.008] * 4, sub=2)
    for i, c in enumerate((V((0.06, -0.2, 0.95)), V((0.0, -0.19, 0.9)), V((-0.05, -0.17, 0.86)))):
        P[f'tooth{i}'] = spike(f'tooth{i}', c, c + V((0, -0.01, -0.06)), 0.013)
    # the knife: a rusted, chipped, curved blade held point-down in the right hand
    w, k = J['wrist.R'], J['knuckle.R']
    grip = w.lerp(k, 0.75) + V((0, -0.02, 0))
    P['hilt'] = tube('hilt', [grip + V((0, 0, 0.05)), grip + V((0, 0, -0.05))], [0.016, 0.016], sub=1)
    P['guard'] = box('guard', grip + V((0, 0, -0.055)), (0.07, 0.025, 0.014), bevel=0.005)
    P['blade'] = spike('blade', grip + V((0, 0, -0.06)), grip + V((0.02, -0.11, -0.4)), 0.045, curve=V((0, -0.05, 0)), flat=0.15, power=0.7)
    # a wide mouth under the nose, lower fangs and tusks jutting up out of it
    P['mouth'] = orb('mouth', H + V((0, -0.2, -0.075)), (0.07, 0.03, 0.012), rot=(0.25, 0, 0))
    sit_on(P['mouth'], body, gap=-0.008)
    for i, x in enumerate((-0.03, -0.01, 0.01, 0.03)):
        c = H + V((x, -0.215, -0.085))
        P[f'fang{i}'] = spike(f'fang{i}', c, c + V((0, -0.005, 0.03)), 0.007, n=4)
        sit_on(P[f'fang{i}'], body, gap=-0.004)
    for s, n in SIDES:
        P['tusk.' + n] = spike('tusk.' + n, H + V((s * 0.07, -0.19, -0.1)), H + V((s * 0.11, -0.24, -0.02)), 0.022, curve=V((s * 0.01, -0.01, 0)), n=5)
    return P

gear = build_gear()

def build_glow():
    g = {}
    for s, n in SIDES:
        ob = orb('eye.' + n, H + V((s * 0.058, -0.13, 0.025)), (0.03, 0.012, 0.018), rot=(0, s * -0.3, s * -0.25))
        sit_on(ob, body, gap=0.004)
        g['eye.' + n] = (ob, 'head')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'skin', ('smooth', None)
    if name in ('jerkin',): return 'leather', ('smooth', {'chest', 'spine', 'hips'})
    if name == 'belt' or name.startswith('pouch'): return 'leather', ('rigid', 'hips')
    if name == 'hood': return 'cloth', ('smooth', {'neck', 'chest', 'head'})
    if name.startswith('wrap'): return 'cloth', ('rigid', 'forearm.' + side)
    if name.startswith('legwrap'): return 'cloth', ('rigid', 'shin.' + side)
    if name.startswith(('pauldron', 'rivet')): return 'iron', ('smooth', {'chest', 'upperarm.R'})
    if name.startswith('loin.front'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name.startswith('loin.back'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name.startswith('tooth'): return 'bone', ('rigid', 'chest')
    if name.startswith(('tusk', 'fang')): return 'bone', ('rigid', 'head')
    if name == 'mouth': return 'mouth', ('rigid', 'head')
    if name == 'cord': return 'leather', ('smooth', {'chest', 'spine', 'hips'})
    if name in ('hilt',): return 'leather', ('rigid', 'hand.R')
    if name in ('guard', 'blade'): return 'iron', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 22000
    if name in ('jerkin', 'hood'): return 3000
    if name.startswith('loin'): return 900
    return min(tris, 700)

MATS = {
    'skin': mat_skin('skin', [(0.25, (0.05, 0.08, 0.03)), (0.5, (0.11, 0.15, 0.06)), (0.8, (0.2, 0.22, 0.1))], pores=90.0, wrinkle=14.0, rough=0.5),
    'leather': mat_hide('leather', [(0.3, (0.09, 0.055, 0.035)), (0.6, (0.17, 0.1, 0.06)), (0.85, (0.26, 0.17, 0.1))], scale=48.0, big=14.0, rough=(0.8, 0.55), bump=(0.15, 0.25)),
    'cloth': mat_cloth('cloth', 0.3, 1.3, [(0.0, (0.06, 0.05, 0.035)), (0.6, (0.17, 0.14, 0.09)), (1.0, (0.24, 0.2, 0.13))], rough=0.9, weave=220.0),
    'iron': mat_metal('iron', (0.22, 0.2, 0.19), (0.55, 0.52, 0.48), rough=0.45, rust=((0.22, 0.08, 0.03), (0.45, 0.2, 0.07))),
    'mouth': mat_plain('mouth', (0.08, 0.015, 0.015), 0.4),
    'bone': mat_horn('bone', 0.9, 1.35, [(0.0, (0.35, 0.3, 0.22)), (1.0, (0.78, 0.72, 0.58))], rough=0.55, bands=40.0),
}
FLAT = {'skin': (0.2, 0.24, 0.12, 0.5, 0), 'leather': (0.17, 0.1, 0.06, 0.6, 0), 'cloth': (0.17, 0.14, 0.09, 0.9, 0),
        'iron': (0.3, 0.25, 0.22, 0.5, 1), 'bone': (0.7, 0.64, 0.5, 0.55, 0), 'mouth': (0.08, 0.015, 0.015, 0.4, 0)}

def idle(t):
    p = idle_pose(t, T=2.6, k=1.4)   # twitchy: a faster breath, the head darting
    p['head'] = (0.08 + 0.04 * math.sin(TAU * t / 1.3), 0.03 * math.cos(TAU * t / 2.6), 0.25 * math.sin(TAU * t / 2.6) ** 3)
    p['spine'] = (0.12 + p['spine'][0], 0, p['spine'][2])
    p['thigh.L'] = (-0.3, 0, 0); p['thigh.R'] = (-0.3, 0, 0); p['shin.L'] = (0.45, 0, 0); p['shin.R'] = (0.45, 0, 0); p['foot.L'] = (-0.15, 0, 0); p['foot.R'] = (-0.15, 0, 0)
    return p

finish('Goblin', OUT, J, BONES, {'body_high': body, **gear}, glow, part_info, MATS, FLAT, tri_target, (0.75, 1.0, 0.3),
       idle=idle, roar=lambda t: roar_pose(t, idle))
