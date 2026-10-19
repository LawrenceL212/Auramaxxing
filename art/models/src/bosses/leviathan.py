# The Tide Leviathan (weekly boss): a sea titan in barnacled deep-water plate. Read from its shadow
# alone: a shark's armoured head with a long jagged maw, a lure on a curved stalk burning over its
# brow, a high fin-crest down its back and fins raked off both forearms and shins, and a great
# three-pronged trident. The plate is a plate per muscle, crusted over with barnacles and coral.
# Its attack: the trident raised in both hands, then driven down and forward in a two-handed thrust.
#   python3.11 leviathan.py [--bake] [--tex 1024] [--out ../../leviathan.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(97)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'leviathan.glb'))
TIDE = (0.161, 0.502, 0.725)   # #2980B9, its glow

J = {'pelvis': V((0, 0.02, 1.9)), 'waist': V((0, 0.04, 2.16)), 'chest': V((0, 0.0, 2.54)), 'upchest': V((0, 0.03, 2.77)),
     'neck': V((0, -0.03, 2.95)), 'head': V((0, -0.1, 3.12)), 'crown': V((0, -0.1, 3.32))}
mirrored(J, {'shoulder': (0.58, 0.03, 2.77), 'elbow': (0.84, 0.1, 2.22), 'wrist': (0.94, -0.08, 1.72), 'knuckle': (0.97, -0.14, 1.55),
             'hip': (0.2, 0.02, 1.86), 'knee': (0.28, -0.08, 1.02), 'ankle': (0.31, 0.09, 0.15), 'toe': (0.35, -0.3, 0.04)})
Z0 = 0.11   # the whole figure stands this much higher, so the lowest plate just touches the floor
for _k in list(J):
    J[_k] = J[_k] + V((0, 0, Z0))
H = J['head']
BONES = human_bones() + [('jaw', 'jaw0', 'jaw1', 'head')]
J['jaw0'], J['jaw1'] = H + V((0, 0.0, -0.06)), H + V((0, -0.34, -0.14))

body, hands, src, FIELDS, shell = armoured_body(J, mass=1.32, waist=1.0)
K = 1.28   # the head is big: a shark's skull is the whole silhouette's anchor
M = lambda pts: [H + V(p) * K for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def fin(name, root, tip, spread, n=5, web=0.6, thick=0.4):
    """A fin: a fan of tapering ray-spines from one root, webbed between them by a thin panel."""
    root, tip, spread = V(root), V(tip), V(spread)
    rays, panel = [], []
    for i in range(n):
        u = i / (n - 1) - 0.5
        t = tip + spread * u
        r = 0.028 * (1 - 0.5 * abs(u) * 2 * 0.5)
        rays.append(blade(f'{name}r{i}', root + spread * u * 0.16, t, r, thick=thick, power=0.8))
        panel.append([root.lerp(t, k / 6) + (t - root).cross(spread).normalized() * 0.0 for k in range(7)])
    bm = bmesh.new()
    rows = [[bm.verts.new(p) for p in col] for col in panel]
    for i in range(len(rows) - 1):
        for k in range(5):
            a, b = rows[i], rows[i + 1]
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    ob = mesh_from_bm(name + 'web', bm)
    so = ob.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.012; so.offset = 0
    apply_mods(ob); smooth_shade(ob)
    return sharp(join(rays + [ob], name), 32)

def crust(name, pts, seed=0, scale=1.0):
    """Barnacles and coral: a clutch of little fluted cones and knobs grown on a surface."""
    rnd = random.Random(seed + 11)
    obs = []
    for i, (p, nrm) in enumerate(pts):
        p, nrm = V(p), V(nrm).normalized()
        r = scale * rnd.uniform(0.018, 0.045)
        h = r * rnd.uniform(1.0, 2.1)
        c = spike(f'{name}b{i}', p - nrm * r * 0.5, p + nrm * h, r, n=4, power=0.55, flat=rnd.uniform(0.85, 1.15), sub=1)
        obs.append(c)
        if rnd.random() < 0.6:
            obs.append(rock(f'{name}k{i}', p + nrm * r * 0.2, (r * 0.9, r * 0.9, r * 0.6), seed=i * 0.1 + seed, rough=0.3, n=12, bevel=0.004))
    return join(obs, name) if obs else None

def surface_pts(ob, keep, count, seed=0, mind=0.07):
    rnd = random.Random(seed)
    apply_xform(ob)
    vs = [v for v in ob.data.vertices if keep(v.co)]
    rnd.shuffle(vs)
    out = []
    for v in vs:
        if all((v.co - p).length > mind for p, _ in out):
            out.append((v.co.copy(), v.normal.copy()))
        if len(out) >= count:
            break
    return out

# ── the head: a shark's skull in plate. A broad wedge of a snout, gill-slits raked back on the
# cheeks, hollow sunk eyes, a long jagged maw, and an angler's lure on a stalk over the brow. ──
def build_head():
    P = {}
    P['helm'] = hull('helm', M(both([(0.0, 0.16, 0.12), (0.15, 0.12, 0.05), (0.21, 0.0, -0.02), (0.2, -0.1, 0.05), (0.0, -0.22, 0.16),
                                      (0.1, -0.34, 0.03), (0.0, -0.46, 0.04), (0.0, -0.3, 0.12), (0.17, -0.04, -0.1),
                                      (0.08, -0.32, -0.07), (0.0, -0.4, -0.05), (0.12, 0.12, -0.1), (0.0, 0.15, -0.07),
                                      (0.19, -0.18, 0.02), (0.14, -0.26, -0.02)])), bevel=0.003)
    P['snoutkeel'] = hull('snoutkeel', M(both([(0.018, -0.42, 0.06), (0.0, -0.47, 0.03), (0.025, -0.22, 0.15), (0.0, -0.06, 0.19), (0.0, -0.34, 0.11)])), bevel=0.002)
    P['jaw'] = hull('jaw', M(both([(0.17, 0.04, -0.1), (0.14, -0.02, -0.15), (0.08, -0.3, -0.18), (0.0, -0.42, -0.19),
                                    (0.0, -0.36, -0.13), (0.085, -0.26, -0.13), (0.14, -0.06, -0.11), (0.0, 0.0, -0.12)])), bevel=0.003)
    for s, n in SIDES:
        # gill slits: five raked plates on the side of the neck, each a lifted blade of plate
        gl = []
        for i in range(5):
            y = 0.02 + i * 0.055
            gl.append(hull(f'gill{i}', [J['neck'] + V((s * (0.12 - i * 0.004), y + dy, dz)) for dy in (-0.012, 0.012) for dz in (-0.08, 0.06)] +
                                        [J['neck'] + V((s * (0.17 - i * 0.006), y, dz)) for dz in (-0.05, 0.04)], bevel=0.003))
        P['gills.' + n] = join(gl, 'gills.' + n)
        P['cheekfin.' + n] = fin('cheekfin.' + n, H + V((s * 0.13, 0.02, -0.03)) * K, H + V((s * 0.3, 0.3, 0.06)) * K, V((0, 0.0, 0.26)), n=4, thick=0.3)
        # the teeth: a jagged row, upper and lower, each a flat triangle
        up = [blade('t', H + V((s * (0.055 + 0.03 * (i < 2)), -0.1 - 0.086 * i, -0.075)) * K, H + V((s * (0.055 + 0.03 * (i < 2)), -0.11 - 0.086 * i, -0.18 + 0.014 * i)) * K, 0.022 - 0.002 * i, thick=0.35, sub=0) for i in range(4)]
        P['teeth.' + n] = join(up, 'teeth.' + n)
        lo = [blade('lt', H + V((s * (0.055 + 0.028 * (i < 2)), -0.12 - 0.086 * i, -0.16)) * K, H + V((s * (0.055 + 0.028 * (i < 2)), -0.13 - 0.086 * i, -0.065)) * K, 0.02 - 0.002 * i, thick=0.35, sub=0) for i in range(4)]
        P['lteeth.' + n] = join(lo, 'lteeth.' + n)
    # the lure: a stalk out of the brow, curving forward over the snout, a glowing bulb at its end (see build_glow)
    LST = [H + V(p) * K for p in ((0, 0.04, 0.12), (0, -0.04, 0.4), (0, -0.3, 0.6), (0, -0.56, 0.52))]
    P['stalk'] = tube('stalk', [LST[0], LST[0].lerp(LST[1], 0.5), LST[1], LST[1].lerp(LST[2], 0.5), LST[2], LST[2].lerp(LST[3], 0.5), LST[3]],
                      [0.05, 0.038, 0.03, 0.026, 0.022, 0.018, 0.014], sub=2)
    P['stalkroot'] = hull('stalkroot', M(both([(0.07, 0.04, 0.08), (0.0, -0.06, 0.1), (0.0, 0.12, 0.08), (0.04, 0.02, 0.17), (0.0, 0.0, 0.2)])), bevel=0.003)
    for i in range(3):   # fine barbs along the stalk
        f = 0.35 + i * 0.2
        b = LST[1].lerp(LST[2], f)
        P[f'barb{i}'] = blade(f'barb{i}', b, b + V((0, -0.02 - 0.03 * i, 0.1 - 0.02 * i)), 0.012, thick=0.4, sub=0)
    return P, LST[-1]

def build_fins():
    P = {}
    # the crest: a high dorsal fin down the spine, from the nape to the small of the back
    back = [J['neck'] + V((0, 0.14, 0.04)), J['upchest'] + V((0, 0.21, 0)), J['chest'] + V((0, 0.24, -0.04)),
            J['waist'] + V((0, 0.22, 0)), J['pelvis'] + V((0, 0.21, 0))]
    def crestpt(u, t):
        f = (u + 1) / 2 * (len(back) - 1); i = min(int(f), len(back) - 2); v = f - i
        p = back[i].lerp(back[i + 1], v)
        h = (0.62 * math.sin(math.pi * ((u + 1) / 2) ** 0.72) ** 0.75) * (1 - 0.08 * t)
        out = V((0, 0.78, 0.62)).normalized()
        return tuple(p + out * h * t + V((0, 0.02 * t, 0)))
    P['crest'] = cloth('crest', 18, 10, crestpt, thick=0.022, sub=1)
    rays = []
    for u in (-0.9, -0.6, -0.3, 0.0, 0.3, 0.6, 0.86):
        a, b = V(crestpt(u, 0.0)), V(crestpt(u, 1.0))
        rays.append(blade('cray', a - (b - a).normalized() * 0.05, b + (b - a).normalized() * 0.09, 0.055, thick=0.26, power=0.8))
    P['crays'] = sharp(join(rays, 'crays'), 35)
    for s, n in SIDES:
        el, wr, ke, an = J['elbow.' + n], J['wrist.' + n], J['knee.' + n], J['ankle.' + n]
        out = V((s * 0.6, 0.7, 0.2)).normalized()
        P['armfin.' + n] = fin('armfin.' + n, el.lerp(wr, 0.45) + out * 0.08, el.lerp(wr, 0.45) + out * 0.42, (wr - el).normalized() * 0.42, n=4, thick=0.3)
        o2 = V((s * 0.7, 0.6, 0)).normalized()
        P['shinfin.' + n] = fin('shinfin.' + n, ke.lerp(an, 0.45) + o2 * 0.08, ke.lerp(an, 0.45) + o2 * 0.34, (an - ke).normalized() * 0.4, n=4, thick=0.3)
        P['shoulderfin.' + n] = fin('shoulderfin.' + n, J['shoulder.' + n] + V((s * 0.16, 0.12, 0.04)), J['shoulder.' + n] + V((s * 0.3, 0.42, 0.12)), V((0, 0.1, -0.2)), n=4, thick=0.3)
    return P

def build_gear():
    P = {'hands': hands}
    head, LURE = build_head()
    P.update(head)
    P.update(build_fins())
    muscle_plates(P, src, FIELDS, scale=1.2)
    for s, n in SIDES:
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an, to = J['hip.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.12 and p.y > el.y - 0.02, push=0.045, thick=0.018, smooth=4, facets=0.0, rim=0.013, rivets=0.05, bead=True)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.13 and p.y < ke.y, push=0.05, thick=0.02, smooth=4, facets=0.0, rim=0.013, rivets=0.05, bead=True)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.08 and abs(p.x - an.x) < 0.16, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.022, step=0.009))
        for i in range(3):   # webbed talons out of the sabaton
            b = to + V((s * (0.05 - i * 0.05), -0.04, 0.0))
            P[f'toeclaw{i}.' + n] = blade(f'toeclaw{i}.' + n, b, b + V((0, -0.17, 0.01)), 0.026, curve=V((0, 0, 0.035)), thick=0.5)
        d = (kn - wr).normalized()
        for i in range(4):
            off = V((0, -0.07 + i * 0.14 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.1 + V((0, -0.08, -0.03)), 0.017, curve=V((0, -0.02, 0)), thick=0.6)
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, hp, ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.035)
    P['belt'] = plate(shell, 'belt', lambda p: 1.9 + Z0 < p.z < 2.02 + Z0 and abs(p.x) < 0.45, push=0.06, thick=0.024, smooth=3, facets=0.1, rim=0.012, rivets=0.05)
    # a weed-eaten kilt of hide strips, torn, hanging from the belt to the knees
    P['kilt'] = cloth('kilt', 30, 20, lambda u, t: (math.sin(u * math.pi * 0.95) * (0.25 + t * 0.07), 0.03 - math.cos(u * math.pi * 0.95) * (0.22 + t * 0.06), 1.92 + Z0 - t * 0.72),
                      thick=0.016, strips=(0.35, 0.2, 9))
    # the crust: barnacles and coral grown over the shoulders, the belt line and the shins
    for s, n in SIDES:
        for key, src_key, cnt in (('crust.sh.' + n, 'm.sidedelt.' + n, 7), ('crust.pec.' + n, 'm.pec.' + n, 5), ('crust.lat.' + n, 'm.lat.' + n, 5),
                                  ('crust.sn.' + n, 'm.gastroout.' + n, 4)):
            if src_key in P and P[src_key] is not None:
                pts = surface_pts(P[src_key], lambda c: True, cnt, seed=hash(key) % 97, mind=0.06)
                ob = crust(key, pts, seed=hash(key) % 53, scale=1.4)
                if ob is not None: P[key] = ob
    P['crust.helm'] = crust('crust.helm', surface_pts(P['helm'], lambda c: c.z > H.z - 0.04 and c.y > H.y - 0.2, 6, seed=5, mind=0.09), seed=9, scale=1.1)
    # the trident, held in the right fist, the left hand up the haft: a long shaft, three barbed prongs
    gR = J['wrist.R'].lerp(J['knuckle.R'], 0.6)
    UP = V((0.04, -0.06, 1.0)).normalized()
    bot, top = gR - UP * 1.0, gR + UP * 1.55
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.5), top], [0.036, 0.038, 0.034], sub=1), 50)
    P['grip'] = join([ring(f'grip{i}', gR + UP * (-0.14 + i * 0.032), 0.04, 0.008, rot=UP.to_track_quat('Z', 'Y').to_euler(), seg=(18, 6)) for i in range(10)], 'grip')
    side = V((1, 0, 0)) - UP * V((1, 0, 0)).dot(UP); side.normalize()
    fwd = UP.cross(side).normalized()
    P['crown'] = hull('tcrown', [top + UP * z + side * x + fwd * y for x in (-0.13, 0.13) for y in (-0.055, 0.055) for z in (-0.16, 0.06)] +
                      [top + UP * 0.16 + side * x for x in (-0.24, 0.24)] + [top - UP * 0.3], bevel=0.005)
    prongs, edges = [], []
    for k, off in enumerate((-1, 0, 1)):
        base = top + side * off * 0.22 + UP * 0.08
        tip = base + UP * (0.95 if off == 0 else 0.78) + side * off * 0.12
        prongs.append(blade(f'prong{k}', base - UP * 0.14, tip, 0.06 if off == 0 else 0.05, curve=side * off * 0.03, thick=0.3))
        d = (tip - base).normalized()
        for i in range(2):   # barbs hooked back down each prong
            b = base.lerp(tip, 0.42 + i * 0.24)
            prongs.append(blade(f'barb{k}{i}', b, b + side * (off if off else 1) * 0.15 - UP * 0.17, 0.028, thick=0.4, sub=0))
        edges.append([base.lerp(tip, i / 6) for i in range(7)])
    P['prongs'] = sharp(join(prongs, 'prongs'), 32)
    P['ferrule'] = blade('ferrule', bot, bot - UP * 0.26, 0.036, thick=1.0)
    P['hcrust'] = crust('hcrust', [(bot + UP * (0.1 + 0.12 * i) + side * math.cos(i * 2.1) * 0.036 + fwd * math.sin(i * 2.1) * 0.036,
                                    side * math.cos(i * 2.1) + fwd * math.sin(i * 2.1)) for i in range(5)], seed=3, scale=0.7)
    return P, LURE, edges

gear, LURE, PEDGE = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:
        ob = orb('eye.' + n, H + V((s * 0.125, -0.14, 0.02)) * K, (0.035, 0.03, 0.022), rot=(0, s * 0.3, s * -0.35))
        sit_on(ob, gear['helm'], gap=-0.004); eyes.append(ob)
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    # the lure: a bulb of cold light swinging over the snout, and the furnace behind the teeth
    g['lure'] = (join([orb('lureorb', LURE, (0.062, 0.062, 0.062), seg=(20, 12)),
                       ring('lurering', LURE, 0.085, 0.008, rot=(math.pi / 2, 0, 0), seg=(24, 5))], 'lure'), 'head')
    g['maw'] = (hull('maw', M(both([(0.055, -0.06, -0.085), (0.04, -0.3, -0.105), (0.025, -0.28, -0.13), (0.05, -0.06, -0.11)])), bevel=0), 'head')
    g['gillglow'] = (join([hull('gg', [J['neck'] + V((s * 0.125, 0.03 + i * 0.055 + dy, dz)) for dy in (-0.006, 0.006) for dz in (-0.06, 0.045)], bevel=0)
                           for s in (1, -1) for i in range(5)], 'gillglow'), 'chest')
    g['prongedge'] = (join([tube(f'pe{i}', e, [0.006] * len(e), sub=1) for i, e in enumerate(PEDGE)], 'prongedge'), 'hand.R')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'couter', 'kneecop', 'm.vastuslat')
TRIDENT = ('haft', 'crown', 'prongs', 'ferrule')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('crust') or name == 'hcrust': return 'crust', (('rigid', 'hand.R') if name == 'hcrust' else
                                                                      ('rigid', 'head') if name == 'crust.helm' else
                                                                      ('smooth', {'chest', 'upperarm.' + side}) if '.sh.' in name or '.pec.' in name or '.lat.' in name else
                                                                      ('rigid', 'shin.' + side))
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'hide', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm', 'snoutkeel', 'stalkroot') or name.startswith('cheekfin'): return 'helm', ('rigid', 'head')
    if name == 'jaw': return 'helm', ('rigid', 'jaw')
    if name.startswith('lteeth'): return 'bone', ('rigid', 'jaw')
    if name.startswith('teeth'): return 'bone', ('rigid', 'head')
    if name == 'stalk' or name.startswith('barb'): return 'horn', ('rigid', 'head')
    if name.startswith('gills'): return 'steel', ('smooth', {'neck', 'chest'})
    if name in ('crest', 'crays'): return ('finweb' if name == 'crest' else 'horn'), ('smooth', {'neck', 'chest', 'spine', 'hips'})
    if name.startswith('armfin'): return 'finweb', ('rigid', 'forearm.' + side)
    if name.startswith('shinfin'): return 'finweb', ('rigid', 'shin.' + side)
    if name.startswith('shoulderfin'): return 'finweb', ('smooth', {'chest', 'upperarm.' + side})
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'kilt': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name.startswith(('couter',)): return steel, ('rigid', 'forearm.' + side)
    if name.startswith(('kneecop',)): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('toeclaw'): return 'bone', ('rigid', 'foot.' + side)
    if name.startswith('talon'): return 'bone', ('rigid', 'hand.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'grip': return 'leather', ('rigid', 'hand.R')
    if name.startswith(TRIDENT): return 'steel', ('rigid', 'hand.R')
    raise KeyError(name)

def tri_target(name, tris):
    # a big boss on a tight budget: the eye goes to the head, the fins and the trident
    if name == 'body_high': return 5000
    if name == 'hands': return 1800
    if name in ('helm', 'jaw'): return 1100
    if name.startswith('m.'): return plate_tris(name, big=440, small=240)
    if name == 'crest': return 1500
    if name == 'crays': return 1100
    if name.startswith(('armfin', 'shinfin', 'shoulderfin', 'cheekfin')): return 480
    if name == 'kilt': return 1800
    if name == 'stalk': return 700
    if name.startswith('crust') or name == 'hcrust': return 420
    if name == 'prongs': return 900
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt', 'gills')): return 380
    if name == 'grip': return 500
    return min(tris, 240)

def uv_weight(name):
    if name in ('helm', 'jaw', 'snoutkeel', 'stalk') or name.startswith(('teeth', 'cheekfin', 'crust.helm')): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name.startswith('crust'): return 1.6
    if name in ('crest', 'crays', 'kilt'): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

MATS, FLAT = knight_mats(accent=TIDE, steel=(0.022, 0.028, 0.032), paint=(0.006, 0.03, 0.05), leather=(0.02, 0.025, 0.022),
                         bone=(0.26, 0.27, 0.24),
                         cloth=[(0.0, (0.012, 0.03, 0.035)), (0.4, (0.012, 0.018, 0.02)), (1.0, (0.01, 0.012, 0.013))])
# the crusted parts: barnacle lime over wet stone, with weed in the hollows
MATS['crust'] = mat_stone('crust', [(0.25, (0.07, 0.075, 0.07)), (0.55, (0.14, 0.145, 0.13)), (0.85, (0.22, 0.225, 0.2))],
                          moss=(0.03, 0.06, 0.035), scale=12.0)
MATS['hide'] = mat_hide('hide', [(0.3, (0.01, 0.018, 0.024)), (0.6, (0.018, 0.035, 0.05)), (0.85, (0.03, 0.06, 0.08))],
                        scale=36.0, big=7.0, rough=(0.5, 0.3), bump=(0.5, 0.7))
MATS['finweb'] = mat_membrane('finweb', dark=(0.008, 0.02, 0.03), light=(0.02, 0.07, 0.1), vein=(0.012, 0.05, 0.08))
MATS['horn'] = mat_horn2('horn', root=(0.01, 0.016, 0.02), tip=(0.08, 0.12, 0.14), zmin=0.0, zmax=3.4, rough=0.42, bands=36.0)
FLAT.update({'crust': (0.14, 0.145, 0.13, 0.85, 0), 'hide': (0.025, 0.05, 0.07, 0.5, 0),
             'finweb': (0.03, 0.09, 0.12, 0.55, 0), 'horn': (0.05, 0.07, 0.08, 0.45, 0)})

def idle(t):
    T = 4.6
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.85)
    p['jaw'] = (0.08 + 0.05 * s, 0, 0)
    p['head'] = (p['head'][0] - 0.04, p['head'][1], p['head'][2])
    p['upperarm.L'] = (0.05 * s, -0.1, 0); p['forearm.L'] = (-0.25, 0, 0)
    p['upperarm.R'] = (0.05 * s, 0.1, 0); p['forearm.R'] = (-0.35, 0, 0)
    return p

def roar(t):
    p = roar_pose(t, idle)
    for k in ('upperarm.R', 'forearm.R', 'hand.R'):
        p[k] = idle(t)[k]
    p['jaw'] = (0.1 + 0.9 * p['_b'], 0, 0)
    return p

def attack(t):
    # "Tidebreaker": the trident hauled back over the shoulder in both hands, held, then driven
    # forward and down in a two-handed thrust that steps into the blow
    up = ease(t / 0.8) * (1 - ease((t - 1.0) / 0.18))
    th = ease((t - 1.0) / 0.16) * (1 - ease((t - 1.9) / 0.8))
    shake = math.sin(t * 64) * 0.016 * ease((t - 1.15) / 0.06) * (1 - ease((t - 1.6) / 0.3))
    p = fade_idle(idle(t), 1 - max(up, th))
    p = posed(p, spine=(-0.22 * up + 0.3 * th + shake, 0, -0.3 * up + 0.25 * th), chest=(-0.12 * up + 0.22 * th, 0, -0.2 * up + 0.2 * th),
              neck=(0.05 * up + 0.1 * th, 0, 0), head=(-0.12 * up + 0.25 * th, 0, -0.15 * up + 0.12 * th), jaw=(0.1 + 0.7 * th, 0, 0),
              upperarm_R=(-1.5 * up - 1.05 * th, 0.35 * up - 0.1 * th, 0), forearm_R=(-0.9 * up - 0.2 * th, 0, 0), hand_R=(0.5 * up - 0.95 * th, 0, 0),
              upperarm_L=(-1.1 * up - 1.25 * th, -0.75 * up - 0.95 * th, 0), forearm_L=(-0.8 * up - 0.35 * th, 0.3, 0), hand_L=(0.3 * up - 0.3 * th, 0, 0),
              thigh_L=(-0.1 * up - 0.75 * th, 0, 0), shin_L=(0.2 * up + 0.85 * th, 0, 0), foot_L=(-0.25 * th, 0, 0),
              thigh_R=(0.15 * up + 0.35 * th, 0, 0), shin_R=(-0.1 * up - 0.2 * th, 0, 0))
    p['_hips_loc'] = (0, 0, -0.2 * th)
    return p

parts = {'body_high': body, **gear}
for k in [k for k, v in parts.items() if v is None or not v.data.polygons]:
    print('empty part dropped:', k, flush=True); parts.pop(k)
finish('Leviathan', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, TIDE,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
