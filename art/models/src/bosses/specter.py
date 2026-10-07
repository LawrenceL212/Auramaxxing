# The Storm Specter (weekly boss): a spectral knight hovering off the ground in black war-plate, every
# plate the shape of the muscle under it. Read from its shadow alone: no legs below the knee, the body
# ending in a long robe torn into strips that trail above the floor; a jagged crown-helm; an arc of
# spiked lightning-rods fanning off its back with storm-fire crackling between them; a long barbed spear.
# Its attack: reared back with the spear cocked overhead, then the whole body driven forward behind
# one great thrust.
#   python3.11 specter.py [--bake] [--tex 1024] [--out ../../specter.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *
from mathutils import Euler

reset(109)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'specter.glb'))
GLOW = (0.98, 0.36, 0.05)   # #F97316

# hovering: the hips ride ~0.4 m higher than a standing knight's; the shins and feet are only bones
J = {'pelvis': V((0, 0.02, 2.25)), 'waist': V((0, 0.03, 2.49)), 'chest': V((0, 0.0, 2.83)), 'upchest': V((0, 0.02, 3.04)),
     'neck': V((0, -0.03, 3.21)), 'head': V((0, -0.05, 3.37)), 'crown': V((0, -0.04, 3.56))}
mirrored(J, {'shoulder': (0.5, 0.03, 3.03), 'elbow': (0.72, 0.1, 2.51), 'wrist': (0.83, -0.06, 2.03), 'knuckle': (0.86, -0.12, 1.86),
             'hip': (0.17, 0.02, 2.21), 'knee': (0.21, -0.14, 1.5), 'ankle': (0.23, 0.12, 0.9), 'toe': (0.25, -0.02, 0.78)})
H = J['head']
BONES = human_bones()
KNEE_Z = J['knee.L'].z

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.0, waist=0.86)

def cut_below(ob, z):
    """No legs below the knee: the body simply ends there, inside the robe."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < z], context='VERTS')
    bm.to_mesh(ob.data); bm.free()
cut_below(body, KNEE_Z + 0.04)

Mh = lambda pts: [H + V(p) for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def build_helm():
    # a closed helm with a jutting jaw and two deep round eye-sockets under a heavy brow (the eyes burn
    # in them, see build_glow); a jagged crown of uneven blades all round its rim
    shell_ = hull('helmshell', Mh(both([(0.0, 0.0, 0.15), (0.1, -0.02, 0.12), (0.12, -0.12, 0.04), (0.0, -0.16, 0.06), (0.12, -0.08, -0.1),
                                        (0.0, -0.17, -0.16), (0.07, -0.15, -0.18), (0.1, 0.1, 0.04), (0.0, 0.14, 0.0), (0.09, 0.08, -0.12)])))
    brow = hull('brow', Mh(both([(0.0, -0.19, 0.05), (0.13, -0.14, 0.05), (0.14, -0.1, 0.1), (0.0, -0.14, 0.13), (0.06, -0.18, 0.02)])))
    jaw = hull('jaw', Mh(both([(0.0, -0.2, -0.14), (0.08, -0.16, -0.12), (0.06, -0.15, -0.22), (0.0, -0.18, -0.25), (0.1, -0.05, -0.12)])))
    parts = [shell_, brow, jaw]
    crown = []
    rc = random.Random(3)
    for k in range(11):   # the crown: a ring of jagged blades, tallest at the brow and the temples
        a = -math.pi * 0.95 + k / 10 * math.pi * 1.9
        L = (0.36 if k == 5 else 0.3 if k in (2, 8) else 0.17) * rc.uniform(0.9, 1.1)
        b = H + V((math.sin(a) * 0.11, -math.cos(a) * 0.12 + 0.01, 0.1 + 0.02 * math.cos(a)))
        d = V((math.sin(a) * 0.45, -math.cos(a) * 0.3, 1.0)).normalized()
        crown.append(blade('crownblade', b, b + d * L, 0.05 if L > 0.25 else 0.04, curve=V((math.sin(a) * 0.02, 0, 0)), thick=0.28, sub=0))
    crown.append(hull('circlet', [H + V((math.sin(k / 12 * math.tau) * r, -math.cos(k / 12 * math.tau) * r + 0.01, z)) for k in range(12) for r, z in ((0.125, 0.07), (0.115, 0.12))], bevel=0.002))
    helm = join(parts, 'helm')
    return helm, join(crown, 'crown')

def build_rods():
    # the storm-rods: an arc of tall iron spines fanned off a yoke on the shoulder blades, each ringed
    # with collars and barbed at its tip
    rods, rings = [], []
    yoke = hull('yoke', [V((x, y, z)) for x in (-0.24, 0.24) for y in (0.18, 0.27) for z in (2.82, 3.0)] + [V((0, 0.31, 2.92)), V((0, 0.24, 3.05))], bevel=0.004)
    tips = []
    for k in range(7):
        a = -1.45 + k * 2.9 / 6
        b = V((math.sin(a) * 0.16, 0.27, 2.92 + math.cos(a) * 0.04))
        d = V((math.sin(a) * 1.2, 0.5, math.cos(a) * 0.85)).normalized()
        L = 1.12 - abs(a) * 0.2
        tip = b + d * L
        rods.append(tube('rod', [b, b.lerp(tip, 0.5), tip], [0.026, 0.02, 0.012], sub=1))
        rods.append(blade('rodtip', tip - d * 0.02, tip + d * 0.22, 0.035, thick=0.35, sub=0))
        for u in (0.35, 0.6, 0.82):   # collars
            rings.append(ring('collar', b.lerp(tip, u), 0.034 - 0.008 * u, 0.009, rot=d.to_track_quat('Z', 'Y').to_euler(), seg=(12, 5)))
        for s in (1, -1):   # barbs below the tip
            side = d.cross(V((0, 1, 0))).normalized()
            p0 = b.lerp(tip, 0.9)
            rods.append(blade('rodbarb', p0, p0 + side * s * 0.09 - d * 0.04, 0.016, thick=0.4, sub=0))
        tips.append((tip, d))
    return join([yoke] + rods, 'rods'), join(rings, 'rodrings'), tips

def build_spear():
    # the spear, in the right hand: a long black haft, the head a long barbed leaf-blade with hooked
    # barbs down both edges, langets, and a spike at the butt. At rest it lies across the fist, the head
    # forward; held, the wrist stands it up
    G = J['wrist.R'].lerp(J['knuckle.R'], 0.5)
    F, U, X = V((0, -1, 0)), V((0, 0, 1)), V((1, 0, 0))
    top, bot = G + F * 1.75, G - F * 1.15
    P = {}
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.5), top], [0.03, 0.033, 0.034], sub=1), 50)
    P['grip'] = join([ring(f'g{i}', G + F * (-0.12 + i * 0.026), 0.035, 0.007, rot=(math.pi / 2, 0, 0), seg=(16, 5)) for i in range(10)], 'grip')
    head = [hull('spearhead', [top + F * 0.1 + U * z * 0.012 + X * x for x in (-0.07, 0.07) for z in (-1, 1)] +
                 [top + F * 0.3 + X * x * 0.06 + U * z * 0.014 for x in (-1, 1) for z in (-1, 1)] + [top + F * 0.78] +
                 [top + F * 0.02 + X * x * 0.03 + U * z * 0.02 for x in (-1, 1) for z in (-1, 1)], bevel=0.002)]
    for i in range(4):   # hooked barbs down both edges, raking back
        for s in (1, -1):
            b = top + F * (0.18 + i * 0.13) + X * s * (0.065 - i * 0.012)
            head.append(blade('barb', b, b - F * 0.12 + X * s * 0.08, 0.022, curve=X * s * 0.01, thick=0.3, sub=0))
    head.append(hull('socket', [top + F * z + X * x + U * y for x in (-0.045, 0.045) for y in (-0.045, 0.045) for z in (-0.12, 0.06)], bevel=0.003))
    for s in (1, -1):   # wing-blades flaring off the socket
        head.append(blade('wing', top - F * 0.04 + X * s * 0.04, top - F * 0.18 + X * s * 0.2 + U * 0.02, 0.04, curve=F * 0.03, thick=0.25))
    P['spearhead'] = join(head, 'spearhead')
    P['butt'] = blade('butt', bot, bot - F * 0.3, 0.036, thick=1.0)
    return P, (top, F, X, U)

def build_gear():
    helm, crown = build_helm()
    P = {'hands': hands, 'helm': helm, 'crown': crown}
    muscle_plates(P, src, FIELDS, skip=('gastro', 'tibialis', 'hamstrings', 'adductors'), scale=1.05)
    for s, n in SIDES:
        el, ke = J['elbow.' + n], J['knee.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.11 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['cspike.' + n] = blade('cspike.' + n, el + V((s * 0.02, 0.05, 0.0)), el + V((s * 0.06, 0.3, -0.06)), 0.04, curve=V((0, 0, 0.05)), thick=0.45)
        sh = J['shoulder.' + n]
        if 'm.sidedelt.' + n in P:   # jagged spikes up off the pauldron, like the crown's
            P['pthorns.' + n] = thorns(P['m.sidedelt.' + n], 'pthorns.' + n, lambda c, s=s, sh=sh: c.z > sh.z + 0.02 and s * c.x > abs(sh.x) - 0.04,
                                       3, 0.32, 0.05, up=2.5, back=0.0, curve=0.25, seed=5 + s, flat=0.5)
    rods, rodrings, TIPS = build_rods()
    P['rods'], P['rodrings'] = rods, rodrings
    P['belt'] = plate(shell, 'belt', lambda p: 2.22 < p.z < 2.34 and abs(p.x) < 0.42, push=0.05, thick=0.02, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    # the robe: from the belt all round, falling past where the legs end into long torn strips, flared
    # back and out as if dragged by a wind behind it
    def robe(u, t):
        a = u * math.pi
        fold = math.sin(u * 15 + 0.6) * 0.04 + math.sin(u * 31 + 1.7) * 0.014
        r = 0.27 + t * 0.26 + fold * (0.2 + t)
        return (math.sin(a) * r, 0.03 - math.cos(a) * r * 0.85 + t * t * 0.35, 2.3 - t * 1.85 + 0.03 * math.sin(u * 7) * t)
    P['robe'] = cloth('robe', 64, 34, robe, thick=0.018, strips=(0.3, 0.3, 17))
    # a mail skirt over the robe's top, under the belt
    P['fauld'] = cloth('fauld', 40, 6, lambda u, t: (math.sin(u * math.pi) * (0.29 + t * 0.06), 0.03 - math.cos(u * math.pi) * (0.29 + t * 0.06) * 0.85, 2.3 - t * 0.3), thick=0.01, sub=1)
    sp, SPEAR = build_spear()
    P.update(sp)
    return P, TIPS, SPEAR

gear, TIPS, SPEAR = build_gear()
cleanup(src, shell)

def bolt(name, a, b, n=7, amp=0.05, seed=0, r=0.008):
    """A zig-zag of storm-fire from a to b."""
    rnd = random.Random(seed)
    d = b - a; side = d.cross(V((0, 1, 0)))
    side = side.normalized() if side.length > 1e-6 else V((1, 0, 0))
    up = d.cross(side).normalized()
    pts = [a]
    for i in range(1, n):
        pts.append(a.lerp(b, i / n) + side * rnd.uniform(-amp, amp) + up * rnd.uniform(-amp, amp) * 0.6)
    pts.append(b)
    segs = [hull('bseg', [p + V((x, y, z)) for x in (-r, r) for y in (-r, r) for z in (-r, r)] + [q + V((x, y, z)) for x in (-r, r) for y in (-r, r) for z in (-r, r)], bevel=0) for p, q in zip(pts, pts[1:])]
    return join(segs, name)

def build_glow():
    g = {}
    eyes = [orb('eye.' + n, H + V((s * 0.05, -0.15, 0.015)), (0.022, 0.012, 0.016)) for s, n in SIDES]
    for e in eyes: sit_on(e, gear['helm'], gap=-0.006)
    # breath burning through the jaw's grille
    for k in range(3):
        eyes.append(orb('breath', H + V((0, -0.19, -0.12 - k * 0.03)), (0.04 - k * 0.008, 0.006, 0.005)))
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    # storm-fire arcing between the rod tips, and down each rod to the yoke
    arcs = []
    for i, ((t0, d0), (t1, d1)) in enumerate(zip(TIPS, TIPS[1:])):
        arcs.append(bolt('arc', t0 - d0 * 0.15, t1 - d1 * 0.15, n=6, amp=0.06, seed=i))
    for i, (t, d) in enumerate(TIPS[1::2]):
        arcs.append(bolt('crawl', t - d * 0.25, t - d * 0.75, n=5, amp=0.035, seed=20 + i, r=0.006))
    g['storm'] = (join(arcs, 'storm'), 'chest')
    top, F, X, U = SPEAR
    g['spearfire'] = (join([bolt('sbolt', top + F * 0.05 + X * 0.02, top + F * 0.6, n=6, amp=0.025, seed=40, r=0.007),
                            bolt('sbolt2', top - F * 0.1, top - F * 0.5, n=5, amp=0.03, seed=41, r=0.006)], 'spearfire'), 'hand.R')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'couter')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', {'hips', 'spine', 'chest', 'neck', 'head', 'upperarm.L', 'upperarm.R', 'forearm.L', 'forearm.R',
                                                       'hand.L', 'hand.R', 'thigh.L', 'thigh.R'})
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm', 'crown'): return 'helm', ('rigid', 'head')
    if name.startswith(('couter', 'cspike')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith('pthorns'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name in ('rods', 'rodrings'): return 'steel', ('rigid', 'chest')
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'robe': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'fauld': return 'mail', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name in ('haft', 'spearhead', 'butt'): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 6500
    if name == 'hands': return 2400
    if name == 'helm': return 1200
    if name == 'crown': return 900
    if name.startswith('m.'): return plate_tris(name)
    if name == 'robe': return 5200
    if name == 'fauld': return 1200
    if name == 'rods': return 2000
    if name == 'rodrings': return 1200
    if name == 'spearhead': return 1400
    if name == 'grip': return 900
    if name.startswith(('couter', 'belt', 'pthorns')): return 600
    return min(tris, 300)

def uv_weight(name):
    if name in ('helm', 'crown', 'spearhead'): return 2.6
    if name.startswith(('rods', 'pthorns')): return 1.6
    if name.startswith('m.'): return plate_uv(name)
    if name in ('robe', 'fauld'): return 0.6
    if name == 'body_high': return 0.5
    return 1.0

MATS, FLAT = knight_mats(accent=GLOW, paint=(0.05, 0.016, 0.004),
                         cloth=[(0.0, (0.004, 0.004, 0.006)), (0.35, (0.012, 0.011, 0.014)), (1.0, (0.016, 0.012, 0.012))])
FLAT['cloth'] = (0.025, 0.024, 0.03, 0.9, 0)

def idle(t):
    T = 4.0
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.8)
    # it drifts: a slow bob; the dead legs hang trailing back from the knee; the spear stood upright
    p = posed(p, thigh_L=(-0.1 + 0.04 * s, 0, 0), thigh_R=(-0.04 - 0.04 * s, 0, 0),
              upperarm_R=(-0.2, 0.1, 0), forearm_R=(-0.55, 0, 0), hand_R=(-1.15, 0, 0.0),
              upperarm_L=(0.05, -0.15, 0), forearm_L=(-0.35, 0, 0.2))
    p['_hips_loc'] = (0, 0.06 * s, 0)
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R'):
        p[k] = idle(t)[k]
    p['_hips_loc'] = (0, 0.12 * p['_b'] + idle(t)['_hips_loc'][1] * (1 - p['_b']), 0)
    return p

COCK, THRUST = (-0.5, -1.038, 2.742), (1.206, -0.509, 4.36)

def attack(t):
    # "Thunder Lance": the specter rears up and back, coiled, the spear cocked over the right shoulder
    # with its head aimed forward and the left hand reaching out to aim; then it is driven forward with
    # the whole body behind one thrust, held a beat, and drawn back
    rear = ease(t / 0.85) * (1 - ease((t - 0.9) / 0.18))
    hit = ease((t - 0.9) / 0.18) * (1 - ease((t - 1.9) / 0.9))
    k = max(rear, hit)
    shake = math.sin(t * 70) * 0.02 * ease((t - 1.05) / 0.05) * (1 - ease((t - 1.5) / 0.3))
    p = fade_idle(idle(t), 1 - k)
    p = posed(p, spine=(-0.22 * rear + 0.32 * hit + shake, 0, -0.45 * rear + 0.3 * hit), chest=(-0.12 * rear + 0.22 * hit, 0, -0.25 * rear + 0.2 * hit),
              head=(0.15 * rear - 0.15 * hit, 0, 0.5 * rear - 0.35 * hit),
              # the spear arm: cocked high and back, the fist turned so the head points forward; then
              # punched forward to full stretch
              upperarm_R=(-2.5 * rear - 1.55 * hit, 0.35 * rear + 0.05 * hit, 0), forearm_R=(-0.8 * rear - 0.05 * hit, 0, 0),
              # the free hand: out in front, aiming, then thrown back for balance
              upperarm_L=(-1.4 * rear + 0.5 * hit, -0.25 * rear - 0.6 * hit, 0), forearm_L=(-0.2 * rear, 0, 0),
              thigh_L=(-0.3 * rear + 0.35 * hit, 0, 0), thigh_R=(-0.3 * rear + 0.45 * hit, 0, 0))
    # the spear hand, turned along quaternion arcs (solved on the rig so the head points forward,
    # cocked and then thrust), so the spear never swings round through the body
    qi = Euler(idle(t)['hand.R'], 'XYZ').to_quaternion()
    q1, q2 = Euler(COCK, 'XYZ').to_quaternion(), Euler(THRUST, 'XYZ').to_quaternion()
    h = ease((t - 0.9) / 0.18)
    if t < 0.9: q = qi.slerp(q1, rear)
    elif t < 1.5: q = q1.slerp(q2, h)
    else: q = qi.slerp(q2, hit)
    p['hand.R'] = tuple(q.to_euler('XYZ'))
    # it rises and draws back, then surges forward and down behind the spear
    p['_hips_loc'] = (0, 0.22 * rear - 0.1 * hit, -0.3 * rear + 0.85 * hit)
    return p

parts = {'body_high': body, **gear}
finish('Specter', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, GLOW,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
