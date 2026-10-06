# Antares the Sovereign Beast (S-rank gate): a demon-dragon king in black war-plate. A lean,
# hard-cut body of black scale split by glowing veins; a horned dragon's head under a crown of
# horns; thorned pauldrons and vambraces; tattered wings and a long torn cloak; a spined tail; a
# staff crowned with a burning orb. Its attack: the staff raised overhead and driven into the ground.
#   python3.11 antares.py --bake --out ../../antares.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(53)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'antares.glb'))

J = {'pelvis': V((0, 0.02, 1.36)), 'waist': V((0, 0.03, 1.62)), 'chest': V((0, 0.0, 1.98)), 'upchest': V((0, 0.02, 2.2)),
     'neck': V((0, -0.04, 2.38)), 'head': V((0, -0.1, 2.56)), 'crown': V((0, -0.08, 2.78))}
mirrored(J, {'shoulder': (0.52, 0.03, 2.2), 'elbow': (0.76, 0.1, 1.72), 'wrist': (0.86, -0.06, 1.28), 'knuckle': (0.89, -0.12, 1.12),
             'hip': (0.19, 0.02, 1.32), 'knee': (0.26, -0.07, 0.74), 'ankle': (0.28, 0.08, 0.14), 'toe': (0.31, -0.24, 0.04),
             'wroot': (0.18, 0.24, 2.2), 'welbow': (0.85, 0.62, 2.7), 'wwrist': (1.5, 0.78, 3.05)})
H = J['head']

TP = [V((0, 0.2, 1.32)), V((0, 0.5, 1.08)), V((0.08, 0.86, 0.7)), V((0.26, 1.2, 0.34)), V((0.56, 1.42, 0.14)), V((0.92, 1.46, 0.08)), V((1.24, 1.28, 0.1)), V((1.4, 1.0, 0.14))]
TR = [0.17, 0.15, 0.12, 0.095, 0.07, 0.05, 0.03, 0.008]
for i, k in enumerate((0, 2, 4, 6, 7)):
    J[f't{i}'] = TP[k]
BONES = human_bones()
BONES += [(f'tail{i}', f't{i}', f't{i + 1}', 'hips' if i == 0 else f'tail{i - 1}') for i in range(4)]
for n in ('L', 'R'):
    BONES += [('wing.' + n, 'wroot.' + n, 'welbow.' + n, 'chest'), ('wingtip.' + n, 'welbow.' + n, 'wwrist.' + n, 'wing.' + n)]

# ── the body: athletic, every muscle cut; a dragon's head on it ──
def build_body():
    obs, hands = athlete(J, mass=1.1, hands='claw')
    t = Tree()
    nk = t.add(J['neck'], 0.11)
    hd = t.add(H, (0.13, 0.16), nk)
    sn = t.add(H + V((0, -0.2, -0.02)), (0.085, 0.07), hd)           # a long, narrow, hard snout
    t.add(H + V((0, -0.4, -0.06)), (0.045, 0.04), sn)
    jw = t.add(H + V((0, -0.1, -0.11)), (0.09, 0.06), hd)             # the jaw
    t.add(H + V((0, -0.36, -0.16)), (0.035, 0.028), jw)
    obs.append(t.build('head'))
    for s, n in SIDES:
        obs += [muscle(H + V((s * 0.05, -0.3, 0.02)), H + V((s * 0.11, -0.02, 0.1)), 0.03),     # brow ridge, a hard line back from the snout
                blob(H + V((s * 0.1, -0.02, -0.07)), (0.06, 0.1, 0.07)),                      # jaw muscle
                blob(H + V((s * 0.11, -0.12, -0.04)), (0.035, 0.06, 0.03), (0.2, 0, s * 0.2))]  # cheekbone
    body = remesh(obs, 'body_high', voxel=0.009, smooth=3, factor=0.6)
    define(body, 1.5, 3)
    return body, hands

body, hands = build_body()

def wing(s, n):
    # a dragon's wing: an arm of bone, four fingers, the membrane between them sagging, torn and holed
    rnd = random.Random(7 + s)
    root, elbow, wrist = J['wroot.' + n], J['welbow.' + n], J['wwrist.' + n]
    tips = [V((s * 2.35, 0.86, 3.25)), V((s * 2.42, 0.92, 2.45)), V((s * 2.15, 0.95, 1.6)), V((s * 1.6, 0.9, 0.95))]
    parts = [tube('warm', [root, root.lerp(elbow, 0.5) + V((0, 0, 0.06)), elbow, wrist], [0.065, 0.055, 0.045, 0.035])]
    fingers = []
    for i, tp in enumerate(tips):
        mid = wrist.lerp(tp, 0.5) + V((0, 0.05, 0.1 if i == 0 else 0.0))
        parts.append(tube(f'wf{i}', [wrist, mid, tp], [0.034, 0.022, 0.006]))
        fingers.append([wrist.lerp(mid, k / 3) for k in range(3)] + [mid.lerp(tp, k / 3) for k in range(4)])
    body_edge = [root.lerp(V((s * 0.32, 0.42, 1.45)), k / 6) for k in range(7)]
    bm = bmesh.new(); nseg = 9
    for fa, fb in list(zip(fingers, fingers[1:])) + [(fingers[-1], body_edge)]:
        rows = []
        for j in range(len(fa)):
            row = []
            for k in range(nseg + 1):
                u = k / nseg
                p = fa[j].lerp(fb[j], u)
                sag = math.sin(u * math.pi) * (j / (len(fa) - 1)) ** 1.3 * 0.3
                p = p + (wrist - p).normalized() * sag + V((0, 0.07 * math.sin(u * math.pi), 0))
                if j == len(fa) - 1 and 0 < k < nseg:   # a ragged trailing edge
                    p = p + (wrist - p).normalized() * rnd.uniform(0.0, 0.12)
                row.append(bm.verts.new(p))
            rows.append(row)
        for j in range(len(rows) - 1):
            for k in range(nseg):
                if j >= 3 and rnd.random() < 0.07:   # holes torn through the membrane
                    continue
                bm.faces.new((rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]))
    mem = mesh_from_bm('membrane.' + n, bm)
    so = mem.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.01; so.offset = 0
    apply_mods(mem); smooth_shade(mem)
    # claws: one at the wrist, a thorn on each knuckle of the arm
    parts.append(blade('wclaw', wrist + V((0, -0.02, 0.03)), wrist + V((s * 0.06, -0.08, 0.3)), 0.04, curve=V((0, -0.06, 0)), thick=0.5))
    parts.append(blade('wthorn', elbow + V((0, 0, 0.03)), elbow + V((s * 0.05, 0.04, 0.24)), 0.035, curve=V((0, 0.04, 0)), thick=0.5))
    return join(parts, 'wingbone.' + n), mem

def build_gear():
    P = {'hands': hands}
    for s, n in SIDES:
        P['wingbone.' + n], P['membrane.' + n] = wing(s, n)
        P['wingbone.' + n].name = 'wingbone.' + n
        # the crown of horns: two great horns up and back, a ring of lesser ones
        P['horn.' + n] = sharp(tube('horn.' + n, [H + V((s * 0.09, -0.05, 0.12)), H + V((s * 0.17, 0.0, 0.3)), H + V((s * 0.24, 0.1, 0.48)),
                                                  H + V((s * 0.24, 0.24, 0.62)), H + V((s * 0.18, 0.34, 0.7)), H + V((s * 0.1, 0.36, 0.68))],
                                     [0.06, 0.05, 0.04, 0.028, 0.014, 0.003], flat=1.3, sub=2), 40)
        for i in range(6):
            a = 0.2 + i * 0.26
            b = H + V((s * math.sin(a) * 0.12, -math.cos(a) * 0.11 + 0.05, 0.09 + i * 0.012))
            L = 0.32 - abs(i - 2) * 0.04
            P[f'crownhorn{i}.' + n] = blade(f'crownhorn{i}.' + n, b, b + V((s * (0.05 + i * 0.03) * L / 0.3, (0.04 + i * 0.04) * L / 0.3, L)), 0.028, curve=V((s * 0.02, 0.05, 0)), thick=0.7)
        for i in range(3):   # cheek and jaw spines, swept back
            b = H + V((s * 0.12, -0.06 + i * 0.07, -0.08 - i * 0.02))
            P[f'cheek{i}.' + n] = blade(f'cheek{i}.' + n, b, b + V((s * 0.12, 0.16, 0.02)), 0.022, thick=0.5)
        for i in range(3):   # fangs
            y = -0.34 + i * 0.06
            P[f'fang{i}.' + n] = spike(f'fang{i}.' + n, H + V((s * 0.04, y, -0.1)), H + V((s * 0.04, y, -0.16 + i * 0.015)), 0.011, n=4)
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        # pauldrons: three faceted lames stepping down the arm, thorns curving up off the top
        for i in range(3):
            P[f'pauldron{i}.' + n] = sharp(shell(f'pauldron{i}.' + n, sh + V((s * (0.06 + 0.05 * i), 0, 0.08 - 0.1 * i)),
                                                 (0.24 - 0.03 * i, 0.22 - 0.02 * i, 0.13), rot=(0, s * (0.45 + 0.18 * i), 0),
                                                 cut=lambda c: c.z > -0.25, seg=(10, 7), thick=0.025, sub=0), 30)
        P['pthorns.' + n] = thorns(P['pauldron0.' + n], 'pthorns.' + n, lambda c: c.z > sh.z + 0.06, 6, 0.48, 0.05, up=1.4, back=0.3, seed=3 + s)
        P['pthorns2.' + n] = thorns(P['pauldron1.' + n], 'pthorns2.' + n, lambda c, s=s: s * c.x > abs(sh.x) + 0.12, 4, 0.3, 0.04, up=0.6, back=0.3, seed=9 + s)
        # vambraces: faceted plate on the forearm, a row of thorns down its outer edge
        P['vambrace.' + n] = plate(body, 'vambrace.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.4 and near_seg(p, el, wr, 0.3, 1.0, 0.16), push=0.03, thick=0.025)
        P['vthorns.' + n] = thorns(P['vambrace.' + n], 'vthorns.' + n, lambda c, s=s: s * c.x > abs(el.x) + 0.02 and c.y > -0.02, 5, 0.26, 0.035, up=0.5, back=0.7, seed=5 + s)
        # thigh and shin plate, knee spike
        P['greave.' + n] = plate(body, 'greave.' + n, lambda p, ke=ke, an=an, s=s: s * p.x > 0.1 and near_seg(p, ke, an, 0.0, 0.9, 0.15) and p.y < an.y + 0.02, push=0.03, thick=0.028)
        P['cuisse.' + n] = plate(body, 'cuisse.' + n, lambda p, hp=hp, ke=ke, s=s: s * p.x > 0.06 and near_seg(p, hp, ke, 0.25, 0.92, 0.2) and p.y < ke.y + 0.04, push=0.03, thick=0.025)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.12, 0.02)), ke + V((s * 0.04, -0.3, 0.2)), 0.045, curve=V((0, 0, 0.04)), thick=0.6)
        # talons on the toes
        for i in range(3):
            b = J['toe.' + n] + V((s * (0.04 - i * 0.04), -0.04, 0.0))
            P[f'toeclaw{i}.' + n] = blade(f'toeclaw{i}.' + n, b, b + V((0, -0.12, -0.04)), 0.022, curve=V((0, 0, 0.02)), thick=0.6)
        # claws: the hands are already clawed; add the long curved talons
        d = (kn - wr).normalized()
        for i in range(4):
            off = V((0, -0.065 + i * 0.13 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.1 + V((0, -0.08, -0.03)), 0.016, curve=V((0, -0.02, 0)), thick=0.6)
    # the gorget: a high collar of plate around the neck, thorns along its rim
    P['gorget'] = plate(body, 'gorget', lambda p: 2.24 < p.z < 2.46 and abs(p.x) < 0.3, push=0.05, thick=0.03)
    P['gthorns'] = thorns(P['gorget'], 'gthorns', lambda c: c.z > 2.3 and c.y > -0.05, 6, 0.22, 0.03, up=1.0, back=0.4, seed=17)
    # the belt: a heavy band, a skull for a buckle, chains slung across the hips
    P['belt'] = plate(body, 'belt', lambda p: 1.36 < p.z < 1.5, push=0.05, thick=0.035, facets=0.2)
    P['skull'] = sharp(join([blob(V((0, -0.24, 1.44)), (0.075, 0.06, 0.07)), blob(V((0, -0.27, 1.39)), (0.05, 0.04, 0.035))], 'skull'), 50)
    links = []
    for i in range(14):
        u = i / 13
        x = -0.26 + u * 0.52
        p = V((x, -0.21 - 0.03 * math.sin(u * math.pi), 1.34 - 0.16 * math.sin(u * math.pi)))
        links.append(ring(f'cl{i}', p, 0.026, 0.008, rot=(math.pi / 2, (i % 2) * math.pi / 2, 0.3), seg=(12, 6)))
    P['chain'] = join(links, 'chain')
    # the cloak: from the belt to the floor all round, black going to blood at the hem, torn into strips
    def cloak(u, t):
        a = u * math.pi * 0.92
        r = 0.27 + t * 0.4 + math.sin(u * 17 + t * 4) * 0.035 * t
        return (math.sin(a) * r, 0.04 - math.cos(a) * r * 0.82 + t * 0.12, 1.46 - t * 1.4)
    P['cloak'] = cloth('cloak', 44, 28, cloak, thick=0.014, strips=(0.45, 0.2, 11))
    # the front tabard: a long narrow panel with a pointed end, between the legs
    P['tabard'] = cloth('tabard', 6, 20, lambda u, t: (u * (0.12 - t * 0.04), -0.28 - t * 0.06 + u * u * 0.04, 1.42 - t * 1.1), thick=0.016, strips=(0.8, 0.0, 4))
    # the tail, spined along its ridge
    P['tail'] = tube('tail', TP, TR, flat=0.85)
    for i in range(1, 7):
        b = TP[i] + V((0, 0, TR[i] * 0.85))
        d = (TP[i + 1] - TP[i]).normalized()
        P[f'tspike{i}'] = blade(f'tspike{i}', b, b + V((0, 0, 0.2 - i * 0.022)) + d * 0.08, 0.05 - i * 0.005, thick=0.4)
    # spines down the back
    for i in range(6):
        b = V((0, 0.22 - (i < 2) * 0.08, 2.32 - i * 0.16))
        P[f'spine{i}'] = blade(f'spine{i}', b, b + V((0, 0.2 - i * 0.012, 0.12)), 0.045 - i * 0.004, thick=0.4)
    # the staff, in the left hand: a black haft, a crescent of horn blades at the head around the orb
    g = J['wrist.L'].lerp(J['knuckle.L'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((0.02, -0.06, 1.55)), g + V((-0.02, 0.04, -1.1))
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.33) + V((0.01, 0, 0)), bot.lerp(top, 0.66) - V((0.01, 0, 0)), top], [0.024, 0.026, 0.024, 0.03], sub=1), 50)
    orb_c = top + V((0, 0, 0.22))
    for i, a in enumerate((-1.0, -0.45, 0.45, 1.0)):
        b = top + V((math.sin(a) * 0.06, 0, 0.04))
        P[f'stafhorn{i}'] = blade(f'stafhorn{i}', b, orb_c + V((math.sin(a) * 0.16, 0, 0.26 - abs(a) * 0.08)), 0.03, curve=V((math.sin(a) * 0.12, 0, 0)), thick=0.5)
    P['ferrule'] = blade('ferrule', bot, bot + V((0, 0, -0.2)), 0.03, thick=1.0)
    return P, orb_c

gear, ORB = build_gear()

def build_glow():
    g = {}
    for s, n in SIDES:
        ob = orb('eye.' + n, H + V((s * 0.075, -0.17, 0.04)), (0.045, 0.016, 0.016), rot=(0, s * -0.4, s * -0.35))
        sit_on(ob, body, gap=0.003)
        g['eye.' + n] = (ob, 'head')
    g['staforb'] = (orb('staforb', ORB, (0.09, 0.09, 0.09)), 'hand.L')
    g['maw'] = (orb('maw', H + V((0, -0.24, -0.13)), (0.04, 0.09, 0.02)), 'head')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'scales', ('smooth', None)
    if name == 'hands': return 'scales', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name.startswith('wingbone'): return 'horn', ('smooth', {'wing.' + side, 'wingtip.' + side})
    if name.startswith('membrane'): return 'membrane', ('smooth', {'wing.' + side, 'wingtip.' + side, 'chest'})
    if name.startswith(('horn', 'crownhorn', 'cheek', 'fang')): return 'horn', ('rigid', 'head')
    if name.startswith(('pauldron', 'pthorns')): return 'plate', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith(('vambrace', 'vthorns')): return 'plate', ('rigid', 'forearm.' + side)
    if name.startswith(('greave', 'kspike')): return 'plate', ('rigid', 'shin.' + side)
    if name.startswith('cuisse'): return 'plate', ('rigid', 'thigh.' + side)
    if name.startswith('toeclaw'): return 'horn', ('rigid', 'foot.' + side)
    if name.startswith('talon'): return 'horn', ('rigid', 'hand.' + side)
    if name in ('gorget', 'gthorns'): return 'plate', ('smooth', {'chest', 'neck'})
    if name == 'keel': return 'plate', ('smooth', {'chest', 'spine'})
    if name in ('belt', 'skull', 'chain'): return ('horn' if name == 'skull' else 'plate'), ('rigid', 'hips')
    if name in ('cloak', 'tabard'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'tail': return 'scales', ('smooth', {'hips', 'tail0', 'tail1', 'tail2', 'tail3'})
    if name.startswith('tspike'):
        c = parts[name].data.vertices[0].co
        return 'horn', ('rigid', min(('tail0', 'tail1', 'tail2', 'tail3'), key=lambda b: (c - J['t' + b[4:]]).length))
    if name.startswith('spine'): return 'horn', ('rigid', 'chest')
    if name in ('haft', 'ferrule') or name.startswith('stafhorn'): return 'plate', ('rigid', 'hand.L')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 15000
    if name == 'hands': return 3000
    if name.startswith('membrane'): return 2400
    if name == 'cloak': return 3600
    if name.startswith('wingbone'): return 1200
    if name in ('tail',): return 1600
    if name.startswith(('pauldron', 'vambrace', 'greave', 'cuisse', 'gorget', 'belt')): return 700
    if name.startswith(('pthorns', 'vthorns', 'gthorns')): return 900
    if name.startswith('horn.'): return 800
    if name == 'chain': return 1200
    return min(tris, 260)

MATS = {
    # black scale split by molten veins
    'scales': mat_hide('scales', [(0.3, (0.015, 0.01, 0.012)), (0.6, (0.05, 0.025, 0.025)), (0.85, (0.1, 0.04, 0.035))],
                       fissure=(1.0, 0.12, 0.03), scale=46.0, big=5.0, rough=(0.5, 0.28), bump=(0.5, 0.9)),
    'membrane': mat_hide('membrane', [(0.3, (0.03, 0.008, 0.01)), (0.8, (0.18, 0.025, 0.02))], fissure=(0.8, 0.08, 0.02), scale=14.0, big=3.5, rough=(0.6, 0.45), bump=(0.2, 0.4)),
    'plate': mat_metal('plate', (0.035, 0.035, 0.04), (0.48, 0.47, 0.5), rough=0.28, engrave=(0.32, 0.3, 0.33)),
    'horn': mat_horn('horn', 0.0, 3.4, [(0.0, (0.02, 0.015, 0.015)), (0.6, (0.06, 0.04, 0.035)), (1.0, (0.4, 0.36, 0.32))], rough=0.35),
    'cloth': mat_cloth('cloth', 0.0, 1.5, [(0.0, (0.2, 0.01, 0.01)), (0.35, (0.06, 0.005, 0.008)), (1.0, (0.012, 0.01, 0.012))], rough=0.9, sheen=0.3),
}
FLAT = {'scales': (0.06, 0.03, 0.03, 0.4, 0), 'membrane': (0.12, 0.02, 0.02, 0.5, 0), 'plate': (0.06, 0.06, 0.07, 0.3, 1),
        'horn': (0.1, 0.08, 0.07, 0.35, 0), 'cloth': (0.05, 0.01, 0.012, 0.9, 0)}

def idle(t):
    T = 4.4
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.9)
    for n, sg in (('L', 1), ('R', -1)):
        p['wing.' + n] = (0.05 * s, sg * -0.05 * s, sg * 0.04 * c)         # the wings breathe, half-furled
        p['wingtip.' + n] = (0, sg * 0.06 * s, 0)
    p['upperarm.L'] = (-0.15, -0.08, 0); p['forearm.L'] = (-0.55, 0, 0)    # the staff held planted
    for i in range(4):
        p[f'tail{i}'] = (0, 0, 0.05 * (i + 1) / 4 * math.sin(TAU * t / T - i * 0.8))
    return p

def roar(t):
    p = roar_pose(t, idle)
    b = p['_b']
    for n, sg in (('L', 1), ('R', -1)):
        p['wing.' + n] = (p['wing.' + n][0], p['wing.' + n][1] - sg * 0.5 * b, p['wing.' + n][2])   # wings flung wide
        p['wingtip.' + n] = (0, -sg * 0.35 * b, 0)
    return p

def attack(t):
    # "Sovereign's Judgement": the staff lifted high, the wings spread, then driven down into the earth
    up = ease(t / 0.8) * (1 - ease((t - 0.85) / 0.2))
    down = ease((t - 0.85) / 0.2) * (1 - ease((t - 2.2) / 0.8))
    shake = math.sin(t * 70) * 0.02 * ease((t - 1.0) / 0.1) * (1 - ease((t - 1.5) / 0.3))
    p = idle(t)
    k = 1 - max(up, down)
    p = {key: tuple(v * k for v in val) if isinstance(val, tuple) else val for key, val in p.items()}
    def add(key, x=0, y=0, z=0):
        q = p.get(key, (0, 0, 0)); p[key] = (q[0] + x, q[1] + y, q[2] + z)
    add('spine', -0.15 * up + 0.3 * down + shake); add('chest', -0.15 * up + 0.22 * down); add('neck', -0.1 * up + 0.05 * down)
    add('head', -0.25 * up + 0.15 * down)
    add('upperarm.L', -2.5 * up - 0.9 * down, -0.15 * up); add('forearm.L', -0.4 * up - 0.3 * down)
    add('hand.L', 2.6 * up + 1.0 * down)   # the wrist keeps the staff upright, raised and then planted
    add('upperarm.R', -0.3 * up - 0.4 * down, 0.5 * up + 0.2 * down); add('forearm.R', -0.6 * up - 0.4 * down)
    add('thigh.L', -0.1 * up - 0.4 * down); add('thigh.R', 0.15 * down); add('shin.L', 0.1 * up + 0.55 * down); add('shin.R', 0.2 * down)
    add('foot.L', -0.15 * down)
    for n, sg in (('L', 1), ('R', -1)):
        add('wing.' + n, -0.2 * up + 0.35 * down, -sg * 0.6 * up, sg * 0.4 * down)
        add('wingtip.' + n, 0, -sg * 0.4 * up + sg * 0.2 * down)
    p['_hips_loc'] = (0, 0, -0.12 * down)
    return p

parts = {'body_high': body, **gear}
finish('Antares', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, (1.0, 0.18, 0.06),
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0)
