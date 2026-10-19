# The Crystal Wraith (weekly boss): a gaunt caster in a long torn robe, armoured only where it
# fights, on the shoulders and arms, every plate the shape of the muscle under it. Read from its
# shadow alone: a tall robe flaring to the floor, a short torn mantle, clusters of crystal breaking
# out of both shoulders, a crown of crystal shards round a narrow masked head, and a tall staff
# headed by a caged crystal.
# Its attack: the staff raised high and held as the crystals flare, then thrust forward, casting.
#   python3.11 wraith.py [--bake] [--tex 1024] [--out ../../wraith.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(61)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'wraith.glb'))

J = {'pelvis': V((0, 0.02, 1.84)), 'waist': V((0, 0.03, 2.08)), 'chest': V((0, 0.0, 2.43)), 'upchest': V((0, 0.02, 2.65)),
     'neck': V((0, -0.03, 2.83)), 'head': V((0, -0.06, 3.0)), 'crown': V((0, -0.05, 3.19))}
mirrored(J, {'shoulder': (0.47, 0.03, 2.65), 'elbow': (0.68, 0.1, 2.13), 'wrist': (0.8, -0.07, 1.66), 'knuckle': (0.83, -0.13, 1.49),
             'hip': (0.17, 0.02, 1.8), 'knee': (0.23, -0.05, 1.0), 'ankle': (0.26, 0.08, 0.14), 'toe': (0.3, -0.26, 0.04)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=0.88, waist=0.78)
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]
M = lambda pts: [H + V(p) for p in pts]

def crystal(name, base, tip, r, seed=0, sides=6):
    """A faceted crystal: a tapering prism of `sides` flat faces with a pyramidal point, its root
    sunk into what it grows from."""
    rnd = random.Random(seed)
    base, tip = V(base), V(tip)
    d = (tip - base); L = d.length; d.normalize()
    q = d.to_track_quat('Z', 'Y')
    a0 = rnd.uniform(0, math.tau)
    pts = []
    for k in range(sides):
        a = a0 + k / sides * math.tau
        o = q @ V((math.cos(a), math.sin(a), 0))
        pts += [base - d * r + o * r * 0.85, base + d * L * rnd.uniform(0.62, 0.74) + o * r * rnd.uniform(0.9, 1.05)]
    pts.append(tip)
    return hull(name, pts, bevel=0.002)

def cluster(name, base, up, n, length, r, spread=0.5, seed=1):
    rnd = random.Random(seed)
    up = V(up).normalized()
    obs = []
    for i in range(n):
        side = V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        side -= up * side.dot(up)
        d = (up + side.normalized() * spread * rnd.uniform(0.3, 1.0)).normalized() if side.length > 1e-4 else up
        L = length * (1.0 if i == 0 else rnd.uniform(0.35, 0.8))
        b = V(base) + side.normalized() * r * rnd.uniform(0.0, 1.4) if side.length > 1e-4 else V(base)
        obs.append(crystal(f'{name}{i}', b, b + d * L, r * (1.0 if i == 0 else rnd.uniform(0.5, 0.8)), seed=seed * 31 + i))
    return join(obs, name)

def build_head():
    # a narrow masked face, all planes: high cheekbones, a pointed chin, a heavy brow over two deep
    # sockets the eyes burn in; a steel circlet round the brow carries the crown of shards
    mask = hull('mask', M(both([(0.0, -0.02, 0.17), (0.08, -0.03, 0.13), (0.1, -0.08, 0.04), (0.0, -0.15, 0.06), (0.06, -0.135, 0.07),
                                 (0.075, -0.12, -0.04), (0.0, -0.15, -0.06), (0.03, -0.12, -0.16), (0.0, -0.11, -0.19), (0.09, 0.08, 0.04),
                                 (0.0, 0.13, 0.02), (0.07, 0.06, -0.1), (0.05, -0.06, -0.15)])))
    parts = [mask]
    for s, n in SIDES:
        parts.append(hull('brow.' + n, M([(s * 0.01, -0.155, 0.07), (s * 0.1, -0.11, 0.06), (s * 0.095, -0.1, 0.04), (s * 0.02, -0.168, 0.05),
                                           (s * 0.06, -0.14, 0.085)])))
        parts.append(hull('cheekbone.' + n, M([(s * 0.04, -0.15, -0.02), (s * 0.1, -0.1, -0.01), (s * 0.095, -0.06, -0.06), (s * 0.05, -0.135, -0.06),
                                                (s * 0.11, -0.05, 0.0)])))
    parts.append(ring('circlet', H + V((0, -0.005, 0.07)), 0.118, 0.012, rot=(0.12, 0, 0), seg=(40, 6)))
    for k in range(5):   # a fine mouth grille scored into the mask
        parts.append(hull('seam', M([(x, -0.152 + abs(x) * 0.3, -0.075 - k * 0.0) for x in (-0.03 + k * 0.015, -0.026 + k * 0.015)] +
                                    [(x, -0.14, -0.11) for x in (-0.03 + k * 0.015, -0.026 + k * 0.015)]), bevel=0))
    return join(parts, 'head')

def build_crown():
    # shards set round the circlet, tallest at the front and back, leaning out like a burst
    obs = []
    for k in range(11):
        a = k / 11 * math.tau
        o = V((math.sin(a), -math.cos(a), 0))
        tall = 0.16 + 0.17 * abs(math.cos(a)) ** 2 + (0.08 if k == 0 else 0)
        b = H + V((0, -0.005, 0.075)) + o * 0.11
        obs.append(crystal(f'shard{k}', b, b + (o * 0.35 + V((0, 0, 1))).normalized() * tall, 0.022 + 0.01 * (k == 0), seed=k + 3))
    return join(obs, 'crown')

def build_robe():
    P = {}
    nk, pz = J['neck'], J['pelvis'].z
    # the robe: a sleeveless wrap from under the arms to the floor, fitted to the chest and waist,
    # falling in deep folds that open toward the hem, torn into strips below the knee
    def prof(z):   # radius of the robe at a height: chest, pulled in at the waist, then flaring
        zs = [(J['upchest'].z - 0.04, 0.3), (J['chest'].z, 0.31), (J['waist'].z, 0.24), (pz, 0.3), (1.2, 0.45), (0.0, 0.72)]
        for (z0, r0), (z1, r1) in zip(zs, zs[1:]):
            if z1 <= z <= z0:
                f = (z0 - z) / (z0 - z1); return r0 + (r1 - r0) * (f * f * (3 - 2 * f))
        return zs[-1][1]
    ztop = J['upchest'].z - 0.04
    def robe(u, t):
        a = u * math.pi
        z = ztop - t * (ztop + 0.02)
        fold = (math.sin(u * 15 + 0.4) * 0.045 + math.sin(u * 31 + 1.1) * 0.015) * max(0, (pz - z) / pz) ** 0.8
        r = prof(z) + fold
        return (math.sin(a) * r, 0.03 - math.cos(a) * r * 0.85 + max(0, pz - z) * 0.06, z)
    P['robe'] = cloth('robe', 80, 44, robe, thick=0.018, strips=(0.68, 0.12, 21))
    # the mantle: a short torn cape over the shoulders, open at the throat, falling to the chest and back
    def mantle(u, t):
        a = u * math.pi
        r = 0.15 + t * 0.36 + 0.012 * math.sin(u * 21) * t
        return (math.sin(a) * r * 1.05, nk.y + 0.02 - math.cos(a) * r * 0.78, nk.z + 0.02 - t * 0.48 + 0.08 * abs(math.sin(a)) * t)
    P['mantle'] = cloth('mantle', 48, 12, mantle, thick=0.014, strips=(0.55, 0.1, 5))
    # a sash at the waist, its long tail down the front
    P['sash'] = plate(shell, 'sash', lambda p: J['waist'].z - 0.08 < p.z < J['waist'].z + 0.02 and abs(p.x) < 0.4, push=0.06, thick=0.012, smooth=2, facets=0.2, bevel=0.002)
    P['sashtail'] = cloth('sashtail', 4, 18, lambda u, t: (0.09 + u * 0.05, -0.27 - t * 0.03 - 0.01 * math.sin(t * 9), J['waist'].z - 0.05 - t * 0.9), thick=0.01, strips=(0.75, 0.0, 3))
    return P

def build_staff():
    P = {}
    g = J['wrist.R'].lerp(J['knuckle.R'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((-0.02, -0.04, 1.75)), g + V((0.01, 0.02, -1.48))
    P['shaft'] = sharp(tube('shaft', [bot, bot.lerp(top, 0.35) + V((0.012, 0, 0)), bot.lerp(top, 0.7) - V((0.01, 0, 0)), top], [0.034, 0.038, 0.036, 0.042], sub=1), 50)
    P['grip'] = join([ring(f'grip{i}', g + V((0, 0, -0.18 + i * 0.03)), 0.04, 0.007, rot=(0.1 if i % 2 else -0.1, 0, 0), seg=(16, 6)) for i in range(13)], 'grip')
    # the head: a collar, then four curved prongs rising round a long crystal and closing over it
    c = top + V((0, 0, 0.32))
    cage = [hull('collar', [top + V((x, y, z)) for x in (-0.05, 0.05) for y in (-0.05, 0.05) for z in (-0.06, 0.06)] + [top + V((0, 0, -0.14))])]
    for k in range(4):
        a = k / 4 * math.tau + math.pi / 4
        o = V((math.cos(a), math.sin(a), 0))
        cage.append(tube(f'prong{k}', [top + o * 0.04 + V((0, 0, 0.04)), c + o * 0.15 + V((0, 0, -0.18)), c + o * 0.16 + V((0, 0, 0.05)), c + o * 0.06 + V((0, 0, 0.3))],
                         [0.016, 0.014, 0.011, 0.005], flat=0.6, sub=1))
        cage.append(blade(f'pspur{k}', c + o * 0.155 + V((0, 0, -0.06)), c + o * 0.3 + V((0, 0, -0.12)), 0.018, thick=0.4, sub=0))
    P['staffhead'] = sharp(join(cage, 'staffhead'), 35)
    core = [crystal('stcore', c + V((0, 0, -0.22)), c + V((0, 0, 0.42)), 0.07, seed=4)]
    for k in range(5):
        a = k / 5 * math.tau
        o = V((math.cos(a), math.sin(a), 0))
        core.append(crystal(f'stsat{k}', c + V((0, 0, -0.1)) + o * 0.04, c + o * 0.16 + V((0, 0, 0.12 + 0.05 * (k % 2))), 0.028, seed=k + 9))
    P['staffcrystal'] = join(core, 'staffcrystal')
    P['ferrule'] = blade('ferrule', bot, bot + V((0, 0, -0.16)), 0.028, thick=1.0)
    return P, c

def build_gear():
    P = {'hands': hands, 'head': build_head(), 'crown': build_crown()}
    muscle_plates(P, src, FIELDS, only=SHOULDERS + ARMS, scale=1.05)
    P.update(build_robe())
    sp, c = build_staff(); P.update(sp)
    for s, n in SIDES:
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.1 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        # crystal breaking out of the shoulder plate: one great shard and a burst of smaller ones
        P['scrystal.' + n] = cluster('scrystal.' + n, sh + V((s * 0.05, 0.02, 0.07)), V((s * 0.55, 0.15, 1.0)), 7, 0.5, 0.045, spread=0.7, seed=7 + s)
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        for i in range(3):   # small shards along the outer forearm
            b = el.lerp(wr, 0.25 + i * 0.22) + V((s * 0.06, 0.03, 0))
            P[f'fcrystal{i}.' + n] = crystal(f'fcrystal{i}.' + n, b, b + V((s * 0.12, 0.06, 0.08 - i * 0.02)), 0.02, seed=20 + i + s)
    return P, c

gear, CORE = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:   # narrow eyes, burning at the back of the sockets under the brow
        eyes.append(orb('eye.' + n, H + V((s * 0.045, -0.142, 0.035)), (0.026, 0.008, 0.009), rot=(0, 0, -s * 0.18), seg=(12, 6)))
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    g['core'] = (orb('core', CORE + V((0, 0, 0.06)), (0.035, 0.035, 0.09)), 'hand.R')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'couter')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'head': return 'helm', ('rigid', 'head')
    if name == 'crown': return 'crystal', ('rigid', 'head')
    if name == 'robe': return 'cloth', ('smooth', {'spine', 'chest', 'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'mantle': return 'cloth', ('smooth', {'neck', 'chest'})
    if name == 'sash': return 'leather', ('smooth', {'hips', 'spine'})
    if name == 'sashtail': return 'banner', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name.startswith('scrystal'): return 'crystal', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('fcrystal'): return 'crystal', ('rigid', 'forearm.' + side)
    if name.startswith('couter'): return steel, ('rigid', 'forearm.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name == 'staffcrystal': return 'crystal', ('rigid', 'hand.R')
    if name in ('shaft', 'staffhead', 'ferrule'): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name == 'hands': return 2400
    if name == 'head': return 1600
    if name.startswith('m.'): return plate_tris(name)
    if name == 'robe': return 6000
    if name == 'mantle': return 2200
    if name in ('crown', 'staffcrystal') or name.startswith('scrystal'): return 1200
    if name == 'staffhead': return 1400
    if name.startswith(('couter', 'sash')): return 500
    if name == 'grip': return 900
    return min(tris, 300)

def uv_weight(name):
    if name in ('head', 'crown', 'staffhead'): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name in ('robe', 'mantle', 'sashtail'): return 0.6
    if name == 'body_high': return 0.4
    return 1.0

ORCHID = (0.94, 0.67, 0.99)
MATS, FLAT = knight_mats(accent=ORCHID, paint=(0.03, 0.012, 0.04), leather=(0.022, 0.016, 0.02),
                         cloth=[(0.0, (0.016, 0.006, 0.022)), (0.35, (0.01, 0.007, 0.014)), (1.0, (0.008, 0.007, 0.01))])
# pale crystal lit from within: violet in the body, pink-white at the faces
MATS['crystal'] = mat_plain('crystal', (0.55, 0.36, 0.66), 0.12, emit=(0.42, 0.22, 0.5), bump=0.05, scale=8.0)
FLAT['crystal'] = (0.62, 0.42, 0.72, 0.15, 0)

def idle(t):
    T = 4.6
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.7)
    # the staff planted out at its side, the left hand half raised, fingers spread over a cast
    p = posed(p, upperarm_R=(-0.25, 0.12, 0), forearm_R=(-0.45, 0, 0), hand_R=(0.7, 0, 0),
              upperarm_L=(-0.35 + 0.05 * s, -0.25, 0), forearm_L=(-0.9 - 0.05 * s, 0, 0.3), hand_L=(0.2, 0, 0), head=(-0.04, 0, 0))
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R'):   # the staff hand stays planted
        p[k] = idle(t)[k]
    return p

def attack(t):
    # "Prism Burst": the staff lifted high overhead, upright, the free hand flung up beside it, a
    # trembling beat as the crystals flare, then the staff head thrust out at the target as it leans
    # into the cast; it holds, then draws the staff back and settles
    up = ease(t / 0.8) * (1 - ease((t - 1.25) / 0.2))
    th = ease((t - 1.25) / 0.2) * (1 - ease((t - 2.2) / 0.75))
    tr = math.sin(t * 55) * 0.02 * ease((t - 0.7) / 0.2) * (1 - ease((t - 1.25) / 0.1))
    kick = math.sin(t * 60) * 0.015 * ease((t - 1.42) / 0.05) * (1 - ease((t - 1.8) / 0.3))
    p = fade_idle(idle(t), 1 - max(up, th))
    p = posed(p, spine=(-0.16 * up + 0.28 * th + tr, 0, 0.1 * th), chest=(-0.12 * up + 0.15 * th + kick, 0, 0.12 * th), neck=(-0.08 * up, 0, 0),
              head=(-0.25 * up + 0.05 * th, 0, -0.1 * th),
              upperarm_R=(-2.5 * up - 1.25 * th, 0.15 * up, 0.0), forearm_R=(-0.25 * up - 0.2 * th, 0, 0), hand_R=(2.5 * up + 2.25 * th, 0, 0),
              upperarm_L=(-1.6 * up - 0.4 * th, -0.6 * up - 0.3 * th, 0), forearm_L=(-0.5 * up - 0.6 * th, 0, 0), hand_L=(0.3 * up, 0, 0),
              thigh_L=(-0.1 * up - 0.45 * th, 0, 0), shin_L=(0.15 * up + 0.4 * th, 0, 0), thigh_R=(0.25 * th, 0, 0), shin_R=(0.2 * th, 0, 0))
    p['_hips_loc'] = (0, 0.04 * up - 0.1 * th, 0.12 * th)
    return p

parts = {'body_high': body, **gear}
finish('CrystalWraith', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, ORCHID,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
