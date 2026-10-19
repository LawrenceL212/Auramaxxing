# The Void Crawler (weekly boss): a lean, plated hunter that goes on all fours. Read from its
# shadow alone: a low hunched body with its hands planted on the floor like forelegs, a long arched
# spine of chitin plates with spines down it, a pair of great scythe-arms rising off its shoulder
# blades and folding forward over its head like a mantis, a split-jawed insect head with clustered
# eyes, and a short segmented tail. The crouch lives in the clips; the bind pose stands upright.
# Its attack: it rears up on its haunches, scythes high, and pounces, slamming both blades down.
#   python3.11 crawler.py [--bake] [--tex 1024] [--out ../../crawler.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *
from mathutils import Quaternion

reset(83)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'crawler.glb'))

SC = 1.12   # built a size up from a standing knight: on all fours it still rises past 2.6 m with its scythes
J = {'pelvis': (0, 0.02, 1.7), 'waist': (0, 0.04, 1.95), 'chest': (0, 0.02, 2.3), 'upchest': (0, 0.04, 2.52),
     'neck': (0, -0.02, 2.7), 'head': (0, -0.07, 2.86), 'crown': (0, -0.06, 3.04)}
J = {k: V(v) * SC for k, v in J.items()}
mirrored(J, {k: tuple(c * SC for c in v) for k, v in {
    # long arms: the hands reach the floor when it hunches; long shins for the haunches
    'shoulder': (0.48, 0.04, 2.52), 'elbow': (0.7, 0.12, 1.9), 'wrist': (0.8, -0.02, 1.28), 'knuckle': (0.83, -0.1, 1.1),
    'hip': (0.17, 0.02, 1.66), 'knee': (0.24, -0.07, 0.92), 'ankle': (0.27, 0.08, 0.13), 'toe': (0.31, -0.26, 0.03),
    'sroot': (0.17, 0.3, 2.42)}.items()})   # sroot: where each scythe-arm grows off the shoulder blade (not a bone)
H = J['head']
BONES = human_bones()

# ── the crouch every clip is built on: hunched, hands planted, haunches folded ──
def crouch():
    p = {'hips': (0.35, 0, 0), 'spine': (0.75, 0, 0), 'chest': (0.4, 0, 0), 'neck': (-0.65, 0, 0), 'head': (-0.55, 0, 0)}
    for s, n in SIDES:
        p['upperarm.' + n] = (-1.45, -s * 0.12, 0); p['forearm.' + n] = (-0.3, 0, 0); p['hand.' + n] = (-0.3, 0, 0)
        p['thigh.' + n] = (-1.25, -s * 0.22, 0); p['shin.' + n] = (1.95, 0, 0); p['foot.' + n] = (-0.35, 0, 0)
    p['_hips_loc'] = (0, -0.86 * SC, 0)
    return p
CROUCH = crouch()

def fk(pose):
    """Forward kinematics with finish()'s conventions: {bone: (delta rotation, posed head)}."""
    D, head = {}, {}
    rest = {b: (h, par) for b, h, t, par in BONES}
    for b, h, t, par in BONES:
        ex, ey, ez = pose.get(b, (0, 0, 0))
        q = Matrix.Rotation(ez, 4, 'Z').to_quaternion() @ Matrix.Rotation(ey, 4, 'Y').to_quaternion() @ Matrix.Rotation(ex, 4, 'X').to_quaternion()
        if par is None:
            lx, ly, lz = pose.get('_hips_loc', (0, 0, 0))
            head[b] = J[h] + V((lx, -lz, ly)); D[b] = q
        else:
            head[b] = head[par] + D[par] @ (J[h] - J[rest[par][0]]); D[b] = D[par] @ q
    return {b: (D[b], head[b]) for b in D}
FK = fk(CROUCH)
def to_rest(bone, p):   # a point placed in the crouch, carried back to the bind pose by the bone that carries it
    D, hd = FK[bone]
    return D.inverted() @ (V(p) - hd) + J[[x for x in BONES if x[0] == bone][0][1]]
def to_posed(bone, p):
    D, hd = FK[bone]
    return D @ (V(p) - J[[x for x in BONES if x[0] == bone][0][1]]) + hd

def extra(obs):   # the ridges of muscle on the shoulder blades the scythe-arms grow out of
    for s, n in SIDES:
        obs.append(muscle(V((s * 0.07, 0.22, 2.2)) * SC, J['sroot.' + n] + V((s * 0.02, 0.02, 0.05)), 0.09 * SC, seg=(8, 5)))

body, hands, src, FIELDS, shell = armoured_body(J, mass=0.95, waist=0.8, extra=extra)
BVH = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
HK = SC * 1.3   # the head is built large: it is the face of a low creature
M = lambda pts: [H + V(p) * HK for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def crescent(name, path, widths, normal, thick=0.012, side=1):
    """A curved, faceted blade along path: a thick spine on one side, a sharp edge on the other,
    built as convex segments so every face stays a hard plane."""
    path = [V(p) for p in path]; normal = V(normal).normalized()
    segs, edge = [], []
    secs = []
    for i, c in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        e = t.cross(normal).normalized() * side
        w = widths[i]
        tk = thick * (1 - 0.8 * i / (len(path) - 1)) + 0.002
        sec = [c - e * w * 0.3 + normal * tk, c - e * w * 0.3 - normal * tk, c - e * w * 0.42, c + e * w * 0.7 + normal * 0.0015, c + e * w * 0.7 - normal * 0.0015]
        secs.append(sec); edge.append(c + e * w * 0.71)
    for a, b in zip(secs, secs[1:]):
        segs.append(hull(name + 'seg', a + b, bevel=0))
    return sharp(join(segs, name), 25), edge

def back_point(z, x=0.0):
    hit = BVH.ray_cast(V((x, 2.0, z)), V((0, -1, 0)))
    return (hit[0], hit[1]) if hit[0] is not None else (V((x, 0.25 * SC, z)), V((0, 1, 0)))

def build_head():
    # a narrow insect skull thrust forward: a high keeled crown swept back into a crest, brow ridges
    # hooding two clusters of eyes, cheek plates, a jaw split down the middle into two halves that
    # open sideways, and a pair of hooked mandibles outside them
    sk = hull('skull', M(both([(0.0, 0.12, 0.1), (0.08, 0.07, 0.07), (0.1, -0.04, 0.03), (0.05, -0.16, 0.07), (0.0, -0.2, 0.09),
                                (0.0, 0.15, -0.03), (0.08, 0.08, -0.08), (0.08, -0.12, -0.05), (0.03, -0.24, -0.02), (0.0, -0.25, -0.02),
                                (0.0, -0.02, 0.16), (0.04, 0.02, 0.14), (0.0, 0.24, 0.16), (0.02, 0.2, 0.12)])))
    parts = [sk]
    for s, n in SIDES:
        # the brow: a hard shelf jutting over the eye cluster, so the eyes burn out of a deep socket
        parts.append(hull('brow.' + n, M([(s * 0.02, -0.21, 0.085), (s * 0.11, -0.13, 0.06), (s * 0.12, -0.1, 0.03), (s * 0.03, -0.23, 0.055),
                                           (s * 0.08, -0.08, 0.1), (s * 0.13, -0.16, 0.035)])))
        # the cheek plate under the eyes, flaring back to a blade
        parts.append(hull('cheek.' + n, M([(s * 0.05, -0.2, -0.03), (s * 0.115, -0.11, -0.02), (s * 0.13, 0.0, -0.06), (s * 0.09, -0.06, -0.1),
                                           (s * 0.18, 0.12, -0.04), (s * 0.06, -0.18, -0.07)])))
        # the split jaw: each half a wedge hinged under the cheek, opened a little to the side
        jaw = hull('jaw.' + n, M([(s * 0.02, -0.12, -0.09), (s * 0.08, -0.04, -0.1), (s * 0.04, -0.27, -0.13), (s * 0.075, -0.26, -0.14),
                                   (s * 0.06, -0.14, -0.15), (s * 0.03, -0.06, -0.12)]))
        parts.append(jaw)
        for k in range(4):   # fangs along the inner edge of each half
            b = H + V((s * (0.035 + 0.008 * k), -0.25 + 0.035 * k, -0.125)) * HK
            parts.append(blade('fang', b, b + V((-s * 0.012, -0.01, 0.045 - 0.006 * k)) * HK, 0.009 * HK, thick=0.6, sub=0))
        # the mandible: a hooked blade from the jaw hinge, curving forward and in past the snout
        mb = H + V((s * 0.1, -0.08, -0.08)) * HK
        parts.append(blade('mandible.' + n, mb, H + V((s * 0.05, -0.42, -0.16)) * HK, 0.035 * HK, curve=V((s * 0.09, -0.02, 0.02)) * HK, thick=0.35))
        # antennae-horns: from the brow, swept back over the skull past the crown
        parts.append(blade('feeler.' + n, H + V((s * 0.04, -0.14, 0.1)) * HK, H + V((s * 0.2, 0.5, 0.38)) * HK, 0.03 * HK,
                           curve=V((s * 0.04, 0.0, 0.14)) * HK, thick=0.45, n=9))
        for k in range(3):   # a row of short crest spines down each side of the keel
            b = H + V((s * 0.03, 0.02 + 0.07 * k, 0.15 - 0.005 * k)) * HK
            parts.append(blade('crest', b, b + V((s * 0.03, 0.08, 0.06)) * HK, 0.018 * HK, thick=0.4, sub=0))
    return join(parts, 'head')

def build_scythe(s, n):
    # designed in the crouch: up off the shoulder blade, folding forward at a knuckled joint, then the
    # great blade hanging down in front of the face, its edge facing back toward the body
    r0 = to_posed('chest', J['sroot.' + n])
    j1 = r0 + V((s * 0.24, 0.1, 0.78)) * SC
    j2 = j1 + V((s * 0.1, -0.52, 0.22)) * SC
    tip = j2 + V((s * 0.02, -0.5, -1.05)) * SC
    pts = [r0, r0.lerp(j1, 0.5) + V((s * 0.02, 0.04, 0)), j1, j1.lerp(j2, 0.5) + V((0, 0, 0.05)), j2]
    seg = sharp(tube('sarm', pts, [0.07 * SC, 0.058 * SC, 0.05 * SC, 0.045 * SC, 0.048 * SC], flat=0.75, sub=1), 30)
    knot = [rock('sk1', j1, (0.08 * SC, 0.07 * SC, 0.08 * SC), seed=1.3 + s, rough=0.2, n=22, bevel=0.006),
            rock('sk2', j2, (0.07 * SC, 0.065 * SC, 0.07 * SC), seed=2.1 + s, rough=0.2, n=22, bevel=0.006)]
    # chitin shells over the two segments, a hard keel along their tops
    shells = []
    for a, b, w in ((r0, j1, 0.09), (j1, j2, 0.075)):
        d = (b - a); u = d.normalized(); side = u.cross(V((0, 0, 1)) if abs(u.z) < 0.9 else V((1, 0, 0))).normalized(); up = side.cross(u).normalized()
        if up.dot(V((0, 0.4, 1))) < 0: up = -up
        sh = []
        for t in (0.08, 0.5, 0.92):
            c = a + d * t
            ww = w * SC * (1.0 - 0.25 * abs(t - 0.5))
            sh += [c + side * ww + up * 0.01, c - side * ww + up * 0.01, c + up * ww * 1.05, c + side * ww * 0.6 + up * ww * 0.8, c - side * ww * 0.6 + up * ww * 0.8]
        shells.append(hull('sshell', sh))
    spikes = [blade('sspk1', j1 + V((0, 0.03, 0.04)) * SC, j1 + V((s * 0.08, 0.3, 0.32)) * SC, 0.04 * SC, curve=V((0, 0.05, 0)) * SC, thick=0.45),
              blade('sspk2', j2 + V((0, 0.0, 0.05)) * SC, j2 + V((s * 0.04, 0.12, 0.26)) * SC, 0.03 * SC, thick=0.45)]
    # the blade: a long crescent, broad near the joint, hooked to a needle point
    path, widths = [], []
    for k in range(14):
        u = k / 13
        p = j2.lerp(tip, u) + V((0, -0.3 * math.sin(u * math.pi * 0.9) - 0.12 * u * u, 0)) * SC
        path.append(p); widths.append((0.16 * (1 - u) ** 0.7 + 0.012) * SC)
    edge_side = -1 if s > 0 else 1
    bl, edge = crescent('sblade', path, widths, V((1, 0, 0)), thick=0.016 * SC, side=edge_side)
    # which way the edge faces: toward the body (+y side of the curve)
    if sum(e.y for e in edge) < sum(p.y for p in path):
        bl, edge = crescent('sblade', path, widths, V((1, 0, 0)), thick=0.016 * SC, side=-edge_side)
    socket = hull('ssocket', [j2 + V((x, y, z)) * SC for x in (-0.05, 0.05) for y in (-0.06, 0.06) for z in (-0.12, 0.04)])
    arm = join([seg] + knot + shells + spikes + [socket], 'scythe.' + n)
    for ob in (arm, bl):   # carried back to the bind pose: rigid on the chest
        D, hd = FK['chest']
        Mx = Matrix.Translation(J['chest']) @ D.inverted().to_matrix().to_4x4() @ Matrix.Translation(-hd)
        ob.data.transform(Mx)
    edge = [to_rest('chest', e) for e in edge]
    bl.name = 'sblade.' + n
    return arm, bl, edge

def build_back():
    # the arched spine: overlapping chitin plates from the nape to the tail, each raising a spine,
    # the spines longest over the hump of the shoulders
    P = {}
    zs = [J['pelvis'].z - 0.12 * SC + k * 0.105 * SC for k in range(11)]
    for i, z in enumerate(zs):
        p, nrm = back_point(z)
        u = i / (len(zs) - 1)
        w = (0.1 + 0.08 * math.sin(u * math.pi)) * SC
        L = 0.075 * SC
        o = p + nrm * 0.02 * SC
        top = o + V((0, 1, 0.25)).normalized() * 0.055 * SC
        pts = [o + V((x * w, 0, dz * L)) for x in (-1, 1) for dz in (-1, 1.2)]
        pts += [o + V((x * w * 0.55, 0.035 * SC, dz * L)) for x in (-1, 1) for dz in (-1, 1.3)]
        pts += [top + V((0, 0, -L)), top + V((0, 0, L * 1.4))]
        pts += [o + V((x * w * 1.05, -0.04 * SC, dz * L * 0.8)) for x in (-1, 1) for dz in (-1, 1)]
        bone = 'hips' if z < J['waist'].z else 'spine' if z < J['chest'].z else 'chest' if z < J['upchest'].z + 0.04 else 'neck'
        P[f'bplate{i}.{bone}'] = hull(f'bplate{i}', pts)
        ln = (0.12 + 0.3 * math.sin(min(1, u * 1.15) * math.pi) ** 1.5) * SC
        d = FK[bone][0].inverted() @ V((0, 0.5, 0.87))   # raked back in the crouch, whatever the plate's tilt
        P[f'bspine{i}.{bone}'] = blade(f'bspine{i}', top - V((0, 0.02, 0)) * SC, top + d * ln, 0.035 * SC,
                                       curve=FK[bone][0].inverted() @ V((0, -0.02, 0.05)) * SC, thick=0.35)
    # the tail: chitin rings from the base of the spine, curling down and back, a barbed sting at its end
    base, _ = back_point(J['pelvis'].z - 0.18 * SC)
    b0 = to_posed('hips', base)   # laid out in the crouch: straight back off the haunches, then dropping
    tp = [to_rest('hips', b0 + V(p) * SC) for p in ((0, -0.04, 0.02), (0, 0.28, 0.06), (0, 0.56, 0.0), (0, 0.8, -0.18), (0, 0.92, -0.42))]
    P['tail.hips'] = sharp(tube('tail', tp, [0.075 * SC, 0.065 * SC, 0.05 * SC, 0.038 * SC, 0.022 * SC], flat=0.8, sub=1), 30)
    rings = []
    for k in range(1, 9):
        u = k / 9
        f = u * 4; i = min(int(f), 3); c = tp[i].lerp(tp[i + 1], f - i); d = (tp[i + 1] - tp[i]).normalized()
        r = (0.075 - 0.05 * u) * SC
        rings.append(ring('tring', c, r * 1.05, 0.013 * SC, rot=d.to_track_quat('Z', 'Y').to_euler(), seg=(14, 4)))
        if k % 2:
            b = c + V((0, 0.4, 1)).normalized() * r
            rings.append(blade('tspk', b, b + V((0, 0.3, 1)).normalized() * 0.1 * SC, 0.02 * SC, thick=0.4, sub=0))
    P['tailrings.hips'] = join(rings, 'tailrings')
    d = (tp[-1] - tp[-2]).normalized()
    P['sting.hips'] = blade('sting', tp[-1] - d * 0.03, tp[-1] + d * 0.28 * SC + V((0, -0.1, 0)) * SC, 0.04 * SC, curve=V((0, -0.06, 0)) * SC, thick=0.45)
    return P

def build_gear():
    P = {'hands': hands, 'head': build_head()}
    muscle_plates(P, src, FIELDS, scale=0.95)
    for s, n in SIDES:
        P['scythe.' + n], P['sblade.' + n], EDGES[n] = build_scythe(s, n)
        r0 = J['sroot.' + n]
        P['smount.' + n] = plate(shell, 'smount.' + n, lambda p, r0=r0, s=s: (p - r0).length < 0.16 * SC and p.y > 0.12 and s * p.x > 0.03,
                                 push=0.045, thick=0.018, smooth=4, facets=0.0, rim=0.014, rivets=0.045, bead=True)
        el, ke, an, to, wr, kn = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n], J['wrist.' + n], J['knuckle.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.1 * SC and p.y > el.y - 0.02, push=0.04, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['cspike.' + n] = blade('cspike.' + n, el + V((s * 0.02, 0.02, 0.0)), el + V((s * 0.06, 0.26, -0.08)) * 1.0, 0.04, curve=V((0, 0, 0.05)), thick=0.45)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.12 * SC and p.y < ke.y, push=0.05, thick=0.018, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.1, 0.02)), ke + V((s * 0.04, -0.3, 0.16)), 0.045, curve=V((0, 0, 0.04)), thick=0.5)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.07 and abs(p.x - an.x) < 0.14, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        for i in range(3):   # talons out of the toes
            b = to + V((s * (0.04 - i * 0.04), -0.04, 0.0))
            P[f'toeclaw{i}.' + n] = blade(f'toeclaw{i}.' + n, b, b + V((0, -0.15, -0.03)), 0.024, curve=V((0, 0, 0.02)), thick=0.6)
        d = (kn - wr).normalized()
        for i in range(4):   # long talons: the forelegs dig into the floor with them
            off = V((0, (-0.065 + i * 0.13 / 3) * SC, 0))
            b = kn + off + d * 0.12 * SC + V((0, -0.05, -0.01)) * SC
            P[f'talon{i}.' + n] = blade(f'talon{i}.' + n, b, b + d * 0.14 + V((0, -0.11, -0.03)), 0.018, curve=V((0, -0.03, 0)), thick=0.6)
        # a ridge of chitin spines down the outside of each forearm
        P['fspines.' + n] = join([blade('fs', el.lerp(wr, t) + V((s * 0.06, 0.03, 0)), el.lerp(wr, t) + V((s * 0.16, 0.1, 0.1)), 0.025, thick=0.4, sub=0)
                                   for t in (0.2, 0.45, 0.7)], 'fspines.' + n)
        sh, hp = J['shoulder.' + n], J['hip.' + n]
        P['strap.ua.' + n] = strap(shell, 'strap.ua.' + n, sh, el, (-s, 0, 0), t0=0.3, t1=0.95)
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, hp, ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.035)
    P.update(build_back())
    P['belt'] = plate(shell, 'belt', lambda p: J['pelvis'].z - 0.02 < p.z < J['pelvis'].z + 0.09 and abs(p.x) < 0.4, push=0.05, thick=0.02, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    # a short ragged loincloth front and back, so the haunches read under the plate
    pz = J['pelvis'].z
    P['loin'] = cloth('loin', 10, 14, lambda u, t: (u * (0.15 + t * 0.03), -0.25 * SC - t * 0.06 + u * u * 0.04, pz + 0.04 - t * 0.55), thick=0.014, strips=(0.45, 0.1, 3))
    return P

EDGES = {}
gear = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    eyes = []
    for s, n in SIDES:   # four eyes a side, clustered under the brow, big to small
        for k, (x, y, z, r) in enumerate(((0.07, -0.19, 0.035, 0.024), (0.1, -0.15, 0.03, 0.019), (0.055, -0.2, 0.0, 0.015), (0.09, -0.16, 0.0, 0.013))):
            eyes.append(orb('eye', H + V((s * x, y, z)) * HK, (r * HK, r * 0.8 * HK, r * HK), seg=(12, 8)))
    # the maw glows between the two halves of the jaw
    eyes.append(orb('maw', H + V((0, -0.17, -0.1)) * HK, (0.022 * HK, 0.06 * HK, 0.018 * HK), seg=(12, 8)))
    g['eyes'] = (join(eyes, 'eyes'), 'head')
    for n in ('L', 'R'):   # the scythes' edges burn
        g['edge.' + n] = (tube('edge.' + n, EDGES[n], [0.006] * len(EDGES[n]), sub=1), 'chest')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'kneecop', 'couter', 'smount')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'head': return 'chitin', ('rigid', 'head')
    if name.startswith(('scythe', 'sblade')): return ('chitin' if name.startswith('scythe') else 'steel'), ('rigid', 'chest')
    if name.startswith('smount'): return steel, ('smooth', {'chest', 'spine'})
    if name.startswith(('bplate', 'bspine', 'tail', 'sting')): return 'chitin', ('rigid', name.split('.')[-1])
    if name.startswith(('couter', 'cspike', 'fspines')): return steel, ('rigid', 'forearm.' + side)
    if name.startswith(('kneecop', 'kspike')): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('toeclaw'): return 'bone', ('rigid', 'foot.' + side)
    if name.startswith('talon'): return 'bone', ('rigid', 'hand.' + side)
    if name.startswith('strap.ua'): return 'leather', ('rigid', 'upperarm.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name == 'loin': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 6000
    if name == 'hands': return 2400
    if name == 'head': return 2400
    if name.startswith('m.'): return plate_tris(name, 480, 260)
    if name.startswith('scythe'): return 1600
    if name.startswith('sblade'): return 600
    if name.startswith(('tail', 'smount')): return 700
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt')): return 500
    if name == 'loin': return 600
    return min(tris, 260)

def uv_weight(name):
    if name in ('head',) or name.startswith('sblade'): return 2.6
    if name.startswith('m.'): return plate_uv(name)
    if name.startswith(('scythe', 'bplate')): return 1.6
    if name == 'loin': return 0.6
    if name == 'body_high': return 0.5
    return 1.0

TEAL = (0.1, 0.74, 0.61)
MATS, FLAT = knight_mats(accent=TEAL, paint=(0.004, 0.03, 0.026), leather=(0.02, 0.018, 0.016),
                         cloth=[(0.0, (0.006, 0.03, 0.026)), (0.4, (0.01, 0.014, 0.014)), (1.0, (0.008, 0.009, 0.01))])
# black chitin, glossy, its cracks lit faintly from inside
MATS['chitin'] = mat_hide('chitin', [(0.3, (0.008, 0.012, 0.012)), (0.6, (0.016, 0.03, 0.028)), (0.9, (0.03, 0.06, 0.055))],
                          fissure=(0.05, 0.4, 0.33), scale=34.0, big=6.0, rough=(0.5, 0.25), bump=(0.5, 0.8))
FLAT['chitin'] = (0.012, 0.026, 0.025, 0.35, 0)

def idle(t):
    T = 3.6
    s, c, s2 = math.sin(TAU * t / T), math.cos(TAU * t / T), math.sin(2 * TAU * t / T)
    # it breathes in the shoulders, the head twitching side to side as it scents
    return posed(CROUCH, spine=(0.03 * s, 0, 0.02 * c), chest=(0.03 * s, 0, 0), neck=(-0.02 * s, 0, 0),
                 head=(0.05 * s2, 0.03 * c, 0.14 * math.sin(TAU * t / T * 0.5) + 0.04 * math.sin(TAU * t * 1.7)))

def roar(t):
    # it rears back off its forelegs and screams at the sky, the scythes flung up behind
    a = ease(t / 0.6) * (1 - ease((t - 0.6) / 0.35))
    b = ease((t - 0.6) / 0.35) * (1 - ease((t - 2.3) / 0.7))
    tr = math.sin(t * 60) * 0.015 * b
    p = idle(t)
    p = posed(p, spine=(0.15 * a - 0.3 * b + tr, 0, 0), chest=(0.1 * a - 0.25 * b, 0, 0), neck=(0.1 * a - 0.15 * b, 0, 0), head=(0.2 * a - 0.45 * b + tr, 0, 0),
              upperarm_L=(0.45 * b, -0.15 * b, 0), upperarm_R=(0.45 * b, 0.15 * b, 0), forearm_L=(-0.3 * b, 0, 0), forearm_R=(-0.3 * b, 0, 0))
    hl = p['_hips_loc']; p['_hips_loc'] = (hl[0], hl[1] + 0.06 * b, hl[2])
    return p

def attack(t):
    # "Reaping Pounce": it rocks back onto its haunches and rears up, forelegs off the floor and the
    # scythes raised high behind its head (held a beat), then lunges forward and down, both blades
    # slamming into the floor in front of it; it shakes, wrenches them free and settles back
    up = ease(t / 0.8) * (1 - ease((t - 1.0) / 0.16))
    down = ease((t - 1.0) / 0.16) * (1 - ease((t - 2.1) / 0.75))
    shake = math.sin(t * 70) * 0.025 * ease((t - 1.12) / 0.05) * (1 - ease((t - 1.6) / 0.3))
    p = idle(t)
    p = posed(p, hips=(-0.25 * up + 0.05 * down, 0, 0), spine=(-0.45 * up + 0.3 * down + shake, 0, 0), chest=(-0.3 * up + 0.28 * down, 0, 0),
              neck=(0.3 * up - 0.2 * down, 0, 0), head=(0.35 * up - 0.12 * down, 0, 0))
    for s, n in SIDES:
        p = posed(p, **{f'upperarm_{n}': (-0.5 * up + 0.3 * down, s * 0.25 * up - s * 0.1 * down, 0), f'forearm_{n}': (-0.7 * up - 0.35 * down, 0, 0),
                        f'hand_{n}': (0.4 * up, 0, 0), f'thigh_{n}': (0.25 * up - 0.2 * down, 0, 0), f'shin_{n}': (-0.1 * up + 0.15 * down, 0, 0),
                        f'foot_{n}': (-0.15 * up + 0.05 * down, 0, 0)})
    hl = p['_hips_loc']
    p['_hips_loc'] = (hl[0], hl[1] + 0.12 * up - 0.06 * down, hl[2] + 0.18 * down)   # (local z: back; the lunge carries it forward)
    return p

parts = {'body_high': body, **gear}
finish('VoidCrawler', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, TEAL,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
