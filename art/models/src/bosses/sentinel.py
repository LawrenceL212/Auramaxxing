# The Stone Sentinel (weekly boss): a temple guardian whose every muscle plate is carved grey stone,
# angular and chipped, set over dark mortar. Read from its shadow alone: a square helm under a tall
# blade of a crest, a great tower shield on the left arm, a heavy straight greatsword in the right.
# Its attack: braced behind the shield, then the shield swept aside and a full overhead cleave.
#   python3.11 sentinel.py [--bake] [--tex 1024] [--out ../../sentinel.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(83)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'sentinel.glb'))
KS = 1.06   # a little taller than the executioner

J = {'pelvis': (0, 0.02, 1.81), 'waist': (0, 0.03, 2.06), 'chest': (0, 0.0, 2.41), 'upchest': (0, 0.02, 2.63),
     'neck': (0, -0.03, 2.81), 'head': (0, -0.05, 2.98), 'crown': (0, -0.04, 3.17)}
J = {k: V(v) * KS for k, v in J.items()}
mirrored(J, {'shoulder': (0.56 * KS, 0.03, 2.64 * KS), 'elbow': (0.8 * KS, 0.1, 2.13 * KS), 'wrist': (0.9 * KS, -0.08, 1.66 * KS), 'knuckle': (0.93 * KS, -0.14, 1.49 * KS),
             'hip': (0.19 * KS, 0.02, 1.77 * KS), 'knee': (0.27 * KS, -0.07, 0.98 * KS), 'ankle': (0.3 * KS, 0.08, 0.15), 'toe': (0.34 * KS, -0.28, 0.04)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.15, waist=0.92)
M = lambda pts: [H + V(p) * KS for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def stone_plates(P, src, fields, scale=1.0, gap=0.024, seed=5):
    """A carved stone slab per muscle: thick, no turned rim, its corners struck off by flat chisel
    cuts so every edge runs straight and the outline reads as chipped rock, not pressed steel."""
    rnd = random.Random(seed)
    co = np.array([tuple(v.co) for v in src.data.vertices], np.float32)
    for key, f in fields.items():
        lbl = key.split('.')[0]
        if lbl not in MPLATE or (f > gap).sum() < 12: continue
        push, thick, rim, bead, rv, sm = MPLATE[lbl]
        pts = co[f > gap]
        c = V(tuple(pts.mean(0)))
        cuts = []
        dist = np.linalg.norm(pts - np.array(tuple(c), np.float32), axis=1)
        far = np.argsort(dist)[::-1][:max(4, len(pts) // 8)]
        for _ in range(rnd.choice((1, 2, 2, 3))):   # chips struck off the far corners only
            p = V(tuple(pts[far[rnd.randrange(len(far))]]))
            d = p - c
            if d.length < 0.06: continue
            nrm = (d.normalized() + V((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3)))).normalized()
            cuts.append((c + d * rnd.uniform(0.86, 0.94), nrm))
        ob = plate(src, 'm.' + key, lambda p: True, push=push * scale + 0.006, thick=thick * scale * 1.9, smooth=sm,
                   facets=0.08, bevel=0.004, rim=0.0, rivets=0.0, field=f, gap=gap, cuts=cuts)
        if ob is not None and len(ob.data.vertices) > 8:
            P['m.' + key] = ob
    return P

def build_helm():
    # a square great-helm of carved stone: flat cheeks, a flat brow over a deep visor slot, a jaw
    # that juts, and a tall crest standing on its crown from brow to nape
    shell_ = hull('helmshell', M(both([(0.12, -0.13, 0.14), (0.13, 0.11, 0.14), (0.135, -0.15, -0.02), (0.13, 0.13, -0.04),
                                       (0.12, -0.15, -0.17), (0.11, 0.1, -0.16), (0.0, -0.165, 0.15), (0.0, -0.18, -0.18), (0.0, 0.14, 0.15)])), bevel=0.006)
    brow = hull('brow', M(both([(0.14, -0.15, 0.06), (0.14, -0.2, 0.05), (0.13, -0.19, 0.02), (0.0, -0.215, 0.06), (0.0, -0.205, 0.015), (0.13, -0.13, 0.08)])))
    jaw = hull('jaw', M(both([(0.13, -0.17, -0.04), (0.11, -0.2, -0.08), (0.06, -0.215, -0.2), (0.0, -0.22, -0.21), (0.12, -0.14, -0.19), (0.0, -0.19, -0.04)])))
    # the crest: a tall fan of stone standing on the crown, rising from the brow to a peak, then
    # stepped down in hard notches to the nape, built in slices so the steps survive
    prof = [(-0.2, 0.14), (-0.15, 0.36), (-0.08, 0.5), (-0.02, 0.56), (0.02, 0.5), (0.06, 0.5), (0.1, 0.42), (0.14, 0.42), (0.18, 0.33), (0.22, 0.3), (0.26, 0.16)]
    sl = []
    for i in range(len(prof) - 1):
        (y0, t0), (y1, t1) = prof[i], prof[i + 1]
        w0, w1 = 0.03 - 0.01 * (t0 - 0.14), 0.03 - 0.01 * (t1 - 0.14)
        sl.append(hull(f'crest{i}', M([(x, y0, 0.12) for x in (-0.03, 0.03)] + [(x, y0, t0) for x in (-w0 * 0.4, w0 * 0.4)]
                                       + [(x, y1, 0.12) for x in (-0.03, 0.03)] + [(x, y1, t1) for x in (-w1 * 0.4, w1 * 0.4)]), bevel=0.002))
    crest = join(sl, 'crest')
    sock = hull('csock', M(both([(0.04, -0.15, 0.13), (0.04, 0.17, 0.12), (0.03, -0.12, 0.19), (0.03, 0.12, 0.18)])))
    cheekr = []
    for s in (1, -1):   # ridges down each cheek plate
        cheekr.append(hull('cheek', M([(s * 0.135, -0.155, 0.0), (s * 0.15, -0.15, -0.01), (s * 0.135, -0.13, -0.17), (s * 0.15, -0.13, -0.16),
                                       (s * 0.14, -0.1, -0.0), (s * 0.14, -0.1, -0.15)])))
    return join([shell_, brow, jaw, crest, sock] + cheekr, 'helm')

SH_N = V((0.35, -1.0, 0.0)).normalized()   # the shield's face, angled out to the left front

def build_gear():
    P = {'hands': hands, 'helm': build_helm()}
    stone_plates(P, src, FIELDS, scale=1.15)
    # a gorget of stone slabs round the neck
    P['gorget'] = plate(shell, 'gorget', lambda p: J['upchest'].z + 0.02 < p.z < J['neck'].z + 0.02 and abs(p.x) < 0.24, push=0.05, thick=0.035, smooth=3, facets=0.2)
    for s, n in SIDES:
        el, ke, an, to = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.12 and p.y > el.y - 0.02, push=0.05, thick=0.03, smooth=4, facets=0.2)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.13 and p.y < ke.y, push=0.06, thick=0.035, smooth=4, facets=0.2)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.08 and abs(p.x - an.x) < 0.15, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        # the pauldron: a stepped slab of stone over the deltoid, two courses like temple masonry
        sh = J['shoulder.' + n]
        for i in range(3):
            c = sh + V((s * (0.06 + 0.06 * i), 0.0, 0.17 - 0.11 * i))
            w = 0.24 - 0.025 * i
            P[f'pauld{i}.{n}'] = hull(f'pauld{i}.{n}', [c + V((s * x, y, z)) for x, y, z in
                                    [(-0.14, -w, 0.03), (-0.14, w, 0.03), (0.12, -w, -0.03), (0.12, w, -0.03), (0.2, -w * 0.9, -0.15), (0.2, w * 0.9, -0.15),
                                     (-0.12, -w * 0.95, -0.05), (-0.12, w * 0.95, -0.05), (0.08, -w * 0.95, -0.13), (0.08, w * 0.95, -0.13)]], bevel=0.006)
        # a raised guard on the top course, standing up beside the helm against a blow to the neck
        g = sh + V((s * -0.04, 0.0, 0.2))
        P['haute.' + n] = hull('haute.' + n, [g + V((s * x, y, z)) for x, y, z in
                               [(0, -0.2, 0), (0, 0.2, 0), (0.03, -0.2, 0), (0.03, 0.2, 0), (-0.03, -0.14, 0.17), (-0.03, 0.14, 0.17), (-0.01, -0.14, 0.17), (-0.01, 0.14, 0.17)]], bevel=0.004)
    # a belt of stone blocks and a tabard of heavy cloth, front and back
    P['belt'] = plate(shell, 'belt', lambda p: 1.84 * KS < p.z < 1.95 * KS and abs(p.x) < 0.42, push=0.05, thick=0.03, smooth=3, facets=0.25, rivets=0.0)
    P['tabard'] = cloth('tabard', 10, 22, lambda u, t: (u * (0.17 + t * 0.03), -0.29 - t * 0.06 + u * u * 0.04, 1.9 * KS - t * 1.0), thick=0.016, strips=(0.7, 0.0, 9))
    P['tabardb'] = cloth('tabardb', 10, 22, lambda u, t: (u * (0.19 + t * 0.04), 0.24 + t * 0.08 - u * u * 0.04, 1.9 * KS - t * 0.95), thick=0.016, strips=(0.7, 0.0, 4))
    for s, n in SIDES:
        sh, el = J['shoulder.' + n], J['elbow.' + n]
        hp, ke = J['hip.' + n], J['knee.' + n]
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, hp, ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.035)
    # the tower shield: strapped to the left forearm, a tall slab of stone in an iron frame, ridged
    # down its middle, its foot cut to a point
    el, wr = J['elbow.L'], J['wrist.L']
    fa = (wr - el).normalized()
    c = el.lerp(wr, 0.55) + V((0.02, -0.15, 0.0))
    up = V((0, 0, 1)); n_ = SH_N; rt = up.cross(n_).normalized()
    def SP(x, z, d=0.0): return c + rt * x * 1.2 + up * z * 1.25 + n_ * d
    outline = [(-0.33, 0.78), (0.33, 0.78), (0.37, 0.62), (0.37, -0.45), (0.0, -0.78), (-0.37, -0.45), (-0.37, 0.62)]
    face = []
    for x, z in outline:
        face += [SP(x * 0.95, z * 0.95, 0.07), SP(x, z, 0.0), SP(x, z, -0.05)]
    face += [SP(0, 0.7, 0.11), SP(0, -0.66, 0.11)]   # the medial ridge
    P['shield'] = hull('shield', face, bevel=0.008)
    rim = []
    for i in range(len(outline)):   # the iron frame round its edge
        a, b = outline[i], outline[(i + 1) % len(outline)]
        pa, pb = SP(*a, 0.0), SP(*b, 0.0)
        rim.append(hull(f'srim{i}', [p + n_ * d + dd for p in (pa, pb) for d in (-0.06, 0.085) for dd in ((p - c).normalized() * 0.03, -(p - c).normalized() * 0.03)]))
    P['shieldrim'] = join(rim, 'shieldrim')
    boss_ = [hull(f'sboss{i}', [SP(x0 + x, z0 + z, 0.1 + d) for x in (-0.05, 0.05) for z in (-0.05, 0.05) for d in (0.0, 0.035)] + [SP(x0, z0, 0.17)])
             for i, (x0, z0) in enumerate([(0.0, 0.42), (-0.2, 0.05), (0.2, 0.05), (0.0, -0.32)])]
    P['shieldboss'] = join(boss_, 'shieldboss')
    P['shieldarm'] = join([hull('sarm', [SP(x, z, d) for x in (-0.06, 0.06) for z in (-0.12, 0.12) for d in (-0.05, -0.14)])]
                          + [hull(f'sbr{i}', [el.lerp(wr, t) + V((0, yy, zz)) for yy in (-0.07, 0.07) for zz in (-0.07, 0.07)] + [SP(0, (t - 0.55) * 0.9, -0.06) + V((0, 0, zz)) for zz in (-0.03, 0.03)]) for i, t in enumerate((0.3, 0.8))], 'shieldarm')
    # the greatsword: held low in the right hand, point down and forward, a broad straight blade
    # with a fuller, a heavy cross and a faceted pommel
    gR = J['wrist.R'].lerp(J['knuckle.R'], 0.6)
    d = V((-0.12, -0.5, -0.86)).normalized()   # the blade runs this way from the hand
    side = d.cross(V((1, 0, 0))).normalized()   # the flat faces left-right; the edge faces front-back
    fl = d.cross(side).normalized()
    hilt0 = gR - d * 0.28
    g0 = gR + d * 0.14
    tip = g0 + d * 1.55
    pts, edge = [], []
    for k in range(9):
        u = k / 8
        w = 0.1 * (1 - u) + 0.075 * u if u < 0.86 else 0.075 * (1 - (u - 0.86) / 0.14)
        p = g0 + d * (u * 1.55)
        for e in (1, -1):
            pts += [p + side * e * w]
            edge.append(p + side * e * (w + 0.003)) if e == 1 else None
        pts += [p + fl * 0.022, p - fl * 0.022]
    P['blade'] = sharp(hull('blade', pts, bevel=0.002), 20)
    P['fuller'] = hull('fuller', [g0 + d * 0.04 + side * x + fl * y for x in (-0.018, 0.018) for y in (-0.026, 0.026)] + [g0 + d * 1.1 + side * x + fl * y for x in (-0.012, 0.012) for y in (-0.024, 0.024)])
    P['cross'] = hull('cross', [g0 + side * x + fl * y + d * z for x in (-0.3, 0.3) for y in (-0.04, 0.04) for z in (-0.05, 0.02)]
                      + [g0 + side * x + d * 0.08 for x in (-0.34, 0.34)] + [g0 + side * x * 0.4 - d * 0.08 for x in (-0.3, 0.3)])
    P['ricasso'] = hull('ricasso', [g0 + side * x + fl * y + d * z for x in (-0.06, 0.06) for y in (-0.05, 0.05) for z in (-0.06, 0.14)] + [g0 + d * 0.2])
    P['hilt'] = sharp(tube('hilt', [hilt0, gR, g0], [0.032, 0.034, 0.036], sub=1), 50)
    grip = [ring(f'grip{i}', hilt0.lerp(g0, 0.1 + i * 0.06), 0.036, 0.007, rot=d.to_track_quat('Z', 'Y').to_euler(), seg=(18, 6)) for i in range(14)]
    P['grip'] = join(grip, 'grip')
    P['pommel'] = hull('pommel', [hilt0 - d * z + side * x + fl * y for x, y, z in
                                  [(0.06, 0, 0.02), (-0.06, 0, 0.02), (0, 0.06, 0.02), (0, -0.06, 0.02), (0.045, 0.045, 0.1), (-0.045, -0.045, 0.1), (0.045, -0.045, 0.1), (-0.045, 0.045, 0.1), (0, 0, 0.16), (0, 0, -0.03)]])
    return P, edge, gR, d

gear, EDGE, GRIP, SWORD = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    # the visor: one deep slot under the brow, burning amber, two hotter points for eyes
    slot = [orb('visor', H + V((0, -0.172, 0.022)) * KS + V((0, 0, 0)), (0.12, 0.014, 0.016)),
            orb('eyeL', H + V((0.055 * KS, -0.18 * KS, 0.024 * KS)), (0.028, 0.012, 0.02)), orb('eyeR', H + V((-0.055 * KS, -0.18 * KS, 0.024 * KS)), (0.028, 0.012, 0.02))]
    g['eyes'] = (join(slot, 'eyes'), 'head')
    # a rune cut in the shield's face, and the sword's fuller, lit
    c = J["elbow.L"].lerp(J["wrist.L"], 0.55) + V((0.02, -0.15, 0.0))
    up = V((0, 0, 1)); rt = up.cross(SH_N).normalized()
    SP = lambda x, z, d: c + rt * x * 1.2 + up * z * 1.25 + SH_N * d
    rune = [hull('r0', [SP(x, z, dd) for x in (-0.012, 0.012) for z in (-0.5, 0.55) for dd in (0.105, 0.118)]),
            hull('r1', [SP(x, z, dd) for x in (-0.18, 0.18) for z in (0.17, 0.195) for dd in (0.1, 0.112)])]
    for s in (1, -1):
        rune.append(hull('r2', [SP(s * 0.01, 0.55, 0.115), SP(s * 0.2, 0.36, 0.105), SP(s * 0.02, 0.5, 0.115), SP(s * 0.2, 0.33, 0.105), SP(s * 0.01, 0.55, 0.1), SP(s * 0.2, 0.36, 0.095)]))
    g['rune'] = (join(rune, 'rune'), 'forearm.L')
    return g
glow = build_glow()

def part_info(name):
    side = side_of(name)
    if name.startswith('m.'): return 'stone', muscle_bones(name)
    if name == 'body_high': return 'mortar', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'helm': return 'stone', ('rigid', 'head')
    if name == 'gorget': return 'stone', ('smooth', {'neck', 'chest'})
    if name.startswith(('pauld', 'haute')): return 'stone', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('couter'): return 'stone', ('rigid', 'forearm.' + side)
    if name.startswith('kneecop'): return 'stone', ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'belt': return 'stone', ('rigid', 'hips')
    if name in ('tabard', 'tabardb'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'shield': return 'stone', ('rigid', 'forearm.L')
    if name in ('shieldrim', 'shieldboss', 'shieldarm'): return 'steel', ('rigid', 'forearm.L')
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name in ('blade', 'fuller', 'cross', 'ricasso', 'hilt', 'pommel'): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name == 'hands': return 2400
    if name == 'helm': return 1400
    if name.startswith('m.'): return plate_tris(name, 600, 320)
    if name.startswith(('tabard',)): return 900
    if name in ('shield', 'shieldrim'): return 900
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt', 'gorget')): return 600
    if name == 'grip': return 1100
    return min(tris, 400)

def uv_weight(name):
    if name in ('helm', 'shield', 'blade'): return 2.4
    if name.startswith('m.'): return plate_uv(name)
    if name.startswith('tabard'): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

AMBER = (0.85, 0.6, 0.08)
MATS, FLAT = knight_mats(accent=AMBER, paint=(0.05, 0.035, 0.01),
                         cloth=[(0.0, (0.03, 0.018, 0.005)), (0.4, (0.016, 0.013, 0.01)), (1.0, (0.012, 0.011, 0.01))])
MATS['stone'] = mat_stone('stone', [(0.25, (0.035, 0.035, 0.036)), (0.55, (0.08, 0.078, 0.076)), (0.85, (0.14, 0.135, 0.13))], scale=3.5)
MATS['mortar'] = mat_stone('mortar', [(0.3, (0.012, 0.011, 0.01)), (0.7, (0.03, 0.028, 0.025))], glow=(0.5, 0.33, 0.04), scale=7.0, glow_width=0.02)
FLAT['stone'] = (0.04, 0.039, 0.038, 0.9, 0)
FLAT['mortar'] = (0.025, 0.023, 0.02, 0.95, 0)

def idle(t):
    p = idle_pose(t, T=4.6, k=0.6)
    # the shield arm held up across the body, the sword arm low
    p = posed(p, upperarm_L=(-0.25, 0, 0.12), forearm_L=(-0.55, 0, 0))
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R', 'upperarm.L', 'forearm.L'):
        p[k] = idle(t)[k]
    return p

def attack(t):
    # "Judgement of the Gate": crouched behind the raised shield, then the shield swept aside and
    # the greatsword brought up over the crest and down in a full cleave into the floor
    brace = ease(t / 0.45) * (1 - ease((t - 0.95) / 0.3))
    lift = ease((t - 0.8) / 0.4) * (1 - ease((t - 1.3) / 0.14))
    cut = ease((t - 1.3) / 0.14) * (1 - ease((t - 2.2) / 0.75))
    shake = math.sin(t * 70) * 0.02 * ease((t - 1.42) / 0.05) * (1 - ease((t - 1.8) / 0.3))
    act = max(brace, lift, cut)
    p = fade_idle(idle(t), 1 - act)
    p = posed(p, upperarm_L=(0.25 * act, 0, -0.12 * act), forearm_L=(0.55 * act, 0, 0))   # undo the idle's shield lift
    p = posed(p, upperarm_L=(-0.9 * brace - 0.3 * lift + 0.1 * cut, 0, 0.5 * lift + 0.7 * cut), forearm_L=(-0.8 * brace - 0.5 * lift - 0.4 * cut, 0, 0),
              upperarm_R=(0.4 * brace - 2.9 * lift - 0.55 * cut, 0, 0), forearm_R=(-0.2 * brace - 0.5 * lift - 0.1 * cut, 0, 0), hand_R=(0.3 * lift + 0.6 * cut, 0, 0),
              spine=(0.15 * brace - 0.22 * lift + 0.4 * cut + shake, 0, 0.1 * brace - 0.12 * lift + 0.05 * cut), chest=(0.1 * brace - 0.15 * lift + 0.25 * cut, 0, 0.08 * brace - 0.1 * lift),
              head=(-0.12 * brace + 0.1 * lift - 0.1 * cut, 0, 0),
              thigh_L=(-0.45 * brace - 0.25 * lift - 0.6 * cut, 0, 0), shin_L=(0.55 * brace + 0.3 * lift + 0.75 * cut, 0, 0),
              thigh_R=(-0.25 * brace + 0.3 * cut, 0, 0), shin_R=(0.5 * brace + 0.35 * cut, 0, 0),
              foot_L=(-0.1 * brace - 0.15 * cut, 0, 0), foot_R=(-0.25 * brace - 0.3 * cut, 0, 0))
    p['_hips_loc'] = (0, -0.16 * brace - 0.03 * lift - 0.22 * cut, 0)   # the hips bone's own frame: y is up its length
    return p

parts = {'body_high': body, **gear}
finish('Sentinel', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, AMBER,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
