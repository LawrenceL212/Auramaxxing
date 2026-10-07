# The Abyssal Titan (weekly boss): a chained brute out of the deep, over four metres, hunched forward
# under its own weight, every plate the shape of the muscle under it and the bare hide between them
# split by burning fissures. Read from its shadow alone: the hunch with the head slung low between
# the shoulders, short thick horns, broken shackles and chains swinging from both wrists, and a
# giant spiked maul whose head rests on the floor. The face: an open-jawed helm, a jagged maw.
# Its attack: the maul heaved up in both hands and smashed into the ground.
#   python3.11 titan.py [--bake] [--tex 1024] [--out ../../titan.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(97)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'titan.glb'))
KZ = 1.07

# a brute's proportions: a deep, forward-slung chest, the head low and forward, long heavy arms
J = {'pelvis': (0, 0.05, 2.0), 'waist': (0, 0.0, 2.32), 'chest': (0, -0.1, 2.74), 'upchest': (0, -0.15, 3.02),
     'neck': (0, -0.33, 3.15), 'head': (0, -0.45, 3.27), 'crown': (0, -0.47, 3.5)}
J = {k: V((x, y, z * KZ)) for k, (x, y, z) in J.items()}
mirrored(J, {'shoulder': (0.74, -0.1, 3.0 * KZ), 'elbow': (0.98, 0.02, 2.4 * KZ), 'wrist': (1.07, -0.2, 1.84 * KZ), 'knuckle': (1.1, -0.29, 1.65 * KZ),
             'hip': (0.25, 0.05, 1.95 * KZ), 'knee': (0.38, -0.14, 1.07 * KZ), 'ankle': (0.42, 0.08, 0.17), 'toe': (0.48, -0.33, 0.05)})
KS = 1.075   # and the whole brute scaled up to stand about 4.2 m to the horn tips
J = {k: v * KS for k, v in J.items()}
H = J['head']
KH = 1.32 * KS   # the helm's size against the executioner's
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.4, waist=0.95, cut=2)
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
    # a heavy skull of a helm: a low flat crown, a brow ridge jutting over two deep sockets, a
    # snout plate, and the lower jaw hanging open below, both rows set with jagged iron teeth
    cap = hull('cap', M(both([(0.0, 0.0, 0.12), (0.12, -0.04, 0.1), (0.15, 0.06, 0.0), (0.13, -0.12, 0.02), (0.0, 0.14, 0.02),
                              (0.1, 0.1, -0.08), (0.0, -0.13, 0.1), (0.12, -0.04, -0.06)])), bevel=0.006)
    brow = hull('brow', M(both([(0.15, -0.13, 0.05), (0.06, -0.2, 0.04), (0.0, -0.18, 0.06), (0.16, -0.09, 0.08), (0.05, -0.17, 0.0),
                               (0.14, -0.12, 0.0), (0.0, -0.21, -0.01)])))
    snout = hull('snout', M(both([(0.09, -0.17, -0.02), (0.05, -0.24, -0.05), (0.0, -0.25, -0.03), (0.09, -0.19, -0.09), (0.0, -0.24, -0.1),
                                (0.12, -0.1, -0.08), (0.12, -0.12, 0.0)])))
    cheek = hull('cheek', M(both([(0.15, -0.09, -0.02), (0.14, -0.04, -0.14), (0.11, -0.14, -0.11), (0.15, 0.04, -0.05), (0.1, 0.02, -0.16)])))
    # the jaw: hinged open, dropped and pushed forward, a heavy chin
    jaw = hull('jaw', M(both([(0.12, -0.05, -0.18), (0.1, -0.16, -0.26), (0.06, -0.22, -0.3), (0.0, -0.23, -0.32), (0.12, -0.02, -0.23),
                              (0.08, -0.18, -0.34), (0.0, -0.21, -0.37), (0.11, -0.06, -0.27)])))
    teeth = []
    for i in range(7):   # upper row along the snout's edge, lower row on the jaw, pointing at each other
        x = -0.075 + i * 0.025
        r = random.Random(i)
        teeth.append(blade(f'tu{i}', H + V((x, -0.23 + abs(x) * 0.5, -0.09)) * KH, H + V((x * 1.05, -0.23 + abs(x) * 0.5, -0.15 - r.uniform(0, 0.04))) * KH, 0.016 * KH, thick=0.5, sub=0))
        teeth.append(blade(f'tl{i}', H + V((x, -0.2 + abs(x) * 0.5, -0.29)) * KH, H + V((x * 1.05, -0.21 + abs(x) * 0.5, -0.22 + r.uniform(0, 0.03))) * KH, 0.016 * KH, thick=0.5, sub=0))
    for s in (1, -1):   # two tusks up from the jaw's corners
        teeth.append(blade('tusk', H + V((s * 0.1, -0.15, -0.27)) * KH, H + V((s * 0.14, -0.22, -0.1)) * KH, 0.03 * KH, curve=V((s * 0.02, -0.02, 0)), thick=0.7, sub=0))
    return join([cap, brow, snout, cheek], 'helm'), join([jaw] + teeth, 'jaw')

def build_gear():
    helm, jaw = build_helm()
    P = {'hands': hands, 'helm': helm, 'jaw': jaw}
    # plate on the shoulders, chest, back and legs; the arms and belly bare hide
    muscle_plates(P, src, FIELDS, scale=1.1, skip=('ab', 'serratus', 'biceps', 'brachiorad', 'flexors', 'extensors', 'oblique'))
    # the big plates forged in a few hard planes, not blown round over the brute's muscle
    for k in list(P):
        if k.startswith(('m.sidedelt', 'm.frontdelt', 'm.reardelt', 'm.pec', 'm.vastuslat', 'm.rectusfem', 'm.hamstrings', 'm.glute', 'm.lat', 'm.uppertrap')):
            angular(P[k], 220 if k.startswith(('m.sidedelt', 'm.pec')) else 160)
    # short thick horns out of the helm's temples: out, then forward and up like a bull's
    for s, n in SIDES:
        b = H + V((s * 0.13, -0.02, 0.07)) * KH
        pts = [b, b + V((s * 0.12, -0.02, 0.04)) * KH, b + V((s * 0.2, -0.1, 0.12)) * KH, b + V((s * 0.21, -0.22, 0.24)) * KH]
        P['horn.' + n] = ribbed('horn.' + n, pts, [0.07 * KH, 0.06 * KH, 0.04 * KH, 0.006], n=40, ribs=7, depth=0.12)
        sh = J['shoulder.' + n]
        if 'm.sidedelt.' + n in P:   # spikes driven up out of the shoulder plates
            P['dspike.' + n] = thorns(P['m.sidedelt.' + n], 'dspike.' + n, lambda c, s=s, sh=sh: c.z > sh.z + 0.0 and s * c.x > abs(sh.x) - 0.02,
                                      3, 0.46, 0.07, up=2.0, back=0.2, curve=0.25, seed=11 + s, flat=0.6)
    # a ridge of spines down the hunched back, out of the plates over the spine
    sp = []
    for i in range(5):
        u = i / 4
        base = J['upchest'].lerp(J['waist'], u) + V((0, 0.36 - 0.12 * u, 0.06))
        sp.append(blade(f'spine{i}', base - V((0, 0.06, 0)), base + V((0, 0.3 - 0.12 * u, 0.2 - 0.06 * u)), 0.07 - 0.02 * u, thick=0.4, curve=V((0, 0.04, 0.04))))
    P['spines'] = join(sp, 'spines')
    for s, n in SIDES:
        el, ke, an, to = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.15 and p.y < ke.y, push=0.06, thick=0.025, smooth=4, facets=0.0, rim=0.014, rivets=0.06, bead=True)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.12, 0.02)), ke + V((s * 0.04, -0.3, 0.16)), 0.05, curve=V((0, 0, 0.04)), thick=0.5)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.09 and abs(p.x - an.x) < 0.18, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        # the broken shackle: a thick iron cuff on the wrist, a few links of chain hanging off it, the
        # last one torn open
        wr, kn = J['wrist.' + n], J['knuckle.' + n]
        fa = (wr - el).normalized()
        cc = el.lerp(wr, 0.86)
        rot = fa.to_track_quat('Z', 'Y').to_euler()
        P['cuff.' + n] = join([ring('cuff', cc, 0.115, 0.04, rot=rot, seg=(16, 6), flat=1.6),
                               ring('cuffb', cc + fa * 0.07, 0.11, 0.022, rot=rot, seg=(16, 5)),
                               ring('cuffc', cc - fa * 0.07, 0.11, 0.022, rot=rot, seg=(16, 5))], 'cuff.' + n)
        links = []
        start = cc + V((s * 0.05, 0.06, -0.1))
        L_ = 8 if s > 0 else 5
        for i in range(L_):
            p = start + V((s * 0.015 * i, 0.012 * i, -0.105 * i))
            rr = 0.06 - 0.0015 * i
            rt = (math.pi / 2 if i % 2 else 0, 0, math.pi / 2 + 0.2 * s)
            ln = ring(f'ln{i}', p, rr, 0.017, rot=rt, seg=(10, 5), flat=1.0)
            if i == L_ - 1:   # torn: half the last link gone
                bm = bmesh.new(); bm.from_mesh(ln.data)
                bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=p, plane_no=V((0.3, 0.2, -1)), clear_outer=True)
                bm.to_mesh(ln.data); bm.free()
            links.append(ln)
        P['chain.' + n] = join(links, 'chain.' + n)
    # a heavy belt, and a loincloth of hide strips front and back
    P['belt'] = plate(shell, 'belt', lambda p: 2.0 * KZ * KS < p.z < 2.13 * KZ * KS and abs(p.x) < 0.5, push=0.06, thick=0.025, smooth=3, facets=0.1, rim=0.012, rivets=0.06)
    P['loin'] = cloth('loin', 12, 20, lambda u, t: (u * (0.24 + t * 0.06), -0.3 - t * 0.08 + u * u * 0.06, 2.08 * KZ * KS - t * 1.05), thick=0.018, strips=(0.35, 0.1, 13))
    P['loinb'] = cloth('loinb', 12, 20, lambda u, t: (u * (0.28 + t * 0.06), 0.28 + t * 0.1 - u * u * 0.06, 2.08 * KZ * KS - t * 1.0), thick=0.018, strips=(0.35, 0.1, 17))
    for s, n in SIDES:
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, J['hip.' + n], J['knee.' + n], (0, 1, 0), t0=0.3, t1=0.92, width=0.04)
    # the maul: gripped at the top of a thick haft in the right hand, the head resting on the floor
    # beside the right foot; an eight-sided iron drum banded and studded with pyramid spikes
    gR = J['wrist.R'].lerp(J['knuckle.R'], 0.6)
    hd = V((-0.98 * KS, -0.32 * KS, 0.38))   # the head's centre
    d = (hd - gR).normalized()
    top = gR - d * 0.32
    P['haft'] = sharp(tube('haft', [top, gR, gR.lerp(hd, 0.5), hd], [0.042, 0.045, 0.048, 0.05], sub=1), 50)
    P['grip'] = join([ring(f'grip{i}', gR + d * (-0.14 + i * 0.03), 0.048, 0.008, rot=d.to_track_quat('Z', 'Y').to_euler(), seg=(18, 6)) for i in range(12)], 'grip')
    P['pommel'] = hull('pommel', [top + V((x, y, z)) for x in (-0.06, 0.06) for y in (-0.06, 0.06) for z in (-0.04, 0.04)] + [top - d * 0.12])
    ax = V((0, 1, 0))   # the drum's axis: its striking faces front and back
    ax = (ax - d * ax.dot(d)).normalized()
    e1 = d; e2 = ax.cross(e1).normalized()
    R, Lh = 0.3, 0.36
    drum = []
    for k in range(8):
        a = (k + 0.5) / 8 * TAU
        r = e1 * math.cos(a) + e2 * math.sin(a)
        for z in (-Lh, Lh):
            drum.append(hd + r * R + ax * z)
        for z in (-Lh - 0.06, Lh + 0.06):
            drum.append(hd + r * R * 0.7 + ax * z)
    P['maulhead'] = hull('maulhead', drum, bevel=0.008)
    bands = []
    for z in (-Lh * 0.6, Lh * 0.6):
        bands.append(hull('band', [hd + (e1 * math.cos((k + 0.5) / 8 * TAU) + e2 * math.sin((k + 0.5) / 8 * TAU)) * (R + 0.025) + ax * (z + w) for k in range(8) for w in (-0.04, 0.04)]))
    P['maulband'] = join(bands, 'maulband')
    spk = []
    for k in range(8):   # a ring of spikes round the middle of the drum, between the bands
        a = k / 8 * TAU
        r = e1 * math.cos(a) + e2 * math.sin(a)
        if r.dot(-d) > 0.9: continue   # not into the haft
        spk.append(spike(f'ms{k}', hd + r * (R - 0.02), hd + r * (R + 0.2), 0.065, n=4, sub=0))
        for z in (-Lh * 0.95, Lh * 0.95):
            if r.dot(-d) > 0.5: continue
            spk.append(spike(f'ms{k}', hd + r * (R - 0.02) + ax * z * 0.98, hd + r * (R + 0.11) + ax * z * 1.05, 0.045, n=4, sub=0))
    for z in (-1, 1):   # and one great spike from each striking face, four short ones round it
        f0 = hd + ax * z * (Lh + 0.05)
        spk.append(spike('mf', f0, f0 + ax * z * 0.22, 0.08, n=4, sub=0))
        for k in range(4):
            a = k / 4 * TAU + 0.4
            o = (e1 * math.cos(a) + e2 * math.sin(a)) * 0.15
            spk.append(spike('mf', f0 + o, f0 + o * 1.3 + ax * z * 0.1, 0.04, n=4, sub=0))
    P['maulspikes'] = sharp(join(spk, 'maulspikes'), 30)
    return P

gear = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = [orb('eye', H + V((s * 0.075, -0.175, 0.02)) * KH, (0.03, 0.014, 0.018)) for s in (1, -1)]
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    # the throat: a furnace light in the open maw
    g['maw'] = (orb('maw', H + V((0, -0.16, -0.18)) * KH, (0.08, 0.05, 0.06)), 'head')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'kneecop')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'hide', ('smooth', None)
    if name == 'hands': return 'hide', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm', 'jaw'): return 'helm', ('rigid', 'head')
    if name.startswith('horn'): return 'horn', ('rigid', 'head')
    if name.startswith('dspike'): return 'steel', ('smooth', {'chest', 'upperarm.' + side})
    if name == 'spines': return 'bone', ('smooth', {'spine', 'chest'})
    if name.startswith(('kneecop', 'kspike')): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith(('cuff', 'chain')): return 'steel', ('rigid', 'forearm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name in ('loin', 'loinb'): return 'leather', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name in ('haft', 'pommel', 'maulhead', 'maulband', 'maulspikes'): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 9000
    if name == 'hands': return 2600
    if name in ('helm', 'jaw'): return 1200
    if name.startswith('horn'): return 700
    if name.startswith('m.'): return plate_tris(name)
    if name.startswith('loin'): return 1000
    if name.startswith('chain'): return 1000
    if name.startswith('cuff'): return 600
    if name in ('maulhead', 'maulspikes'): return 900
    if name.startswith(('kneecop', 'sabaton', 'belt', 'dspike')): return 600
    if name == 'grip': return 1000
    return min(tris, 400)

def uv_weight(name):
    if name in ('helm', 'jaw', 'maulhead'): return 2.6
    if name.startswith('horn'): return 1.6
    if name.startswith('m.'): return plate_uv(name)
    if name.startswith('loin'): return 0.7
    if name == 'body_high': return 0.6
    return 1.0

RED = (0.9, 0.12, 0.07)
MATS, FLAT = knight_mats(accent=RED, paint=(0.045, 0.006, 0.005), horn=((0.012, 0.008, 0.008), (0.12, 0.05, 0.035)))
MATS['hide'] = mat_hide('hide', [(0.3, (0.014, 0.009, 0.01)), (0.6, (0.035, 0.018, 0.017)), (0.85, (0.06, 0.025, 0.022))],
                        fissure=RED, scale=30.0, big=6.0, rough=(0.6, 0.35), bump=(0.6, 0.9))
FLAT['hide'] = (0.028, 0.012, 0.011, 0.6, 0)

def idle(t):
    T = 5.0
    s = math.sin(TAU * t / T)
    p = idle_pose(t, T=T, k=0.9)
    # a heavy breath that lifts the hunched shoulders
    p = posed(p, spine=(0.12, 0, 0), chest=(0.1 - 0.03 * s, 0, 0), neck=(0.05, 0, 0), head=(-0.32, 0, 0), thigh_L=(-0.1, 0, 0), thigh_R=(-0.1, 0, 0), shin_L=(0.12, 0, 0), shin_R=(0.12, 0, 0))
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R'):   # the maul hand stays on the maul
        p[k] = idle(t)[k]
    return p

def attack(t):
    # "Abyssal Quake": the maul dragged up and heaved overhead in both hands, held at the top, then
    # brought down into the floor with the whole body dropping behind it; a shudder, then it rises
    up = ease((t - 0.1) / 0.7) * (1 - ease((t - 1.15) / 0.16))
    down = ease((t - 1.15) / 0.16) * (1 - ease((t - 2.2) / 0.75))
    shake = math.sin(t * 60) * 0.03 * ease((t - 1.3) / 0.05) * (1 - ease((t - 1.9) / 0.4))
    act = max(up, down)
    p = fade_idle(idle(t), 1 - act)
    for n, sg in (('L', 1), ('R', -1)):
        p = posed(p, **{f'upperarm_{n}': (-2.5 * up - 1.05 * down, 0, sg * (-0.35 * up - 0.3 * down)),
                        f'forearm_{n}': (-0.6 * up - 0.1 * down, 0, 0), f'hand_{n}': (0.2 * up - 0.6 * down, 0, 0)})
    p = posed(p, spine=(-0.25 * up + 0.5 * down + shake, 0, 0), chest=(-0.2 * up + 0.3 * down, 0, 0), neck=(-0.12 * act, 0, 0), head=(0.1 * up + 0.2 * down, 0, 0),
              thigh_L=(-0.15 * up - 0.75 * down, 0, -0.15 * down), shin_L=(0.15 * up + 0.95 * down, 0, 0),
              thigh_R=(0.05 * up - 0.3 * down, 0, 0.2 * down), shin_R=(0.75 * down, 0, 0), foot_L=(-0.2 * down, 0, 0), foot_R=(-0.35 * down, 0, 0))
    p['_hips_loc'] = (0, 0.04 * up - 0.42 * down, 0)   # the hips bone's own frame: y is up its length
    return p

parts = {'body_high': body, **gear}
finish('Titan', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, RED,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
