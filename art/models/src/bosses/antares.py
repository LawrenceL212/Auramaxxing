# Antares the Sovereign Beast (S-rank gate): a demon knight in black war-plate edged in burning red.
# Read from its shadow alone: a burning halo behind a horned helm, ram's horns curling up off it,
# great spiked pauldrons, wings held high to spiked points, a halberd with a torn banner, a cloak
# torn to the floor and a tail. Every piece grows from what is under it: the plate is lifted off the
# body, the horns rise out of the helm, the wings out of ridges of muscle on the shoulder blades.
# Its attack: the halberd raised overhead and driven into the ground.
#   python3.11 antares.py --bake --out ../../antares.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(53)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'antares.glb'))

# heroic proportions: the legs are over half the height, the head small on a long, tapered body
J = {'pelvis': V((0, 0.02, 1.81)), 'waist': V((0, 0.03, 2.06)), 'chest': V((0, 0.0, 2.41)), 'upchest': V((0, 0.02, 2.63)),
     'neck': V((0, -0.03, 2.81)), 'head': V((0, -0.06, 2.98)), 'crown': V((0, -0.05, 3.17))}
mirrored(J, {'shoulder': (0.5, 0.03, 2.63), 'elbow': (0.74, 0.1, 2.12), 'wrist': (0.86, -0.06, 1.62), 'knuckle': (0.89, -0.12, 1.45),
             'hip': (0.18, 0.02, 1.77), 'knee': (0.24, -0.07, 0.98), 'ankle': (0.27, 0.08, 0.14), 'toe': (0.31, -0.27, 0.04),
             'wroot': (0.2, 0.3, 2.67), 'welbow': (0.72, 0.56, 3.38), 'wwrist': (1.1, 0.7, 3.93)})
H = J['head']
K = 1.0
Z0 = 0.45   # how much higher the hips sit than in the first build: everything hung off them moves up by it

TP = [V((0, 0.2, 1.77)), V((0, 0.55, 1.42)), V((0.08, 0.92, 0.92)), V((0.26, 1.25, 0.42)), V((0.56, 1.45, 0.15)), V((0.92, 1.46, 0.08)), V((1.24, 1.28, 0.1)), V((1.4, 1.0, 0.14))]
TR = [0.12, 0.1, 0.085, 0.066, 0.052, 0.038, 0.024, 0.006]
for i, k in enumerate((0, 2, 4, 6, 7)):
    J[f't{i}'] = TP[k]
BONES = human_bones()
BONES += [(f'tail{i}', f't{i}', f't{i + 1}', 'hips' if i == 0 else f'tail{i - 1}') for i in range(4)]
for n in ('L', 'R'):
    BONES += [('wing.' + n, 'wroot.' + n, 'welbow.' + n, 'chest'), ('wingtip.' + n, 'welbow.' + n, 'wwrist.' + n, 'wing.' + n)]

# ── the body under the plate: athletic, carved into hard planes ──
def build_body():
    obs, hands = athlete(J, mass=1.0, hands='claw', cut=1, waist=0.88)
    for s, n in SIDES:   # the wing roots: a ridge of muscle on each shoulder blade the wing arm grows out of
        obs.append(muscle(V((s * 0.08, 0.2, 1.96 + Z0)), J['wroot.' + n] + V((s * 0.04, 0.02, 0.06)), 0.1, seg=(8, 5)))
    musc = muscle_copies(obs)
    body = remesh(obs, 'body_high', voxel=0.009, smooth=2, factor=0.6)
    define(body, 1.8, 3)
    sm = body.modifiers.new('sm', 'SMOOTH'); sm.iterations = 2; sm.factor = 0.5; apply_mods(body)
    # the armour is cut from the body as it is here, every muscle still rounded: one plate per muscle
    src = body.copy(); src.data = body.data.copy(); src.name = 'muscle_src'; link(src)
    chisel(body, 3, 32, 0.3)
    return body, hands, src, musc

M = lambda pts: [H + V(p) * K for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def build_helm():
    # a closed helm, all planes: a faceplate that narrows to a point at the chin, a keel down its middle,
    # flared cheek guards swept back to blades. The face is the burning slit across it (see build_glow)
    parts = [hull('helmshell', M(both([(0.0, 0.0, 0.17), (0.08, 0.02, 0.15), (0.1, -0.12, 0.07), (0.0, -0.15, 0.09),
                                        (0.12, -0.08, -0.02), (0.0, -0.13, -0.18), (0.05, -0.1, -0.13), (0.1, 0.1, 0.05),
                                        (0.0, 0.14, 0.0), (0.07, 0.1, -0.1), (0.09, -0.02, -0.11)]))),
             hull('keel', M(both([(0.012, -0.16, 0.08), (0.0, -0.172, 0.0), (0.012, -0.15, -0.1), (0.0, 0.02, 0.2), (0.01, -0.09, 0.17)])))]
    for s, n in SIDES:
        parts.append(hull('cheekguard.' + n, M([(s * 0.1, -0.12, 0.0), (s * 0.13, -0.06, 0.02), (s * 0.12, -0.08, -0.1),
                                                 (s * 0.2, 0.12, -0.08), (s * 0.1, -0.02, -0.12)])))
        parts.append(blade('cheekspike.' + n, H + V((s * 0.14, 0.0, -0.06)) * K, H + V((s * 0.26, 0.2, -0.16)) * K, 0.03, thick=0.4))
    parts.append(hull('helmbrow', M(both([(0.0, -0.165, 0.075), (0.11, -0.12, 0.085), (0.12, -0.1, 0.05), (0.0, -0.18, 0.045), (0.07, -0.05, 0.13), (0.0, -0.07, 0.16)]))))
    helm = join(parts, 'helm')
    rv = []
    for s in (1, -1):   # rivets down the cheek guards and round the back of the helm (baked detail)
        for k in range(5):
            p = H + V((s * (0.118 + 0.01 * k), -0.1 + 0.045 * k, -0.035 - 0.012 * k)) * K
            rv.append(orb('hrv', p + V((s * 0.012, 0, 0)), (0.008, 0.008, 0.008), seg=(8, 5)))
        for k in range(4):
            p = H + V((s * (0.1 - 0.025 * k), 0.08 + 0.015 * k, 0.07 - 0.005 * k)) * K
            rv.append(orb('hrv', p + V((0, 0.012, 0.004)), (0.008, 0.008, 0.008), seg=(8, 5)))
    for k in range(5):   # studs along the brow
        x = -0.08 + k * 0.04
        rv.append(orb('hst', H + V((x, -0.168 + abs(x) * 0.45, 0.083)) * K, (0.007, 0.007, 0.007), seg=(8, 5)))
    helm['detail'] = join(rv, 'helm_rivets').name
    return helm

def build_helm_parts():
    # the helm's second layer: a serrated crest comb down the crown, the visor's pivot bolts, a
    # breathing grille on the jaw, and a mail aventail hung from the helm's lower edge round the neck
    P = {}
    comb = [hull('comb', M([(x, y, z) for x in (-0.006, 0.006) for (y, z) in ((-0.12, 0.135), (0.13, 0.04), (-0.1, 0.165), (0.1, 0.11))]), bevel=0.002)]
    for k in range(5):
        y = -0.08 + k * 0.045
        b = H + V((0, y, 0.17 - 0.0016 * (k * 9) ** 1.3)) * K
        comb.append(blade('combtooth', b, b + V((0, 0.035, 0.035 - k * 0.003)), 0.018, thick=0.35, sub=0))
    P['crest'] = join(comb, 'crest')
    bolts = []
    for s, n in SIDES:   # rosette bolts where the visor pivots
        c = H + V((s * 0.128, -0.03, 0.01)) * K
        bolts.append(ring('rose', c, 0.016, 0.005, rot=(0, math.pi / 2, 0), seg=(16, 6)))
        bolts.append(orb('boss', c + V((s * 0.006, 0, 0)), (0.008, 0.011, 0.011), seg=(10, 6)))
        for k in range(4):   # the grille: bars across the jaw, the breath glowing between them
            z = -0.075 - k * 0.018
            bolts.append(hull('bar', M([(s * x, -0.158 + 0.25 * x + 0.03 * k * 0.3, z + dz) for x in (0.025, 0.085) for dz in (-0.004, 0.004)] +
                                         [(s * x, -0.142 + 0.25 * x + 0.03 * k * 0.3, z) for x in (0.025, 0.085)]), bevel=0.0015))
    P['visorbolts'] = join(bolts, 'visorbolts')
    def avent(u, t):
        a = u * 2.0
        r = 0.135 + t * 0.07 + 0.006 * math.sin(u * 23) * t
        return (math.sin(a) * r, H.y + 0.01 + math.cos(a) * r * 0.95, H.z - 0.07 - t * 0.17)
    P['aventail'] = cloth('aventail', 24, 6, avent, thick=0.008, sub=1)
    return P

body, hands, musc_src, MUSCLES = build_body()
FIELDS, _ = muscle_fields(musc_src, MUSCLES)
for o in MUSCLES.values(): bpy.data.objects.remove(o)

# every plate is the shape of the muscle under it, cut along the creases where muscles meet, so the
# mail shows between them: (push off the body, thickness, rolled rim, bead, rivet spacing, fairing)
MPLATE = {'pec': (0.016, 0.015, 0.014, True, 0.07, 2), 'frontdelt': (0.036, 0.014, 0.01, True, 0.0, 2),
          'sidedelt': (0.034, 0.016, 0.012, True, 0.06, 2), 'reardelt': (0.032, 0.014, 0.01, True, 0.0, 2),
          'uppertrap': (0.024, 0.013, 0.009, True, 0.0, 2), 'midtrap': (0.022, 0.012, 0.008, False, 0.0, 2),
          'lat': (0.024, 0.014, 0.012, True, 0.08, 2), 'erector': (0.02, 0.012, 0.008, False, 0.0, 2),
          'oblique': (0.022, 0.012, 0.008, False, 0.0, 2), 'scm': (0.016, 0.01, 0.0, False, 0.0, 1),
          'biceps': (0.022, 0.013, 0.008, True, 0.0, 2), 'tricepslong': (0.022, 0.013, 0.008, True, 0.0, 2),
          'tricepslat': (0.024, 0.013, 0.008, False, 0.0, 2), 'brachiorad': (0.022, 0.012, 0.008, True, 0.0, 2),
          'flexors': (0.02, 0.012, 0.0, False, 0.0, 2), 'extensors': (0.02, 0.012, 0.008, False, 0.0, 2),
          'vastuslat': (0.026, 0.014, 0.012, True, 0.08, 2), 'rectusfem': (0.028, 0.014, 0.01, True, 0.0, 2),
          'vastusmed': (0.026, 0.014, 0.01, True, 0.0, 2), 'hamstrings': (0.024, 0.013, 0.01, False, 0.0, 2),
          'adductors': (0.02, 0.012, 0.0, False, 0.0, 2), 'gastroout': (0.024, 0.013, 0.01, True, 0.0, 2),
          'gastroin': (0.024, 0.013, 0.01, True, 0.0, 2), 'tibialis': (0.022, 0.012, 0.008, False, 0.0, 2),
          'glute': (0.026, 0.014, 0.012, True, 0.0, 2)}
for i in range(3): MPLATE[f'serratus{i}'] = (0.018, 0.01, 0.0, False, 0.0, 1)
for i in range(4): MPLATE[f'ab{i}'] = (0.022, 0.013, 0.008, False, 0.0, 1)

def muscle_plates(P):
    for key, f in FIELDS.items():
        lbl, n = key.split('.')
        if lbl not in MPLATE or (f > 0.012).sum() < 12: continue
        push, thick, rim, bead, rv, sm = MPLATE[lbl]
        # big plates are forged in flat planes meeting at hard ridges, not blown round like the muscle
        ob = plate(musc_src, 'm.' + key, lambda p: True, push=push, thick=thick, smooth=sm, facets=0.06 if rim >= 0.01 else 0.0,
                   bevel=0.003, rim=rim, rivets=rv, bead=bead, field=f, gap=0.018)
        if ob is not None and len(ob.data.vertices) > 8:
            P['m.' + key] = ob
helm = build_helm()
helm_parts = build_helm_parts()
# the armour is lifted off a smoothed shell of the body, not the carved body itself: plate is forged
# smooth, it does not follow every crease of the muscle under it
shell_src = body.copy(); shell_src.data = body.data.copy(); shell_src.name = 'armour_shell'; link(shell_src)
lp = shell_src.modifiers.new('lap', 'LAPLACIANSMOOTH'); lp.iterations = 45; lp.lambda_factor = 2.0; lp.use_normalized = True
apply_mods(shell_src)

def wing(s, n):
    # a demon's wing held high, built like a bat's: an arm of bone with knuckled joints and a tendon
    # along it, four fingers fanning up to spiked points, a thick leathery membrane strung between them
    # with veins running out along it, a thickened trailing edge, torn and holed
    rnd = random.Random(7 + s)
    root, elbow, wrist = J['wroot.' + n], J['welbow.' + n], J['wwrist.' + n]
    tips = [V((s * 1.45, 0.8, 4.68)), V((s * 2.0, 0.88, 3.88)), V((s * 2.0, 0.92, 2.88)), V((s * 1.55, 0.9, 1.9))]
    arm = [root, root.lerp(elbow, 0.5) + V((0, 0, 0.06)), elbow, elbow.lerp(wrist, 0.5) + V((0, 0.02, 0.03)), wrist]
    parts = [tube('warm', arm, [0.075, 0.055, 0.06, 0.04, 0.05]),
             tube('wtendon', [p + V((0, -0.04, 0.03)) for p in arm[:3]], [0.03, 0.028, 0.02]),       # the tendon along its leading edge
             orb('welbowk', elbow, (0.075, 0.065, 0.07)), orb('wwristk', wrist, (0.062, 0.055, 0.058))]
    bones = []   # (skin web members) the bone lines the membrane is strung between
    for i, tp in enumerate(tips):
        mid = wrist.lerp(tp, 0.5) + V((0, 0.05, 0.06 if i < 2 else 0.0))
        k1 = wrist.lerp(mid, 0.5)
        parts.append(tube(f'wf{i}', [wrist, k1, mid, mid.lerp(tp, 0.5), tp], [0.034, 0.024, 0.026, 0.016, 0.008]))
        parts.append(orb(f'wfk{i}', mid, (0.03, 0.028, 0.03)))                                         # the finger's knuckle
        d = (tp - mid).normalized()
        parts.append(blade(f'wtip{i}', tp - d * 0.04, tp + d * (0.3 if i == 0 else 0.2), 0.035, thick=0.4))   # a spike at each fingertip
        bones.append([wrist.lerp(mid, k / 6) for k in range(6)] + [mid.lerp(tp, k / 7) for k in range(8)])
    body_edge = [root.lerp(V((s * 0.32, 0.42, 1.9)), k / 13) for k in range(14)]
    bm = bmesh.new(); nseg = 22
    hem_pts = []
    veins = []
    for pi, (fa, fb) in enumerate(list(zip(bones, bones[1:])) + [(bones[-1], body_edge)]):
        rows = []
        for j in range(len(fa)):
            row = []
            for k in range(nseg + 1):
                u = k / nseg
                p = fa[j].lerp(fb[j], u)
                sag = math.sin(u * math.pi) * (j / (len(fa) - 1)) ** 1.3 * 0.3
                p = p + (wrist - p).normalized() * sag + V((0, 0.07 * math.sin(u * math.pi), 0))
                p = p + V((0, 0.012 * math.sin(u * math.pi * 5 + j) * math.sin(u * math.pi), 0))   # it ripples where it is stretched
                if j == len(fa) - 1 and 0 < k < nseg:   # a ragged trailing edge, notched
                    p = p + (wrist - p).normalized() * (rnd.uniform(0.0, 0.12) + (0.05 if rnd.random() < 0.2 else 0.0))
                if j == len(fa) - 1:
                    hem_pts.append(p.copy())
                row.append(bm.verts.new(p))
            rows.append(row)
        torn = set()
        for _ in range(2):
            k0, j0 = rnd.randrange(2, nseg - 2), rnd.randrange(6, len(rows) - 3)
            torn |= {(j0, k0), (j0 + 1, k0), (j0 + 2, k0), (j0 + 1, k0 + (1 if rnd.random() < 0.5 else -1))}
            hem_pts += [rows[j0 + 1][k0].co.copy(), rows[j0 + 2][k0].co.copy()]
        for j in range(len(rows) - 1):
            for k in range(nseg):
                if (j, k) in torn:   # slits torn through the membrane along its stretch
                    continue
                bm.faces.new((rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]))
        for k in (nseg // 4, nseg // 2, 3 * nseg // 4):   # veins branching out across the panel from the wrist
            vp = [rows[j][k].co.copy() for j in range(0, len(rows), 2)]
            veins.append(tube(f'vein{pi}{k}', vp, [0.008 - 0.0055 * i / (len(vp) - 1) for i in range(len(vp))], sub=1))
            if k != nseg // 2:   # a side branch off each
                b0 = rows[len(rows) // 3][k].co.copy(); b1 = rows[2 * len(rows) // 3][k + (2 if k < nseg // 2 else -2)].co.copy()
                veins.append(tube(f'vb{pi}{k}', [b0, b0.lerp(b1, 0.5) + V((0, 0.004, 0)), b1], [0.005, 0.004, 0.002], sub=1))
        veins.append(tube(f'hem{pi}', [r.co.copy() for r in rows[-1]], [0.009] * (nseg + 1), sub=1))    # the thickened trailing edge
    mem = mesh_from_bm('membrane.' + n, bm)
    sb = mem.modifiers.new('sb', 'SUBSURF'); sb.levels = 2
    apply_mods(mem)
    # the skin is creased across each bone where it bunches against it, stretched into fine lines
    # fanning out from the wrist between them; thick against the bones, thin out in the panels
    from mathutils.kdtree import KDTree
    lines = bones + [arm, body_edge]
    bs = []
    for ln in lines:
        for a, b in zip(ln, ln[1:]):
            for q in range(6):
                bs.append((a.lerp(b, q / 6), (b - a).normalized()))
    kb = KDTree(len(bs))
    for i, (pp, _) in enumerate(bs): kb.insert(pp, i)
    kb.balance()
    kh = KDTree(len(hem_pts))
    for i, pp in enumerate(hem_pts): kh.insert(pp, i)
    kh.balance()
    bmm = bmesh.new(); bmm.from_mesh(mem.data); bmm.normal_update()
    wv = []
    for v in bmm.verts:
        pp = v.co.copy()
        _, i, d = kb.find(pp)
        nb = math.exp(-d / 0.06)
        _, _, dh = kh.find(pp)
        nh = math.exp(-dh / 0.12)
        rel = pp - wrist
        ang = math.atan2(rel.z, s * rel.x)
        crease = math.sin(pp.dot(bs[i][1]) * math.tau / 0.028 + noise.noise(pp * 8) * 2.0) * 0.0045 * nb
        stretch = math.sin(ang * 70 + noise.noise(pp * 5) * 3.0) * 0.0016 * (1 - nb) * min(rel.length / 0.4, 1)
        v.co += v.normal * (crease + stretch + noise.noise(pp * 30) * 0.0012)
        wv.append((nh, nb, 0.0))
    bmm.to_mesh(mem.data); bmm.free()
    at = mem.data.attributes.new('wv', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', np.array(wv, np.float32).ravel())
    vg = mem.vertex_groups.new(name='thick')
    for v in mem.data.vertices:
        vg.add([v.index], 0.3 + 0.7 * wv[v.index][1], 'REPLACE')
    so = mem.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.026; so.offset = 0
    so.vertex_group = 'thick'; so.thickness_vertex_group = 0.3
    apply_mods(mem); smooth_shade(mem)
    mem = join([mem] + veins, 'membrane.' + n)
    parts.append(blade('wclaw', wrist + V((0, -0.02, 0.03)), wrist + V((s * 0.06, -0.08, 0.32)), 0.045, curve=V((0, -0.06, 0)), thick=0.5))
    parts.append(blade('wthorn', elbow + V((0, 0, 0.03)), elbow + V((s * 0.08, 0.04, 0.28)), 0.04, curve=V((0, 0.04, 0)), thick=0.5))
    return join(parts, 'wingbone.' + n), mem

def ribbed(name, pts, radii, n=30, ribs=14, depth=0.09, flat=1.2, twist=0.0):
    # a horn: the path smoothed (Catmull-Rom), tapering, ringed with growth ridges, slightly flattened
    pts = [V(p) for p in pts]
    def cr(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); u = f - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    def rad(t):
        f = t * (len(radii) - 1); i = min(int(f), len(radii) - 2); u = f - i
        return radii[i] * (1 - u) + radii[i + 1] * u
    t = Tree(); prev = None
    for k in range(n):
        u = k / (n - 1)
        rr = random.Random(k * 7 + len(name))
        r = rad(u) * (1 + depth * math.sin(u * ribs * math.tau) * (1 - u) ** 0.5 + 0.02 * math.sin(u * ribs * 3.7 * math.tau) * (1 - u)
                      + rr.uniform(-0.012, 0.012))   # finer growth rings between the ridges, and uneven ones
        prev = t.add(cr(u), (max(r, 0.002), max(r, 0.002) * flat), prev)
    ob = t.build(name, 1)
    return along(ob, [cr(k / 199) for k in range(200)])

def facing(p, a, b, d):
    # how squarely the body surface at p faces direction d, measured round the limb a->b (-1..1)
    ab = b - a; t = (p - a).dot(ab) / ab.length_squared
    o = p - a.lerp(b, t)
    return o.normalized().dot(V(d).normalized()) if o.length > 1e-6 else 0.0

def build_gear():
    P = {'hands': hands, 'helm': helm, **helm_parts}
    for s, n in SIDES:
        P['wingbone.' + n], P['membrane.' + n] = wing(s, n)
        P['wingbone.' + n].name = 'wingbone.' + n
        # ram's horns: out of the helm's temple, up, then curling back in over the crown
        # not a mirror pair: the right horn curls a little lower and wider, and its tip has been broken off
        hp = [(s * 0.08, 0.0, 0.1), (s * 0.2, 0.03, 0.14), (s * 0.33, 0.06, 0.26), (s * 0.38, 0.08, 0.46), (s * 0.34, 0.07, 0.64),
              (s * 0.25, 0.02, 0.72), (s * 0.18, -0.06, 0.68), (s * 0.16, -0.12, 0.6)]
        hr = [0.056, 0.05, 0.044, 0.036, 0.027, 0.018, 0.01, 0.003]
        if n == 'R':
            hp = [(x * (1 + 0.05 * i / 7), y, z * (1 - 0.035 * i / 7)) for i, (x, y, z) in enumerate(hp)][:7]
            hp[-1] = tuple(a * 0.6 + b * 0.4 for a, b in zip(hp[-1], hp[-2]))
            hr = [0.058, 0.051, 0.045, 0.037, 0.028, 0.02, 0.016]
        P['horn.' + n] = ribbed('horn.' + n, M([V(p) * 0.85 for p in hp]), [r * K for r in hr], n=120, ribs=16 if n == 'L' else 15)
        # where it bursts out of the helm: a knotted burr of horn round its root, and the helm's steel
        # split and peeled back round it
        b0, b1 = M([V(hp[0]) * 0.85, V(hp[1]) * 0.85])
        d = (b1 - b0).normalized()
        q = d.to_track_quat('Z', 'Y')
        burr = ring('burr.' + n, b0 + d * 0.012, 0.054, 0.016, rot=q.to_euler(), seg=(28, 8))
        rb = random.Random(11 + s)
        for v in burr.data.vertices:
            v.co += (v.co - b0).normalized() * 0.008 * (noise.noise(v.co * 60) + rb.uniform(-0.3, 0.3))
        P['burr.' + n] = burr
        pet = []
        for k in range(6):
            a = k / 6 * math.tau + 0.3 * s
            o = (q @ V((math.cos(a), math.sin(a), 0)))
            pet.append(blade('petal', b0 - d * 0.02 + o * 0.062, b0 + d * 0.03 + o * (0.1 + 0.015 * (k % 2)), 0.024, thick=0.22, sub=0))
        P['petals.' + n] = join(pet, 'petals.' + n)
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        hp, ke, an, to = J['hip.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
        # the joints the muscle plates leave bare get their own plate: a couter and a knee cop, each spiked
        P['couter.' + n] = plate(shell_src, 'couter.' + n, lambda p, el=el: (p - el).length < 0.11 and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['cspike.' + n] = blade('cspike.' + n, el + V((s * 0.02, 0.0, 0.02)), el + V((s * 0.08, 0.3, 0.06)), 0.045, curve=V((0, 0, 0.05)), thick=0.45)
        P['kneecop.' + n] = plate(shell_src, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.12 and p.y < ke.y, push=0.05, thick=0.018, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        # the wing mount: a riveted collar of plate on the shoulder blade the wing's arm rises out of
        wr0 = J['wroot.' + n]
        P['wingmount.' + n] = plate(shell_src, 'wingmount.' + n, lambda p, wr0=wr0, s=s: (p - wr0).length < 0.17 and p.y > 0.1 and s * p.x > 0.04,
                                    push=0.045, thick=0.018, smooth=4, facets=0.0, rim=0.014, rivets=0.045, bead=True)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.1, 0.02)), ke + V((s * 0.04, -0.3, 0.2)), 0.045, curve=V((0, 0, 0.04)), thick=0.5)
        P.update(lames(shell_src, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.07 and abs(p.x - an.x) < 0.14, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        for i in range(3):   # talons out of the sabaton's toe
            b = to + V((s * (0.04 - i * 0.04), -0.04, 0.0))
            P[f'toeclaw{i}.' + n] = blade(f'toeclaw{i}.' + n, b, b + V((0, -0.14, -0.04)), 0.024, curve=V((0, 0, 0.02)), thick=0.6)
        d = (kn - wr).normalized()
        for i in range(4):   # gauntlet talons
            off = V((0, -0.065 + i * 0.13 / 3, 0))
            b = kn + off + d * 0.12 + V((0, -0.05, -0.01))
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.1 + V((0, -0.08, -0.03)), 0.016, curve=V((0, -0.02, 0)), thick=0.6)
    # the torso, arms and legs: a plate per muscle (see MPLATE); the great spikes rake up off the
    # shoulder's side-deltoid plate
    muscle_plates(P)
    ch, up_, wa, pe, nk = J['chest'], J['upchest'], J['waist'], J['pelvis'], J['neck']
    for s, n in SIDES:
        sh = J['shoulder.' + n]
        if 'm.sidedelt.' + n in P:
            P['pthorns.' + n] = thorns(P['m.sidedelt.' + n], 'pthorns.' + n, lambda c, s=s, sh=sh: c.z > sh.z + 0.02 and s * c.x > abs(sh.x) - 0.04,
                                       2, 0.6, 0.07, up=3.0, back=0.1, curve=0.3, seed=3 + s, flat=0.55)
    # the belt: a heavy band, a skull for a buckle, chains slung across the hips
    P['belt'] = plate(shell_src, 'belt', lambda p: 1.36 + Z0 < p.z < 1.47 + Z0 and abs(p.x) < 0.4, push=0.05, thick=0.02, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    # the harness: a baldric over the breastplate from the right shoulder to the left hip, and the
    # straps on the inside of each limb the lames are riveted to
    bal0, bal1 = V((-0.3, 0, up_.z + 0.04)), V((0.28, 0, pe.z + 0.1))
    def on_baldric(p):
        d = bal1 - bal0; q = V((p.x, 0, p.z)); t = (q - bal0).dot(d) / d.length_squared
        return 0 <= t <= 1 and (q - bal0.lerp(bal1, t)).length < 0.045 and p.y < -0.04
    P['baldric'] = plate(shell_src, 'baldric', on_baldric, push=0.065, thick=0.01, smooth=1, facets=0.3, bevel=0.002, rivets=0.09)
    for s, n in SIDES:
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        hp, ke, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        P['strap.ua.' + n] = strap(shell_src, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.fa.' + n] = strap(shell_src, 'strap.fa.' + n, el, wr, (0, 0.6, 0.4), t0=0.1, t1=0.95)
        P['strap.th.' + n] = strap(shell_src, 'strap.th.' + n, hp, ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.035)
        P['strap.sh.' + n] = strap(shell_src, 'strap.sh.' + n, ke, an, (0, 1, 0), t0=0.12, t1=0.9)
    sk = lambda pts: [V((0, -0.24, 1.42 + Z0)) + V(p) for p in pts] + [V((0, -0.24, 1.42 + Z0)) + V((-p[0], p[1], p[2])) for p in pts if p[0]]
    P['skull'] = join([hull('skullcap', sk([(0.06, 0.02, 0.08), (0.075, -0.02, 0.0), (0.03, -0.06, 0.06), (0.0, -0.065, 0.02), (0.05, 0.03, -0.02)])),
                       hull('skulljaw', sk([(0.045, -0.02, -0.02), (0.035, -0.05, -0.07), (0.0, -0.06, -0.08), (0.04, 0.02, -0.06)])),
                       blade('skullhorn.L', V((0.05, -0.26, 1.48 + Z0)), V((0.14, -0.29, 1.58 + Z0)), 0.02, thick=0.6),
                       blade('skullhorn.R', V((-0.05, -0.26, 1.48 + Z0)), V((-0.14, -0.29, 1.58 + Z0)), 0.02, thick=0.6)], 'skull')
    links = []
    for i in range(14):
        u = i / 13
        p = V((-0.26 + u * 0.52, -0.22 - 0.03 * math.sin(u * math.pi), 1.34 + Z0 - 0.16 * math.sin(u * math.pi)))
        links.append(ring(f'cl{i}', p, 0.026, 0.008, rot=(math.pi / 2, (i % 2) * math.pi / 2, 0.3), seg=(12, 6)))
    for i in range(9):   # and one hanging down the right hip
        p = V((-0.26 - 0.01 * i, -0.19 + 0.004 * i, 1.38 + Z0 - 0.05 * i))
        links.append(ring(f'ch{i}', p, 0.024, 0.007, rot=((i % 2) * math.pi / 2, 0, 0), seg=(12, 6)))
    P['chain'] = join(links, 'chain')
    # the cloak: from the belt to the floor all round, black going to blood at the hem, torn into strips
    def cloak(u, t):
        a = u * math.pi * 0.92
        # heavy cloth hangs in deep vertical folds that open out as they fall; a few smaller folds ride
        # on the big ones, and the hem drags out behind
        fold = math.sin(u * 13 + 0.6) * 0.05 + math.sin(u * 29 + 1.7) * 0.018 + math.sin(u * 53) * 0.006
        r = 0.27 + t * 0.4 + fold * (0.15 + t)
        return (math.sin(a) * r, 0.04 - math.cos(a) * r * 0.82 + t * t * 0.16, 1.44 + Z0 - t * (1.4 + Z0) + 0.02 * math.sin(u * 7) * t)
    P['cloak'] = cloth('cloak', 72, 40, cloak, thick=0.02, strips=(0.42, 0.2, 11))
    # the tabard: a long crimson panel down the front, torn at the end
    P['tabard'] = cloth('tabard', 12, 30, lambda u, t: (u * (0.15 - t * 0.03), -0.28 - t * 0.06 + u * u * 0.04 - 0.022 * math.cos(u * math.pi * 2.5) * (0.3 + t), 1.42 + Z0 - t * 1.6), thick=0.018, strips=(0.8, 0.0, 4))
    # the tail, spined along its ridge
    P['tail'] = tube('tail', TP, TR, flat=0.85)
    for i in range(1, 7):
        b = TP[i] + V((0, 0, TR[i] * 0.85))
        dd = (TP[i + 1] - TP[i]).normalized()
        P[f'tspike{i}'] = blade(f'tspike{i}', b, b + V((0, 0, 0.16 - i * 0.018)) + dd * 0.08, 0.04 - i * 0.004, thick=0.4)
    # the halberd, in the left hand: a black haft, a long spear blade, a crescent axe each side, a banner
    g = J['wrist.L'].lerp(J['knuckle.L'], 0.6) + V((0, -0.02, 0))
    top, bot = g + V((0.02, -0.06, 1.75)), g + V((-0.02, 0.04, -1.5))
    P['haft'] = sharp(tube('haft', [bot, bot.lerp(top, 0.33) + V((0.01, 0, 0)), bot.lerp(top, 0.66) - V((0.01, 0, 0)), top], [0.034, 0.036, 0.034, 0.04], sub=1), 50)
    grip = []
    for i in range(14):   # a leather grip wound round the haft where the hand holds it
        c = g + V((0, 0, -0.2 + i * 0.032))
        grip.append(ring(f'grip{i}', c, 0.037, 0.007, rot=(0.12 if i % 2 else -0.12, 0, 0), seg=(20, 6)))
    P['grip'] = join(grip, 'grip')
    lg = []
    for k, a0 in enumerate((0, math.pi / 2, math.pi, 3 * math.pi / 2)):   # steel strips running down from the head
        d, tg = V((math.cos(a0), math.sin(a0), 0)), V((-math.sin(a0), math.cos(a0), 0))
        lg.append(hull(f'lang{k}', [top + d * r + tg * w + V((0, 0, z)) for r in (0.034, 0.044) for w in (-0.008, 0.008) for z in (-0.55, -0.05)]))
    P['langets'] = join(lg, 'langets')
    P['socket'] = hull('socket', [top + V((x, y, z)) for x in (-0.06, 0.06) for y in (-0.035, 0.035) for z in (-0.06, 0.14)] + [top + V((0, 0, -0.16))])
    P['spear'] = hull('spear', [top + V(p) for p in ((0, 0, 0.9), (0.1, 0, 0.36), (-0.1, 0, 0.36), (0, 0.022, 0.36), (0, -0.022, 0.36),
                                                      (0.03, 0, 0.12), (-0.03, 0, 0.12), (0, 0.014, 0.12), (0, -0.014, 0.12))])
    for s, n in SIDES:   # each crescent: an upper horn raking out and up, a lower hook out and down
        P['axeup.' + n] = blade('axeup.' + n, top + V((s * 0.05, 0, 0.1)), top + V((s * 0.3, 0, 0.5)), 0.07, curve=V((s * 0.14, 0, -0.08)), thick=0.22)
        P['axelo.' + n] = blade('axelo.' + n, top + V((s * 0.05, 0, 0.04)), top + V((s * 0.28, 0, -0.26)), 0.06, curve=V((s * 0.12, 0, 0.06)), thick=0.22)
    P['ferrule'] = blade('ferrule', bot, bot + V((0, 0, -0.22)), 0.032, thick=1.0)
    P['banner'] = cloth('banner', 10, 24, lambda u, t: (top.x + 0.06 + (u + 1) / 2 * 0.3, top.y + 0.01 + 0.025 * math.sin(u * 4 + t * 6) * (0.3 + t), top.z - 0.12 - t * 0.95),
                        thick=0.01, strips=(0.7, 0.15, 5))
    return P, top

gear, TOP = build_gear()
bpy.data.objects.remove(shell_src)
bpy.data.objects.remove(musc_src)

def build_glow():
    # the face is a burning T cut through the helm; a halo burns behind it; red crosses on the tabard,
    # the banner and the halberd's socket. All recoloured by the raid
    g = {}
    slit = []
    for s, n in SIDES:
        ob = orb('slit.' + n, H + V((s * 0.05, -0.15, 0.03)) * K, (0.055, 0.012, 0.01), rot=(0, 0, s * 0.45))
        sit_on(ob, helm, gap=-0.004); slit.append(ob)
    ob = orb('slitv', H + V((0, -0.17, -0.05)) * K, (0.008, 0.01, 0.065)); sit_on(ob, helm, gap=-0.004); slit.append(ob)
    for s, n in SIDES:
        for k in range(3):
            z = -0.084 - k * 0.018
            ob = orb('breath', H + V((s * 0.055, -0.135 + 0.25 * 0.055, z)) * K, (0.024, 0.004, 0.0035), rot=(0, s * 0.1, s * -0.25))
            slit.append(ob)
    g['eyes'] = (join(slit, 'eyes'), 'head')
    hc = H + V((0, 0.26, 0.24)) * K
    halo = [ring('halo', hc, 0.42, 0.012, rot=(math.pi / 2, 0, 0), seg=(64, 6))]
    for a, L in ((0, 0.34), (math.pi, 0.16), (math.pi / 2, 0.16), (-math.pi / 2, 0.16), (math.pi / 4, 0.09), (-math.pi / 4, 0.09)):
        d = V((math.sin(a), 0, math.cos(a)))
        halo.append(blade('ray', hc + d * 0.4, hc + d * (0.42 + L), 0.022, thick=0.3, sub=0))
    g['halo'] = (join(halo, 'halo'), 'head')
    def cross(name, c, h, w, ty):
        return join([hull(name + 'v', [c + V((x, ty, z)) for x in (-0.011, 0.011) for z in (-h * 0.6, h * 0.4)] + [c + V((0, ty, -h)), c + V((0, ty, h * 0.55))], bevel=0),
                     hull(name + 'h', [c + V((x, ty, z)) for x in (-w * 0.8, w * 0.8) for z in (0.16 * h, 0.26 * h)] + [c + V((-w, ty, 0.21 * h)), c + V((w, ty, 0.21 * h))], bevel=0)], name)
    tab = cross('tabcross', V((0, -0.33, 1.42 + Z0 - 0.42)), 0.2, 0.08, 0.0)
    so = tab.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.008; apply_mods(tab)
    g['tabcross'] = (tab, 'hips')
    ban = cross('bancross', TOP + V((0.21, 0.0, -0.45)), 0.18, 0.07, -0.02)
    so = ban.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.006; apply_mods(ban)
    g['bancross'] = (ban, 'hand.L')
    g['staforb'] = (orb('staforb', TOP + V((0, -0.04, 0.05)), (0.032, 0.02, 0.032)), 'hand.L')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'couter', 'kneecop')   # plates carrying the chipped crimson paint of his colours

# which bones carry each muscle plate: torso plates bend with the spine, limb plates ride their bone
MBONES = {
    'pec': ('smooth', ('spine', 'chest')), 'serratus': ('smooth', ('spine', 'chest')), 'oblique': ('smooth', ('hips', 'spine')),
    'lat': ('smooth', ('spine', 'chest')), 'midtrap': ('smooth', ('spine', 'chest')), 'erector': ('smooth', ('hips', 'spine')),
    'ab': ('smooth', ('hips', 'spine')), 'uppertrap': ('smooth', ('chest', 'neck')), 'scm': ('smooth', ('chest', 'neck')),
    'frontdelt': ('smooth', ('chest', 'upperarm')), 'sidedelt': ('smooth', ('chest', 'upperarm')), 'reardelt': ('smooth', ('chest', 'upperarm')),
    'biceps': ('rigid', 'upperarm'), 'tricepslong': ('rigid', 'upperarm'), 'tricepslat': ('rigid', 'upperarm'),
    'brachiorad': ('rigid', 'forearm'), 'flexors': ('rigid', 'forearm'), 'extensors': ('rigid', 'forearm'),
    'vastuslat': ('rigid', 'thigh'), 'rectusfem': ('rigid', 'thigh'), 'vastusmed': ('rigid', 'thigh'), 'hamstrings': ('rigid', 'thigh'),
    'adductors': ('rigid', 'thigh'), 'glute': ('smooth', ('hips', 'thigh')),
    'gastroout': ('rigid', 'shin'), 'gastroin': ('rigid', 'shin'), 'tibialis': ('rigid', 'shin'),
}

def muscle_bones(label, side):
    key = next(k for k in sorted(MBONES, key=len, reverse=True) if label.startswith(k))
    kind, b = MBONES[key]
    sided = lambda x: x + '.' + side if x in ('upperarm', 'forearm', 'thigh', 'shin') else x
    return (kind, sided(b)) if kind == 'rigid' else (kind, {sided(x) for x in b})

def part_info(name):
    side = next((x for x in name.split('.') if x in ('L', 'R')), None)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name.split('.')[1], side)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name in ('crest', 'visorbolts') or name.startswith('petals'): return 'helm', ('rigid', 'head')
    if name.startswith('burr'): return 'horn', ('rigid', 'head')
    if name == 'aventail': return 'mail', ('smooth', {'head', 'neck'})
    if name.startswith('wingmount'): return steel, ('smooth', {'chest', 'wing.' + side})
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'helm': return 'helm', ('rigid', 'head')
    if name.startswith('horn'): return 'horn', ('rigid', 'head')
    if name.startswith('wingbone'): return 'wingbone', ('smooth', {'wing.' + side, 'wingtip.' + side})
    if name.startswith('membrane'): return 'membrane', ('smooth', {'wing.' + side, 'wingtip.' + side, 'chest'})
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.fa'): return 'leather', ('rigid', 'forearm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name.startswith('strap.sh'): return 'leather', ('rigid', 'shin.' + side)
    if name.startswith('pthorns'): return steel, ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith(('vthorns', 'couter', 'cspike')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith(('kspike', 'kneecop', 'gthorns')): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return steel, ('rigid', 'foot.' + side)
    if name.startswith('toeclaw'): return 'bone', ('rigid', 'foot.' + side)
    if name.startswith('talon'): return 'bone', ('rigid', 'hand.' + side)
    if name == 'baldric': return 'leather', ('smooth', {'spine', 'chest', 'hips'})
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'skull': return 'bone', ('rigid', 'hips')
    if name == 'chain': return 'steel', ('rigid', 'hips')
    if name == 'cloak': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'})
    if name == 'tabard': return 'banner', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'banner': return 'banner', ('rigid', 'hand.L')
    if name == 'grip': return 'leather', ('rigid', 'hand.L')
    if name == 'tail': return 'scales', ('smooth', {'hips', 'tail0', 'tail1', 'tail2', 'tail3'})
    if name.startswith('tspike'):
        c = parts[name].data.vertices[0].co
        return 'horn', ('rigid', min(('tail0', 'tail1', 'tail2', 'tail3'), key=lambda b: (c - J['t' + b[4:]]).length))
    if name in ('haft', 'ferrule', 'socket', 'spear', 'langets') or name.startswith(('axeup', 'axelo')): return 'steel', ('rigid', 'hand.L')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 10000
    if name == 'hands': return 3000
    if name == 'helm': return 2000
    if name in ('crest', 'visorbolts'): return 900
    if name == 'aventail': return 1200
    if name.startswith(('burr', 'petals')): return 500
    if name.startswith('wingmount'): return 700
    if name.startswith('membrane'): return 5600
    if name == 'cloak': return 5200
    if name.startswith('wingbone'): return 2000
    if name == 'tail': return 1400
    if name.startswith(('m.pec', 'm.sidedelt', 'm.frontdelt', 'm.reardelt', 'm.uppertrap', 'm.lat')): return 1000
    if name.startswith('m.'): return 600
    if name.startswith(('sabaton', 'kneecop', 'couter')): return 800
    if name.startswith(('strap', 'baldric', 'belt')): return 400
    if name.startswith(('pthorns', 'vthorns', 'gthorns')): return 900
    if name.startswith('horn.'): return 2400
    if name in ('chain', 'grip'): return 1600
    if name in ('banner', 'tabard'): return 1200
    return min(tris, 300)

MATS = {
    # black scale under the plate, split by molten veins
    'scales': mat_hide('scales', [(0.3, (0.012, 0.008, 0.01)), (0.6, (0.04, 0.02, 0.02)), (0.85, (0.08, 0.03, 0.03))],
                       fissure=(0.9, 0.08, 0.02), scale=46.0, big=5.0, rough=(0.5, 0.28), bump=(0.5, 0.9)),
    # dark leathery skin: the red in it is the blood the light shows through it (see models.js)
    'membrane': mat_membrane('membrane', dark=(0.014, 0.008, 0.008), light=(0.045, 0.022, 0.019), vein=(0.03, 0.006, 0.005), along='wv'),
    # riveted mail on the body: it shows in every gap between the plates
    'mail': mat_mail('mail'),
    'wingbone': mat_horn2('wingbone', root=(0.02, 0.012, 0.012), tip=(0.09, 0.03, 0.025), zmin=2.4, zmax=4.8, rough=0.5, bands=90.0),
    # blackened steel: polished through at the edges, scratched, hammered, grimy in the recesses,
    # etched with red-lacquered filigree
    'steel': mat_steel('steel', base=(0.026, 0.025, 0.028), rough=0.44, engrave=(0.012, 0.005, 0.004)),
    'paint': mat_steel('paint', base=(0.026, 0.025, 0.028), rough=0.44, paint=((0.05, 0.006, 0.005), 0.42)),
    # the helm's etching smoulders, faintly
    'helm': mat_steel('helm', base=(0.026, 0.025, 0.028), rough=0.4, engrave=(0.02, 0.004, 0.003), glow=(0.6, 0.04, 0.01)),
    'leather': mat_leather('leather'),
    'bone': mat_bone('bone', col=(0.17, 0.14, 0.1)),
    'horn': mat_horn2('horn', root=(0.01, 0.008, 0.008), tip=(0.16, 0.06, 0.04), rough=0.42, bands=16.0, along='hv'),
    'cloth': mat_fabric('cloth', 0.0, 2.0, [(0.0, (0.1, 0.008, 0.008)), (0.3, (0.03, 0.007, 0.008)), (1.0, (0.012, 0.01, 0.012))]),
    'banner': mat_fabric('banner', 0.0, 4.0, [(0.0, (0.03, 0.003, 0.004)), (0.35, (0.1, 0.008, 0.008)), (1.0, (0.085, 0.007, 0.007))], sheen=0.5),
}
FLAT = {'mail': (0.04, 0.04, 0.04, 0.5, 1), 'helm': (0.04, 0.04, 0.045, 0.35, 1), 'scales': (0.05, 0.02, 0.02, 0.4, 0), 'membrane': (0.08, 0.015, 0.015, 0.5, 0), 'wingbone': (0.05, 0.02, 0.02, 0.5, 0),
        'steel': (0.04, 0.04, 0.045, 0.35, 1), 'paint': (0.2, 0.02, 0.015, 0.5, 0), 'leather': (0.04, 0.025, 0.015, 0.65, 0),
        'bone': (0.3, 0.25, 0.19, 0.55, 0), 'horn': (0.04, 0.025, 0.02, 0.4, 0), 'cloth': (0.04, 0.01, 0.012, 0.9, 0), 'banner': (0.24, 0.02, 0.02, 0.85, 0)}

def idle(t):
    T = 4.4
    s, c = math.sin(TAU * t / T), math.cos(TAU * t / T)
    p = idle_pose(t, T=T, k=0.9)
    for n, sg in (('L', 1), ('R', -1)):
        p['wing.' + n] = (0.05 * s, sg * -0.05 * s, sg * 0.04 * c)         # the wings breathe, held high
        p['wingtip.' + n] = (0, sg * 0.06 * s, 0)
    p['upperarm.L'] = (-0.15, -0.08, 0); p['forearm.L'] = (-0.55, 0, 0)    # the halberd held planted
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
    # "Sovereign's Judgement": the halberd lifted high, the wings spread, then driven down into the earth
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
    add('hand.L', 2.6 * up + 1.0 * down)   # the wrist keeps the halberd upright, raised and then planted
    add('upperarm.R', -0.3 * up - 0.4 * down, 0.5 * up + 0.2 * down); add('forearm.R', -0.6 * up - 0.4 * down)
    add('thigh.L', -0.1 * up - 0.4 * down); add('thigh.R', 0.15 * down); add('shin.L', 0.1 * up + 0.55 * down); add('shin.R', 0.2 * down)
    add('foot.L', -0.15 * down)
    for n, sg in (('L', 1), ('R', -1)):
        add('wing.' + n, -0.2 * up + 0.35 * down, -sg * 0.6 * up, sg * 0.4 * down)
        add('wingtip.' + n, 0, -sg * 0.4 * up + sg * 0.2 * down)
    p['_hips_loc'] = (0, 0, -0.12 * down)
    return p

parts = {'body_high': body, **gear}

def uv_weight(name):
    # texture goes where the eye goes: the head first, then the chest and shoulders, then the rest
    if name in ('helm', 'crest', 'visorbolts') or name.startswith(('horn', 'burr', 'petals')): return 3.0
    if name.startswith(('m.pec', 'm.sidedelt', 'm.frontdelt', 'm.reardelt', 'm.uppertrap', 'm.scm', 'pthorns')): return 2.2
    if name.startswith(('m.', 'couter', 'belt', 'skull', 'wingmount', 'baldric')): return 1.4
    if name.startswith('membrane'): return 0.55
    if name in ('cloak', 'banner', 'tail') or name.startswith('tspike'): return 0.5
    if name == 'body_high': return 0.6
    return 1.0
finish('Antares', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, (1.0, 0.1, 0.04),
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight, split=('membrane',))
