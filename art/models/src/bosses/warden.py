# The Ancient Warden (weekly boss): a guardian-priest from before the gates, in black war-plate cut
# plate by plate to the muscle under it, a heavy robe-tabard over it. Read from its shadow alone: a
# tall stone mask-helm carved with runes, crowned by long branching antlers; a long tabard and a skirt
# open at the front; and a massive warding staff, taller than it, topped by a ringed sigil.
# Its attack: the staff lifted high in both hands, then its butt slammed down into the ground.
#   python3.11 warden.py [--bake] [--tex 1024] [--out ../../warden.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(29)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'warden.glb'))

J = {'pelvis': V((0, 0.02, 1.8)), 'waist': V((0, 0.03, 2.05)), 'chest': V((0, 0.0, 2.4)), 'upchest': V((0, 0.02, 2.63)),
     'neck': V((0, -0.03, 2.81)), 'head': V((0, -0.05, 2.97)), 'crown': V((0, -0.04, 3.16))}
mirrored(J, {'shoulder': (0.53, 0.03, 2.63), 'elbow': (0.75, 0.1, 2.12), 'wrist': (0.85, -0.08, 1.64), 'knuckle': (0.88, -0.14, 1.47),
             'hip': (0.18, 0.02, 1.76), 'knee': (0.25, -0.07, 0.98), 'ankle': (0.28, 0.08, 0.14), 'toe': (0.32, -0.27, 0.04)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.1, waist=0.92)
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]
HK = 1.28   # the mask-helm is built tall and large: it is the boss's crest
M = lambda pts: [H + HK * V(p) for p in pts]

def build_helm():
    # a tall stone mask drawn up into a mitre: a long face of flat planes, a heavy brow over deep
    # sockets, a straight ridge of a nose, a closed mouth cut as a line, the stone band of a crown
    # round the brow the antlers rise from
    parts = [hull('mask', M(both([(0.0, -0.02, 0.36), (0.06, -0.05, 0.32), (0.105, -0.1, 0.12), (0.0, -0.165, 0.14), (0.07, -0.14, 0.13),
                                   (0.1, -0.12, -0.05), (0.0, -0.165, -0.2), (0.06, -0.13, -0.19), (0.11, 0.07, 0.06), (0.0, 0.14, 0.05),
                                   (0.08, 0.06, -0.12), (0.05, 0.06, 0.3), (0.0, 0.08, 0.32)])))]
    for s, n in SIDES:
        parts.append(hull('brow.' + n, M([(s * 0.005, -0.18, 0.065), (s * 0.11, -0.12, 0.06), (s * 0.105, -0.1, 0.035), (s * 0.01, -0.185, 0.04),
                                           (s * 0.06, -0.16, 0.09)])))
        parts.append(hull('cheek.' + n, M([(s * 0.03, -0.17, -0.03), (s * 0.105, -0.11, -0.02), (s * 0.1, -0.08, -0.1), (s * 0.04, -0.16, -0.1),
                                            (s * 0.115, -0.04, -0.04)])))
    parts.append(hull('nose', M([(x, y, z) for x in (-0.012, 0.012) for (y, z) in ((-0.17, 0.05), (-0.19, -0.04), (-0.165, -0.06))])))
    parts.append(hull('band', M(both([(0.12, -0.04, 0.06), (0.12, -0.04, 0.13), (0.0, -0.175, 0.1), (0.0, -0.17, 0.16), (0.08, -0.14, 0.12),
                                       (0.08, -0.14, 0.17), (0.12, 0.06, 0.08), (0.11, 0.06, 0.15), (0.0, 0.15, 0.08), (0.0, 0.14, 0.15)]))))
    return join(parts, 'helm')

def antler(s, n):
    # a beam out of the crown band, up and out and back, three tines rising off its top, a brow tine
    # forward; each branch tapers to a point
    pts = [H + HK * V(p) for p in ((s * 0.1, -0.03, 0.15), (s * 0.24, 0.0, 0.3), (s * 0.4, 0.06, 0.5), (s * 0.55, 0.14, 0.72), (s * 0.62, 0.22, 0.92))]
    rad = [0.07, 0.058, 0.046, 0.032, 0.01]
    parts = [ribbed('beam.' + n, pts, rad, n=40, ribs=6, depth=0.12, flat=1.0)]
    tines = [(0.3, (s * 0.05, -0.1, 0.42), 0.036), (0.55, (s * -0.08, -0.03, 0.46), 0.032), (0.75, (s * 0.1, 0.08, 0.38), 0.026), (0.42, (s * 0.18, 0.14, 0.04), 0.026)]
    for i, (u, d, r) in enumerate(tines):
        f = u * (len(pts) - 1); k = min(int(f), len(pts) - 2); b = pts[k].lerp(pts[k + 1], f - k)
        e = b + V(d)
        parts.append(ribbed(f'tine{i}.' + n, [b, b.lerp(e, 0.5) + V((0, 0, 0.03)), e], [r, r * 0.7, 0.004], n=18, ribs=3, depth=0.1, flat=1.0))
    bt = H + HK * V((s * 0.13, -0.05, 0.17))   # the brow tine, forward over the face
    parts.append(ribbed('browtine.' + n, [bt, bt + V((s * 0.06, -0.12, 0.08)), bt + V((s * 0.05, -0.2, 0.2))], [0.026, 0.018, 0.005], n=18, ribs=3, depth=0.1, flat=1.0))
    return join(parts, 'antler.' + n)

def build_staff():
    P = {}
    g = J['wrist.L'].lerp(J['knuckle.L'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((0.0, -0.04, 1.95)), g + V((0.0, 0.03, -1.44))
    P['shaft'] = sharp(tube('shaft', [bot, bot.lerp(top, 0.33) + V((0.01, 0, 0)), bot.lerp(top, 0.66) - V((0.01, 0, 0)), top], [0.045, 0.048, 0.046, 0.05], sub=1), 50)
    P['grip'] = join([ring(f'grip{i}', g + V((0, 0, -0.2 + i * 0.032)), 0.05, 0.008, rot=(0.1 if i % 2 else -0.1, 0, 0), seg=(18, 6)) for i in range(14)], 'grip')
    bands = []
    for z in (0.35, 0.9, 1.5):   # carved stone collars up the shaft
        c = bot.lerp(top, z / 3.4)
        bands.append(hull('collar', [c + V((math.cos(a) * 0.072, math.sin(a) * 0.072, dz)) for a in [k / 8 * math.tau for k in range(8)] for dz in (-0.05, 0.05)] +
                          [c + V((math.cos(a) * 0.055, math.sin(a) * 0.055, dz)) for a in [k / 8 * math.tau + 0.4 for k in range(8)] for dz in (-0.08, 0.08)]))
    P['collars'] = join(bands, 'collars')
    # the butt: a heavy stone foot, four-sided, to strike the ground with
    P['butt'] = hull('butt', [bot + V((x, y, z)) for x in (-0.07, 0.07) for y in (-0.07, 0.07) for z in (0.06, 0.2)] + [bot + V((x, y, -0.04)) for x in (-0.045, 0.045) for y in (-0.045, 0.045)])
    # the sigil: a great ring standing on the shaft facing forward, a second ring inside it, spokes and
    # points round its rim, small rings hung from it
    c = top + V((0, 0, 0.36))
    sig = [ring('outer', c, 0.32, 0.026, rot=(math.pi / 2, 0, 0), seg=(56, 8), flat=0.7),
           ring('inner', c, 0.19, 0.016, rot=(math.pi / 2, 0, 0), seg=(44, 6), flat=0.7)]
    sig.append(hull('neck', [top + V((x, y, z)) for x in (-0.07, 0.07) for y in (-0.04, 0.04) for z in (-0.1, 0.06)] + [c + V((0, 0, -0.32))]))
    for k in range(8):
        a = k / 8 * math.tau
        d = V((math.sin(a), 0, math.cos(a)))
        if k % 2 == 0:
            sig.append(hull(f'spoke{k}', [c + d * r + V((x, y, 0)) for r in (0.19, 0.31) for x in (-0.012, 0.012) for y in (-0.015, 0.015)]
                            if abs(d.x) < 0.5 else [c + d * r + V((0, y, z)) for r in (0.19, 0.31) for z in (-0.012, 0.012) for y in (-0.015, 0.015)]))
        sig.append(blade(f'point{k}', c + d * 0.33, c + d * (0.44 if k % 2 == 0 else 0.39), 0.03, thick=0.35, sub=0))
    for k, a in enumerate((-1.1, 1.1)):   # two small rings hung off the rim
        p = c + V((math.sin(math.pi + a) * 0.32, 0, math.cos(math.pi + a) * 0.32)) + V((0, 0, -0.07))
        sig.append(ring(f'hang{k}', p, 0.06, 0.009, rot=(0, 0, 0.0), seg=(20, 6)))
    P['sigil'] = sharp(join(sig, 'sigil'), 35)
    return P, c, top

def build_gear():
    P = {'hands': hands, 'helm': build_helm()}
    muscle_plates(P, src, FIELDS, scale=1.12)
    for s, n in SIDES:
        P['antler.' + n] = antler(s, n)
        el, ke, an, to = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        sh, hp = J['shoulder.' + n], J['hip.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.11 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.12 and p.y < ke.y, push=0.05, thick=0.018, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.07 and abs(p.x - an.x) < 0.14, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        # a carved stone boss on each shoulder, a rune ring round it
        if 'm.sidedelt.' + n in P:
            P['pstone.' + n] = rock('pstone.' + n, sh + V((s * 0.1, 0.0, 0.12)), (0.09, 0.09, 0.06), rot=(0, s * 0.6, 0), seed=3.0 + s, rough=0.12, n=26, bevel=0.008)
    pz = J['pelvis'].z
    P['belt'] = plate(shell, 'belt', lambda p: pz - 0.02 < p.z < pz + 0.11 and abs(p.x) < 0.42, push=0.05, thick=0.022, smooth=3, facets=0.1, rim=0.012, rivets=0.05)
    # the robe-tabard: long panels front and back from the collar to the shins, over the plate; a
    # heavy stole across the shoulders it hangs from; a skirt from the belt, open at the front
    up = J['upchest']
    P['tabard'] = cloth('tabard', 12, 34, lambda u, t: (u * (0.14 + t * 0.05), -0.27 - t * 0.07 + u * u * 0.04 - 0.02 * math.cos(u * math.pi * 2.5) * t,
                                                         up.z + 0.02 - t * (up.z - 0.45)), thick=0.02, strips=(0.85, 0.0, 6))
    P['tabardb'] = cloth('tabardb', 12, 34, lambda u, t: (u * (0.17 + t * 0.06), 0.27 + t * 0.12 - u * u * 0.05, up.z + 0.04 - t * (up.z - 0.4)), thick=0.02, strips=(0.85, 0.0, 8))
    nk = J['neck']
    def stole(u, t):
        a = u * math.pi
        r = 0.17 + t * 0.26
        return (math.sin(a) * r * 1.08, nk.y + 0.02 - math.cos(a) * r * 0.8, nk.z - 0.03 - t * 0.2 + 0.05 * abs(math.sin(a)) * t)
    P['stole'] = cloth('stole', 44, 8, stole, thick=0.02, sub=1)
    def skirt(u, t):
        a = (0.2 + (u + 1) * 0.8) * math.pi   # round the sides and back, open at the front
        fold = math.sin(u * 13) * 0.04 + math.sin(u * 27 + 1) * 0.012
        r = 0.31 + t * 0.26 + fold * (0.2 + t)
        return (math.sin(a) * r, 0.03 - math.cos(a) * r * 0.85, pz + 0.04 - t * (pz - 0.12))
    P['skirt'] = cloth('skirt', 60, 30, skirt, thick=0.02, strips=(0.7, 0.1, 17))
    sp, c, top = build_staff(); P.update(sp)
    return P, c, top

gear, SIGIL, TOP = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:
        eyes.append(orb('eye.' + n, H + HK * V((s * 0.045, -0.155, 0.035)), (0.028, 0.011, 0.015), rot=(0, 0, -s * 0.1), seg=(12, 6)))
    # runes cut in the mask: a line down the forehead with a bar across, a stroke under each eye,
    # chevrons on the crown band
    def stroke(a, b, w=0.006):
        a, b = H + HK * V(a), H + HK * V(b)
        d = (b - a).normalized(); side = d.cross(V((0, 1, 0))).normalized() * w
        return hull('rune', [a + side, a - side, b + side, b - side, a + V((0, 0.006, 0)), b + V((0, 0.006, 0))], bevel=0)
    rn = [stroke((0, -0.172, 0.18), (0, -0.165, 0.3)), stroke((-0.03, -0.17, 0.25), (0.03, -0.17, 0.25)),
          stroke((-0.03, -0.172, 0.135), (0, -0.177, 0.11)), stroke((0.03, -0.172, 0.135), (0, -0.177, 0.11))]
    for s in (1, -1):
        rn.append(stroke((s * 0.04, -0.162, -0.02), (s * 0.055, -0.14, -0.1)))
        rn.append(stroke((s * 0.07, -0.142, 0.21), (s * 0.05, -0.15, 0.27)))
    rn.append(stroke((-0.03, -0.166, -0.135), (0.03, -0.166, -0.135), 0.004))   # the mouth line
    g['eyes'] = (join(eyes + rn, 'eyes'), 'head')
    sg = [orb('sigilcore', SIGIL, (0.07, 0.03, 0.07), seg=(16, 8))]
    for k in range(4):   # runes standing in the inner ring
        a = k / 4 * math.tau + math.pi / 4
        d = V((math.sin(a), 0, math.cos(a)))
        sg.append(hull('srune', [SIGIL + d * r + V((x, y, 0)) for r in (0.1, 0.15) for x in (-0.008, 0.008) for y in (-0.012, 0.012)]))
    g['sigil'] = (join(sg, 'sigilglow'), 'hand.L')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'kneecop', 'couter')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'helm': return 'stone', ('rigid', 'head')
    if name.startswith('antler'): return 'horn', ('rigid', 'head')
    if name.startswith('pstone'): return 'stone', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('couter'): return steel, ('rigid', 'forearm.' + side)
    if name.startswith('kneecop'): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name in ('tabard', 'tabardb'): return 'banner', ('smooth', {'chest', 'spine', 'hips', 'thigh.L', 'thigh.R'})
    if name == 'stole': return 'cloth', ('smooth', {'neck', 'chest'})
    if name == 'skirt': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'grip': return 'leather', ('rigid', 'hand.L')
    if name in ('collars', 'butt'): return 'stone', ('rigid', 'hand.L')
    if name in ('shaft', 'sigil'): return 'steel', ('rigid', 'hand.L')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 6500
    if name == 'hands': return 2400
    if name == 'helm': return 1400
    if name.startswith('antler'): return 2200
    if name.startswith('m.'): return plate_tris(name, 560, 320)
    if name in ('tabard', 'tabardb'): return 1200
    if name == 'skirt': return 3600
    if name == 'stole': return 1600
    if name == 'sigil': return 2400
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt')): return 500
    if name == 'grip': return 900
    return min(tris, 300)

def uv_weight(name):
    if name in ('helm', 'sigil') or name.startswith('antler'): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name in ('tabard', 'tabardb', 'skirt', 'stole'): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

VIOLET = (0.65, 0.55, 0.98)
MATS, FLAT = knight_mats(accent=VIOLET, paint=(0.018, 0.012, 0.045), leather=(0.024, 0.018, 0.016),
                         bone=(0.15, 0.13, 0.11), horn=((0.02, 0.017, 0.016), (0.2, 0.17, 0.14)),
                         cloth=[(0.0, (0.02, 0.014, 0.04)), (0.4, (0.012, 0.01, 0.018)), (1.0, (0.01, 0.009, 0.012))])
# old grey stone, its runes and cracks lit violet from inside
MATS['stone'] = mat_stone('stone', [(0.25, (0.03, 0.029, 0.032)), (0.6, (0.06, 0.057, 0.062)), (0.9, (0.1, 0.095, 0.1))], glow=(0.3, 0.22, 0.6), scale=3.5, glow_width=0.02)
FLAT['stone'] = (0.05, 0.048, 0.052, 0.85, 0)
FLAT['banner'] = (0.03, 0.02, 0.07, 0.85, 0)
FLAT['horn'] = (0.07, 0.06, 0.05, 0.5, 0)

def idle(t):
    T = 4.8
    s = math.sin(TAU * t / T)
    p = idle_pose(t, T=T, k=0.6)
    # the staff planted upright at its left side, the right hand resting open
    p = posed(p, upperarm_L=(-0.1, -0.06, 0), forearm_L=(-0.25, 0, 0), hand_L=(0.35, 0, 0), head=(-0.03, 0, 0))
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.L', 'forearm.L', 'hand.L'):   # the staff stays planted
        p[k] = idle(t)[k]
    return p

def attack(t):
    # "Warding Seal": both hands take the staff and lift it high overhead, upright, the sigil above the
    # antlers; a held breath; then the staff driven straight down, its butt into the ground, the body
    # dropping onto bent knees behind it; the ground shakes, and it rises
    up = ease(t / 0.85) * (1 - ease((t - 1.05) / 0.16))
    dn = ease((t - 1.05) / 0.16) * (1 - ease((t - 2.2) / 0.75))
    shake = math.sin(t * 70) * 0.02 * ease((t - 1.2) / 0.05) * (1 - ease((t - 1.65) / 0.3))
    p = fade_idle(idle(t), 1 - max(up, dn))
    p = posed(p, spine=(-0.15 * up + 0.32 * dn + shake, 0, -0.08 * up - 0.08 * dn), chest=(-0.1 * up + 0.2 * dn, 0, 0), neck=(-0.05 * up, 0, 0),
              head=(-0.2 * up + 0.12 * dn, 0, 0.1 * dn),
              upperarm_L=(-2.2 * up - 0.75 * dn, -0.1 * up, 0), forearm_L=(-0.35 * up - 0.3 * dn, 0, 0), hand_L=(2.8 * up + 0.5 * dn, 0, 0),
              upperarm_R=(-2.0 * up - 0.75 * dn, 0.35 * up + 0.4 * dn, 0), forearm_R=(-0.6 * up - 0.5 * dn, 0, -0.3 * up - 0.3 * dn), hand_R=(0.3 * up, 0, 0),
              thigh_L=(-0.1 * up - 0.55 * dn, 0, 0), shin_L=(0.1 * up + 0.7 * dn, 0, 0), thigh_R=(-0.3 * dn, 0, 0), shin_R=(0.6 * dn, 0, 0),
              foot_L=(-0.15 * dn, 0, 0), foot_R=(-0.3 * dn, 0, 0))
    p['_hips_loc'] = (0, 0.06 * up - 0.22 * dn, 0)
    return p

parts = {'body_high': body, **gear}
finish('AncientWarden', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, VIOLET,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
