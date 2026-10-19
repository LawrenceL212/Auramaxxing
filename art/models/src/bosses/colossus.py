# The Dungeon Colossus (weekly boss): a siege knight the size of a gatehouse, over four metres, in
# layer on layer of heavy plate cut to the muscle. Read from its shadow alone: a fortress of a helm,
# square, crowned with battlements and cut by one slit; pauldrons twice the width of its chest, each
# braced by a stone-and-iron buttress rising to a merlon; a war hammer with a great block of a head
# carried on the right shoulder.
# Its attack: the hammer swung off the shoulder in one wide horizontal sweep, the whole torso turning.
#   python3.11 colossus.py [--bake] [--tex 1024] [--out ../../colossus.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *
from mathutils import Matrix

reset(113)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'colossus.glb'))
KS = 1.3

J = {'pelvis': (0, 0.02, 1.81), 'waist': (0, 0.03, 2.06), 'chest': (0, 0.0, 2.41), 'upchest': (0, 0.02, 2.63),
     'neck': (0, -0.02, 2.79), 'head': (0, -0.04, 2.95), 'crown': (0, -0.03, 3.14)}
J = {k: V(v) * KS for k, v in J.items()}
mirrored(J, {'shoulder': (0.6 * KS, 0.03 * KS, 2.62 * KS), 'elbow': (0.82 * KS, 0.1 * KS, 2.1 * KS), 'wrist': (0.9 * KS, -0.06 * KS, 1.63 * KS), 'knuckle': (0.93 * KS, -0.12 * KS, 1.46 * KS),
             'hip': (0.2 * KS, 0.02 * KS, 1.77 * KS), 'knee': (0.28 * KS, -0.07 * KS, 0.98 * KS), 'ankle': (0.32 * KS, 0.1, 0.17), 'toe': (0.37 * KS, -0.32, 0.05)})
H = J['head']
KH = 1.45   # the helm's size against the executioner's
BONES = human_bones()
FA_IDLE = -1.9   # the right forearm's bend in the idle, the hammer carried on the shoulder

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.45, waist=1.05, cut=2)
M = lambda pts: [H + V(p) * KH for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def angular(ob, tris):
    # collapse a plate to a few hundred triangles: its curve breaks into flat facets with hard edges
    n = tri_count(ob)
    if n > tris:
        d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = tris / n; d.use_collapse_triangulate = True
        apply_mods(ob)
    return sharp(ob, 20)

def build_helm():
    # a keep: a square tower of a helm, flat-faced, its sides battered outward to the jaw; one slit
    # across the face; a parapet round the top with merlons on it, a beak of a nasal down the front
    tower = hull('tower', M(both([(0.15, -0.17, 0.2), (0.15, 0.14, 0.2), (0.165, -0.19, -0.05), (0.165, 0.16, -0.05), (0.18, -0.19, -0.22), (0.18, 0.15, -0.22),
                                  (0.0, -0.2, 0.2), (0.0, -0.215, -0.22)])), bevel=0.006)
    parapet = hull('parapet', M(both([(0.18, -0.2, 0.2), (0.18, 0.17, 0.2), (0.18, -0.2, 0.25), (0.18, 0.17, 0.25), (0.0, -0.22, 0.2), (0.0, -0.22, 0.25)])), bevel=0.004)
    mer = []
    for i, (x, y) in enumerate([(-0.13, -0.17), (0.0, -0.18), (0.13, -0.17), (-0.13, 0.14), (0.0, 0.15), (0.13, 0.14), (-0.155, -0.02), (0.155, -0.02)]):
        sx, sy = (0.04, 0.03) if abs(x) < 0.15 else (0.03, 0.045)
        hgt = 0.12 if i == 1 else 0.09
        mer.append(hull(f'mer{i}', M([(x + a * sx, y + b * sy, c) for a in (-1, 1) for b in (-1, 1) for c in (0.24, 0.24 + hgt)])))
    brow = hull('brow', M(both([(0.17, -0.2, 0.06), (0.17, -0.23, 0.05), (0.0, -0.245, 0.06), (0.0, -0.23, 0.1), (0.17, -0.2, 0.1)])))
    nasal = hull('nasal', M(both([(0.015, -0.24, 0.05), (0.025, -0.23, 0.0), (0.0, -0.26, -0.12), (0.02, -0.225, -0.12)])))
    bars = []
    for z in (-0.08, -0.15):   # breaths cut as bars below the slit
        for s in (1, -1):
            bars.append(hull('bar', M([(s * x, y, z + dz) for x in (0.04, 0.13) for y in (-0.225, -0.205) for dz in (-0.012, 0.012)])))
    return join([tower, parapet, brow, nasal] + mer + bars, 'helm')

def unpose(p):
    # a point placed in the idle pose, back to where it sits in the rest pose (the forearm unbent)
    el = J['elbow.R']
    return el + Matrix.Rotation(-FA_IDLE, 3, 'X') @ (V(p) - el)

def build_gear():
    P = {'hands': hands, 'helm': build_helm()}
    muscle_plates(P, src, FIELDS, scale=1.4, skip=('frontdelt', 'sidedelt', 'reardelt'))
    for k in list(P):
        if k.startswith('m.'):
            angular(P[k], 240 if k.startswith(('m.pec', 'm.lat', 'm.uppertrap', 'm.glute', 'm.vastuslat')) else 150)
    # a second layer over the chest: a breastplate in two halves following the pecs, standing off them
    P['breast'] = angular(plate(shell, 'breast', lambda p: p.y < -0.05 and J['chest'].z - 0.12 < p.z < J['upchest'].z + 0.06 and abs(p.x) < 0.38,
                                push=0.1, thick=0.03, smooth=3, facets=0.0, rim=0.016, rivets=0.08, bead=True), 500)
    P['gorget'] = angular(plate(shell, 'gorget', lambda p: J['upchest'].z + 0.04 < p.z < J['neck'].z + 0.06 and abs(p.x) < 0.3, push=0.08, thick=0.03, smooth=3, facets=0.0, rim=0.014), 300)
    # the pauldrons: three great shells stacked down the arm, twice the chest's breadth, and on each
    # a buttress of stone blocks bound in iron rising from the outer edge up beside the helm
    for s, n in SIDES:
        sh = J['shoulder.' + n]
        for i in range(3):
            c = sh + V((s * (0.12 + 0.13 * i), 0.0, 0.24 - 0.2 * i))
            w = 0.4 - 0.04 * i
            P[f'pauld{i}.{n}'] = hull(f'pauld{i}.{n}', [c + V((s * x * 1.3, y, z * 1.3)) for x, y, z in
                                    [(-0.24, -w * 0.9, 0.06), (-0.24, w * 0.9, 0.06), (0.0, -w, 0.04), (0.0, w, 0.04), (0.2, -w, -0.06), (0.2, w, -0.06),
                                     (0.28, -w * 0.9, -0.22), (0.28, w * 0.9, -0.22), (-0.2, -w * 0.8, -0.06), (-0.2, w * 0.8, -0.06),
                                     (0.16, -w * 0.85, -0.2), (0.16, w * 0.85, -0.2)]], bevel=0.008)
        top = sh + V((s * 0.3, 0.0, 0.14))   # sunk into the top shell, so it grows out of it
        blocks, irons = [], []
        rnd = random.Random(7 + s)
        z = 0.0
        for k in range(3):   # coursed stone blocks, each set square on the one below, stepping in
            b0 = top + V((s * -0.06 * k, 0, z))
            ww, dd, hh = 0.2 - 0.03 * k, 0.26 - 0.035 * k, 0.2 - 0.02 * k
            j = lambda: rnd.uniform(-0.015, 0.015)
            blocks.append(hull(f'bstone{k}', [b0 + V((x + j(), y + j(), zz + j() * 0.5)) for x in (-ww, ww) for y in (-dd, dd) for zz in (0.0, hh)]
                               + [b0 + V((x * 0.9, y * 0.9, zz)) for x in (-ww, ww) for y in (-dd, dd) for zz in (-0.012, hh + 0.012)], bevel=0.008))
            irons.append(hull(f'biron{k}', [b0 + V((x, y, zz)) for x in (-ww - 0.014, ww + 0.014) for y in (-dd - 0.014, dd + 0.014) for zz in (hh * 0.35, hh * 0.35 + 0.035)], bevel=0.003))
            z += hh
        cap = top + V((s * -0.18, 0, z))
        blocks.append(hull('bmerlon', [cap + V((x, y, zz)) for x in (-0.13, 0.13) for y in (-0.18, 0.18) for zz in (0.0, 0.12)]
                           + [cap + V((x, y, 0.2)) for x in (-0.05, 0.05) for y in (-0.08, 0.08)], bevel=0.005))
        # the iron strut from the buttress down onto the back plate, like a flying buttress
        st0, st1 = top + V((s * -0.06, 0.2, 0.3)), J['upchest'] + V((s * 0.18, 0.28, -0.1))
        irons.append(hull('strut', [p + V((x, y, z)) for p in (st0, st1) for x in (-0.03, 0.03) for y in (-0.025, 0.025) for z in (-0.04, 0.04)]))
        P['buttress.' + n] = join(blocks, 'buttress.' + n)
        P['biron.' + n] = join(irons, 'biron.' + n)
    for s, n in SIDES:
        el, ke, an, to = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.15 and p.y > el.y - 0.02, push=0.06, thick=0.022, smooth=4, facets=0.0, rim=0.014, rivets=0.06, bead=True)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.17 and p.y < ke.y, push=0.07, thick=0.024, smooth=4, facets=0.0, rim=0.014, rivets=0.06, bead=True)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.1 and abs(p.x - an.x) < 0.2, an + V((0, 0.08, 0)), to, 3, -0.1, 1.0, push=0.025, step=0.01))
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, J['shoulder.' + n], el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, J['hip.' + n], ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.04)
    # the fauld: a deep belt and a skirt of heavy plates, front, back and sides
    P['belt'] = plate(shell, 'belt', lambda p: 1.82 * KS < p.z < 1.96 * KS and abs(p.x) < 0.55, push=0.07, thick=0.025, smooth=3, facets=0.1, rim=0.012, rivets=0.06)
    for i, (a, w) in enumerate([(0.0, 0.2), (0.6, 0.15), (-0.6, 0.15), (math.pi, 0.22)]):
        dirv = V((math.sin(a), -math.cos(a), 0))
        side = V((math.cos(a), math.sin(a), 0))
        r0 = 0.36 if abs(a) < 1 else 0.33
        b0 = V((0, 0.02, 1.84 * KS)) + dirv * r0
        P[f'tasset{i}'] = hull(f'tasset{i}', [b0 + side * x + dirv * dd + V((0, 0, z)) for x in (-w, w) for z, dd in ((0.0, 0.0), (-0.55, 0.1)) for dd2 in (0,)] +
                               [b0 + side * x + dirv * (dd - 0.03) + V((0, 0, z)) for x in (-w, w) for z, dd in ((0.0, 0.0), (-0.55, 0.1))], bevel=0.006)
    # the war hammer, placed as carried in the idle, on the right shoulder, then unbent to the rest
    # pose: a long iron-shod haft, langets down it, a block of a head with flat faces and a back spike
    el, wr, kn = J['elbow.R'], J['wrist.R'], J['knuckle.R']
    R = Matrix.Rotation(FA_IDLE, 3, 'X')
    g = el + R @ (wr.lerp(kn, 0.6) - el)        # the grip in the idle
    up = (J['shoulder.R'] + V((-0.5, 0.3, 0.75)) - g).normalized()   # up past the shoulder and back
    hd = g + up * 1.55
    top, bot = hd + up * 0.22, g - up * 0.55
    P['haft'] = sharp(tube('haft', [unpose(bot), unpose(g), unpose(hd), unpose(top)], [0.042, 0.045, 0.048, 0.04], sub=1), 50)
    d_rest = (unpose(hd) - unpose(g)).normalized()
    P['grip'] = join([ring(f'grip{i}', unpose(g) + d_rest * (-0.16 + i * 0.03), 0.048, 0.008, rot=d_rest.to_track_quat('Z', 'Y').to_euler(), seg=(18, 6)) for i in range(12)], 'grip')
    P['ferrule'] = blade('ferrule', unpose(bot), unpose(bot - up * 0.2), 0.045, thick=1.0)
    ax = V((1, 0, 0))   # the head's long axis: its faces strike sideways, in the sweep
    e2 = up.cross(ax).normalized()
    head = []
    for x in (-0.42, 0.42):
        for y in (-0.2, 0.2):
            for z in (-0.22, 0.22):
                head.append(hd + ax * x + e2 * y + up * z)
    for x in (-0.48, 0.48):   # the faces, a step proud
        for y in (-0.16, 0.16):
            for z in (-0.17, 0.17):
                head.append(hd + ax * x + e2 * y + up * z)
    P['hhead'] = hull('hhead', [unpose(p) for p in head], bevel=0.01)
    bands = []
    for x in (-0.3, 0.3):
        bands.append(hull('hband', [unpose(hd + ax * (x + a) + e2 * y + up * z) for a in (-0.04, 0.04) for y in (-0.225, 0.225) for z in (-0.245, 0.245)]))
    P['hband'] = join(bands, 'hband')
    P['hlang'] = hull('hlang', [unpose(hd + up * z + e2 * y + ax * x) for z in (-0.6, -0.2) for y in (-0.06, 0.06) for x in (-0.055, 0.055)])
    P['hspike'] = blade('hspike', unpose(hd + up * 0.2), unpose(hd + up * 0.55), 0.07, thick=0.5)
    return P

gear = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    # the one slit across the face, burning, two hotter points in it
    sl = [orb('slit', H + V((0, -0.215, 0.025)) * KH, (0.13 * KH, 0.016, 0.014 * KH)),
          orb('eyeL', H + V((0.06, -0.22, 0.025)) * KH, (0.03, 0.015, 0.022)), orb('eyeR', H + V((-0.06, -0.22, 0.025)) * KH, (0.03, 0.015, 0.022))]
    g['eyes'] = (join(sl, 'eyes'), 'head')
    return g
glow = build_glow()

PAINTED = ('kneecop', 'couter')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'helm': return 'helm', ('rigid', 'head')
    if name == 'breast': return 'steel', ('smooth', {'spine', 'chest'})
    if name == 'gorget': return 'steel', ('smooth', {'neck', 'chest'})
    if name.startswith('pauld'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('buttress'): return 'stone', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('biron'): return 'steel', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('couter'): return steel, ('rigid', 'forearm.' + side)
    if name.startswith('kneecop'): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name.startswith('tasset'): return 'steel', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name in ('haft', 'ferrule', 'hhead', 'hband', 'hlang', 'hspike'): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 8000
    if name == 'hands': return 2400
    if name == 'helm': return 1600
    if name.startswith('m.'): return plate_tris(name, 400, 260)
    if name.startswith(('buttress', 'pauld')): return 600
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt', 'breast', 'gorget')): return 700
    if name == 'grip': return 1000
    return min(tris, 400)

def uv_weight(name):
    if name in ('helm', 'hhead'): return 2.6
    if name.startswith(('pauld', 'buttress')): return 1.8
    if name.startswith('m.'): return plate_uv(name)
    if name == 'body_high': return 0.5
    return 1.0

GREY = (0.55, 0.7, 0.72)
MATS, FLAT = knight_mats(accent=GREY, steel=(0.03, 0.031, 0.033), paint=(0.03, 0.036, 0.038))
MATS['stone'] = mat_stone('stone', [(0.25, (0.03, 0.031, 0.032)), (0.55, (0.07, 0.072, 0.072)), (0.85, (0.12, 0.122, 0.12))], glow=(0.3, 0.4, 0.42), scale=4.0, glow_width=0.015)
FLAT['stone'] = (0.045, 0.046, 0.046, 0.9, 0)

def idle(t):
    p = idle_pose(t, T=5.4, k=0.6)
    # the hammer carried on the right shoulder; the left fist low and forward
    p = posed(p, forearm_R=(FA_IDLE + 0.12, 0, 0), upperarm_R=(-0.05, 0.0, 0), hand_R=(0.1, 0, 0), upperarm_L=(0, -0.1, 0))
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R'):   # the hammer stays shouldered
        p[k] = idle(t)[k]
    return p

def attack(t):
    # "Siege Breaker": the torso wound right with the hammer drawn back off the shoulder, then the
    # whole body turned through the swing, arm straight, the head sweeping wide across the front
    wind = ease((t - 0.05) / 0.65) * (1 - ease((t - 1.0) / 0.32))
    sweep = ease((t - 1.0) / 0.32) * (1 - ease((t - 2.1) / 0.85))
    act = max(wind, sweep)
    p = fade_idle(idle(t), 1 - act)
    # the shoulder carry fades with the idle: the arm half unbent in the draw, straight in the swing
    p = posed(p, forearm_R=(FA_IDLE * 0.55 * wind - 0.15 * sweep, 0, 0))
    p = posed(p, upperarm_R=(0.6 * wind - 0.5 * sweep, 0.5 * wind + 1.45 * sweep, -0.4 * wind + 0.3 * sweep),
              upperarm_L=(-0.6 * wind + 0.4 * sweep, -0.5 * wind - 0.9 * sweep, 0), forearm_L=(-0.8 * wind - 0.4 * sweep, 0, 0),
              spine=(0.05 * wind + 0.1 * sweep, 0, -0.42 * wind + 0.55 * sweep), chest=(0.05 * wind + 0.08 * sweep, 0, -0.38 * wind + 0.5 * sweep),
              head=(0, 0, 0.3 * wind - 0.4 * sweep),
              thigh_L=(-0.35 * act, 0, -0.15 * act), shin_L=(0.45 * act, 0, 0), thigh_R=(-0.2 * act, 0, 0.18 * act), shin_R=(0.4 * act, 0, 0),
              foot_L=(-0.1 * act, 0, 0), foot_R=(-0.2 * act, 0, 0))
    p['_hips_loc'] = (0, -0.18 * act, 0)   # the hips bone's own frame: y is up its length
    return p

parts = {'body_high': body, **gear}
finish('Colossus', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, GREY,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
