# The Iron Shadow (C-rank gate): a wraith that flows through rigid bodies. A gaunt torso of living
# shadow behind an iron mask, a hood, broken shackles, long bladed arms, and no legs: the robe
# trails off into smoke above the floor. ~3 m.
#   python3.11 iron_shadow.py --bake --out ../../iron-shadow.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(31)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'iron-shadow.glb'))

J = {'pelvis': V((0, 0.06, 1.38)), 'waist': V((0, 0.05, 1.62)), 'chest': V((0, 0.0, 1.95)), 'upchest': V((0, -0.02, 2.2)),
     'neck': V((0, -0.09, 2.34)), 'head': V((0, -0.15, 2.46)), 'crown': V((0, -0.15, 2.7))}
mirrored(J, {'shoulder': (0.4, 0.03, 2.2), 'elbow': (0.7, 0.12, 1.76), 'wrist': (0.84, -0.1, 1.34), 'knuckle': (0.88, -0.18, 1.18),
             'hip': (0.17, 0.06, 1.32), 'knee': (0.24, 0.02, 0.86), 'ankle': (0.25, 0.12, 0.4), 'toe': (0.25, 0.02, 0.28)})
BONES = human_bones()
H = J['head']

def build_body():
    t = Tree()
    pel = t.add(J['pelvis'], (0.17, 0.13))
    wai = t.add(J['waist'], (0.13, 0.11), pel)
    che = t.add(J['chest'], (0.25, 0.17), wai)
    up = t.add(J['upchest'], (0.3, 0.17), che)
    nk = t.add(J['neck'], 0.075, up)
    t.add(H, (0.12, 0.14), nk)
    for s, n in SIDES:
        sh = t.add(J['shoulder.' + n], 0.1, up)
        el = t.add(J['elbow.' + n], 0.055, sh)
        wr = t.add(J['wrist.' + n], 0.045, el)
        palm = t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.6), (0.05, 0.03), wr)
        d = (J['knuckle.' + n] - J['wrist.' + n]).normalized()
        for i in range(4):   # long thin fingers ending in iron talons (the talons are separate)
            off = V((s * (0.035 - i * 0.023), -0.01 * i, 0))
            k1 = t.add(J['knuckle.' + n] + off, 0.014, palm)
            t.add(J['knuckle.' + n] + off + d * 0.1 + V((0, -0.03, 0)), 0.011, k1)
    base = t.build('skin')
    B = [base, blob(H + V((0, -0.06, -0.06)), (0.09, 0.08, 0.07))]   # jaw under the mask
    for s, n in SIDES:
        sh, el = J['shoulder.' + n], J['elbow.' + n]
        B.append(blob(sh + V((s * 0.02, 0, 0.02)), (0.12, 0.11, 0.1)))
        B.append(blob(sh.lerp(el, 0.45), (0.065, 0.065, 0.16), (0.1, s * -0.5, 0)))
        for i in range(5):   # the ribcage, every rib showing
            z = 2.12 - i * 0.075
            B.append(blob(V((s * 0.13, -0.06 + i * 0.01, z)), (0.13 - i * 0.008, 0.11, 0.016), (0.25, 0, s * 0.35)))
    body = remesh(B, 'body_high', voxel=0.01, smooth=4)
    displace(body, scale=18.0, amount=0.004)
    return body

body = build_body()

def build_gear():
    P = {}
    # the iron mask: a smooth face plate with a ridge down the middle and a slit for the eyes
    P['mask'] = shell('mask', H + V((0, -0.035, 0.0)), (0.135, 0.15, 0.17), cut=lambda c: c.y < -0.15 and c.z > -0.75, thick=0.018)
    P['maskridge'] = spike('maskridge', H + V((0, -0.19, 0.16)), H + V((0, -0.2, -0.13)), 0.02, curve=V((0, -0.02, 0)), flat=1.0, power=0.3)
    # the hood: deep, pulled forward over the mask, its edge drawn to a point
    def hood(u, t):
        a = math.pi + u * 2.45                     # wraps the back and sides, open over the face
        r = 0.06 + 0.2 * math.sin(min(t * 1.7, 1.0) * math.pi / 2) + 0.07 * t
        return (math.sin(a) * r, H.y + 0.04 - math.cos(a) * r * 1.1 + (1 - t) * 0.0, H.z + 0.3 - t * 0.5 - (0.04 * math.cos(a)) * t)
    P['hood'] = cloth('hood', 20, 12, hood, thick=0.02)
    # its peak pulled forward over the mask, and the cowl's tail down the back
    P['hoodtip'] = spike('hoodtip', H + V((0, 0.12, 0.25)), H + V((0, 0.36, -0.12)), 0.08, curve=V((0, 0.07, 0.06)), flat=0.3)
    # a mantle over the shoulders, torn at the edge
    P['mantle'] = cloth('mantle', 22, 8, lambda u, t: (math.sin(u * 1.9) * (0.36 + t * 0.2), 0.02 + math.cos(u * 1.9) * (0.2 + t * 0.12) + (0.0 if abs(u) > 0.35 else -0.0),
                                                        2.34 - t * 0.42 + math.sin(u * 11) * 0.015), thick=0.016, torn=hem(5.0, 0.12))
    # the robe: from the waist to nothing, trailing off in long torn strips
    def robe(u, t):
        a = u * math.pi
        r = 0.17 + t ** 0.8 * 0.42 + math.sin(u * 13 + t * 3) * 0.05 * t + math.sin(u * 5) * 0.03 * t
        return (math.sin(a) * r, 0.06 - math.cos(a) * r * 0.85 + t * 0.14, 1.7 - t * 1.25)
    P['robe'] = cloth('robe', 36, 22, robe, thick=0.016, torn=lambda u, t: 0.55 * max(0, noise.noise(V((u * 7, 1.7, 0.3))) + 0.25) * t)
    # iron: a collar, bands on the arms, broken shackles with chain hanging off them
    P['girdle'] = ring('girdle', J['waist'] + V((0, 0.02, 0.06)), 0.17, 0.03, flat=1.8)
    P['collar'] = ring('collar', J['neck'] + V((0, 0.02, -0.04)), 0.14, 0.03, rot=(0.25, 0, 0), flat=1.6)
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        d = (el - sh).normalized()
        P['band.' + n] = ring('band.' + n, sh.lerp(el, 0.6), 0.07, 0.016, rot=d.to_track_quat('Z', 'Y').to_euler(), flat=2.0)
        dw = (wr - el).normalized()
        P['shackle.' + n] = ring('shackle.' + n, el.lerp(wr, 0.86), 0.065, 0.024, rot=dw.to_track_quat('Z', 'Y').to_euler(), flat=1.8)
        links = []
        c = el.lerp(wr, 0.86) + V((s * 0.06, 0.02, -0.04))
        for i in range(5):
            links.append(ring(f'link{i}', c + V((s * 0.015 * i, 0.01 * i, -0.06 * i)), 0.028, 0.008, rot=(0, (i % 2) * math.pi / 2, 0.3), seg=(16, 6)))
        P['chain.' + n] = join(links, 'chain.' + n)
        # the arm blade: a long iron edge from the forearm past the hand
        P['armblade.' + n] = spike('armblade.' + n, el.lerp(wr, 0.35) + V((s * 0.05, 0.03, 0)), wr + (wr - el).normalized() * 0.75 + V((s * 0.06, -0.08, 0)),
                                   0.075, curve=V((s * 0.04, 0.05, 0)), flat=0.14, power=0.8)
        # talons on the four fingers
        dk = (kn - wr).normalized()
        for i in range(4):
            off = V((s * (0.035 - i * 0.023), -0.01 * i, 0))
            b = kn + off + dk * 0.1 + V((0, -0.03, 0))
            P[f'talon{i}.' + n] = spike(f'talon{i}.' + n, b, b + dk * 0.16 + V((0, -0.08, -0.02)), 0.013, curve=V((0, -0.02, 0)))
    # smoke: tendrils curling out of the robe's hem and fading above the floor
    for i in range(9):
        a = (i / 9) * math.tau + 0.3
        path = []
        for k in range(6):
            u = k / 5
            ang = a + u * 0.9 * (1 if i % 2 else -1)
            rr = 0.42 + u * 0.12 + math.sin(u * 4 + i) * 0.05
            path.append(V((math.sin(ang) * rr, 0.14 - math.cos(ang) * rr * 0.85, 0.62 - u * 0.4 + 0.05 * (i % 3))))
        P[f'smoke{i}'] = tube(f'smoke{i}', path, [0.06 * (1 - k / 6) ** 0.8 + 0.004 for k in range(6)], flat=0.5)
    return P

gear = build_gear()

def build_glow():
    g = {}
    for s, n in SIDES:
        ob = orb('eye.' + n, H + V((s * 0.055, -0.2, 0.02)), (0.045, 0.012, 0.011), rot=(0, s * -0.2, s * -0.18))
        sit_on(ob, gear['mask'], gap=0.003)
        g['eye.' + n] = (ob, 'head')
    # the heart: a cold light caged in the ribs
    g['heart'] = (orb('heart', J['chest'] + V((0.03, -0.1, 0.05)), (0.07, 0.07, 0.09)), 'chest')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'shadow', ('smooth', None)
    if name in ('mask', 'maskridge'): return 'mask', ('rigid', 'head')
    if name in ('hood', 'hoodtip'): return 'cloth', ('rigid', 'head')
    if name == 'mantle': return 'cloth', ('smooth', {'chest', 'neck', 'upperarm.L', 'upperarm.R'})
    if name == 'robe': return 'cloth', ('smooth', {'hips', 'spine', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'collar': return 'iron', ('rigid', 'neck')
    if name == 'girdle': return 'iron', ('rigid', 'spine')
    if name.startswith('band'): return 'iron', ('rigid', 'upperarm.' + side)
    if name.startswith(('shackle', 'chain', 'armblade')): return 'iron', ('rigid', 'forearm.' + side)
    if name.startswith('talon'): return 'iron', ('rigid', 'hand.' + side)
    if name.startswith('smoke'):
        x = parts[name].data.vertices[0].co.x
        return 'smoke', ('smooth', {'shin.L', 'foot.L'} if x > 0 else {'shin.R', 'foot.R'})
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 16000
    if name == 'robe': return 5000
    if name in ('hood', 'mantle', 'mask'): return 2500
    if name.startswith('armblade'): return 900
    return min(tris, 700)

MATS = {
    'shadow': mat_hide('shadow', [(0.3, (0.02, 0.025, 0.04)), (0.6, (0.05, 0.06, 0.09)), (0.85, (0.1, 0.12, 0.17))], fissure=(0.3, 0.6, 1.0), scale=40.0, big=9.0, rough=(0.6, 0.35)),
    'smoke': mat_hide('smoke', [(0.3, (0.01, 0.012, 0.02)), (0.8, (0.05, 0.06, 0.09))], fissure=(0.25, 0.55, 1.0), scale=12.0, big=5.0, rough=(0.9, 0.8), bump=(0.1, 0.2)),
    'cloth': mat_cloth('cloth', 0.2, 2.4, [(0.0, (0.01, 0.012, 0.02)), (0.6, (0.04, 0.05, 0.08)), (1.0, (0.07, 0.08, 0.12))], rough=0.9, sheen=0.5),
    'iron': mat_metal('iron', (0.12, 0.13, 0.15), (0.5, 0.55, 0.62), rough=0.4, rust=((0.1, 0.06, 0.04), (0.22, 0.12, 0.07))),
    'mask': mat_metal('mask', (0.16, 0.17, 0.2), (0.62, 0.66, 0.74), rough=0.3, engrave=(0.55, 0.7, 0.9)),
}
FLAT = {'shadow': (0.05, 0.06, 0.09, 0.5, 0), 'smoke': (0.03, 0.04, 0.06, 0.9, 0), 'cloth': (0.04, 0.05, 0.08, 0.9, 0),
        'iron': (0.2, 0.21, 0.24, 0.4, 1), 'mask': (0.3, 0.32, 0.36, 0.3, 1)}

def idle(t):
    T = 3.6
    p = idle_pose(t, T=T, k=1.2)
    s = math.sin(TAU * t / T)
    p['_hips_loc'] = (0, 0, 0.06 * s)   # floating, rising and sinking
    p['spine'] = (0.1 + 0.03 * s, 0, 0.03 * math.cos(TAU * t / T))
    p['head'] = (0.12 + 0.03 * s, 0.06 * math.cos(TAU * t / T), 0.06 * s)
    for n, sg in (('L', 1), ('R', -1)):
        p['upperarm.' + n] = (0.15 + 0.05 * s, -sg * 0.12, 0)
        p['forearm.' + n] = (-0.35 - 0.06 * s, 0, 0)
        p['thigh.' + n] = (0.1 * math.sin(TAU * t / T + sg), 0.05 * sg, 0)
        p['shin.' + n] = (0.25 + 0.12 * math.sin(TAU * t / T + sg + 1), 0, 0)
        p['foot.' + n] = (0.3 * math.sin(TAU * t / T + sg + 2), 0, 0)
    return p

parts = {'body_high': body, **gear}
finish('IronShadow', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, (0.39, 0.71, 0.96),
       idle=idle, roar=lambda t: roar_pose(t, idle), mid=0.06)
