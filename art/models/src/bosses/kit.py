# kit.py: the shared Blender kit for the raid bosses, generalised from models/src/monarch.
# A boss script imports it, builds its parts and calls finish(). Run a boss headless:
#   python3.11 goblin.py [--bake] [--out path.glb] [--tex 2048]
# Blender coords: Z up, the figure faces -Y (glTF +Z). Units are metres.
import bpy, bmesh, math, sys, os, random
import numpy as np
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

V = Vector
ARGS = sys.argv
BAKE = '--bake' in ARGS
TEX = int(ARGS[ARGS.index('--tex') + 1]) if '--tex' in ARGS else 2048
SIDES = ((1, 'L'), (-1, 'R'))

def reset(seed=7):
    random.seed(seed)
    bpy.ops.wm.read_factory_settings(use_empty=True)

def out_path(default):
    return ARGS[ARGS.index('--out') + 1] if '--out' in ARGS else default

def scene():
    return bpy.context.scene

def link(ob):
    scene().collection.objects.link(ob)
    return ob

def activate(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)

def apply_mods(ob):
    activate(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def apply_xform(ob):
    activate(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def mesh_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))

def join(obs, name):
    obs = [o for o in obs if o]
    activate(obs[0])
    for o in obs:
        o.select_set(True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob

def smooth_shade(ob):
    for p in ob.data.polygons:
        p.use_smooth = True

def mirror_name(n):
    return n[:-2] + ('.R' if n.endswith('.L') else '.L') if n[-2:] in ('.L', '.R') else n

# ── the standard skeleton: 17 bones, the same names the Idle and Roar clips drive ──
def human_bones():
    B = [('hips', 'pelvis', 'waist', None), ('spine', 'waist', 'chest', 'hips'), ('chest', 'chest', 'upchest', 'spine'),
         ('neck', 'upchest', 'neck', 'chest'), ('head', 'neck', 'crown', 'neck')]
    for n in ('L', 'R'):
        B += [('upperarm.' + n, 'shoulder.' + n, 'elbow.' + n, 'chest'), ('forearm.' + n, 'elbow.' + n, 'wrist.' + n, 'upperarm.' + n),
              ('hand.' + n, 'wrist.' + n, 'knuckle.' + n, 'forearm.' + n), ('thigh.' + n, 'hip.' + n, 'knee.' + n, 'hips'),
              ('shin.' + n, 'knee.' + n, 'ankle.' + n, 'thigh.' + n), ('foot.' + n, 'ankle.' + n, 'toe.' + n, 'shin.' + n)]
    return B
HUMAN = {b for b, *_ in human_bones()}

def mirrored(J, sided):
    # sided: {'shoulder': (x, y, z)} for the left side; the right is the mirror
    for k, (x, y, z) in sided.items():
        J[k + '.L'] = V((x, y, z)); J[k + '.R'] = V((-x, y, z))
    return J

# ── skin trees: a frame of points and radii turned into a tube mesh, the base of every body ──
class Tree:
    def __init__(self):
        self.pts, self.edges, self.radii = [], [], []
    def add(self, p, r, parent=None):
        if not hasattr(r, '__len__'): r = (r, r)
        self.pts.append(V(p)); self.radii.append(r)
        if parent is not None:
            self.edges.append((parent, len(self.pts) - 1))
        return len(self.pts) - 1
    def chain(self, pts, radii, parent=None):
        i = parent
        for p, r in zip(pts, radii):
            i = self.add(p, r, i)
        return i
    def build(self, name, sub=2):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.pts], self.edges, [])
        ob = link(bpy.data.objects.new(name, me))
        ob.modifiers.new('skin', 'SKIN')
        for i, r in enumerate(self.radii):
            ob.data.skin_vertices[0].data[i].radius = r
        # every separate piece needs a root, or the skin modifier turns it inside out
        children = {b for _, b in self.edges}
        for i in range(len(self.pts)):
            if i not in children:
                ob.data.skin_vertices[0].data[i].use_root = True
        if sub:
            s = ob.modifiers.new('sub', 'SUBSURF'); s.levels = sub
        apply_mods(ob); smooth_shade(ob)
        return ob

def blob(c, s, rot=(0, 0, 0), seg=(24, 16)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1)
    ob = mesh_from_bm('blob', bm)
    ob.location = c; ob.scale = s; ob.rotation_euler = rot
    return ob

def remesh(obs, name, voxel=0.014, smooth=6, factor=0.8):
    body = join(obs, name)
    r = body.modifiers.new('remesh', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel; r.adaptivity = 0
    if smooth:
        sm = body.modifiers.new('smooth', 'SMOOTH'); sm.iterations = smooth; sm.factor = factor
    apply_mods(body)
    smooth_shade(body)
    return body

def displace(ob, scale=6.0, amount=0.02, kind='noise', seed=0.0):
    # sculpt-like surface breakup: push each vertex along its normal by a 3D noise
    me = ob.data
    me.update()
    for v in me.vertices:
        p = v.co * scale + V((seed, seed * 0.7, seed * 1.3))
        if kind == 'cells':
            d = noise.voronoi(p, distance_metric='DISTANCE')[0]
            h = -min(d[0], 1.0) * amount + (d[1] - d[0] < 0.08) * -amount * 0.6
        else:
            h = noise.fractal(p, 0.6, 2.0, 4) * amount
        v.co += v.normal * h

# ── surface plates: extracted from a body's surface (as an artist would), relaxed, thickened ──
def extract(src, name, keep, push=0.035, thick=0.035, smooth=4, bevel=0.006):
    bm = bmesh.new(); bm.from_mesh(src.data)
    bm.normal_update()
    dead = [v for v in bm.verts if not keep(v.co)]
    bmesh.ops.delete(bm, geom=dead, context='VERTS')
    for v in bm.verts:
        v.co += v.normal * push
    ob = mesh_from_bm(name, bm)
    m = ob.modifiers.new('sm', 'SMOOTH'); m.iterations = smooth * 4; m.factor = 1.0
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = thick; so.offset = 1; so.use_rim = True
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 2; bv.limit_method = 'ANGLE'
    apply_mods(ob); smooth_shade(ob)
    return ob

def seg_t(p, a, b):
    ab = b - a
    return max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))

def near_seg(p, a, b, lo, hi, r=0.3):
    t = (p - a).dot(b - a) / (b - a).length_squared
    return lo <= t <= hi and (p - a.lerp(b, t)).length < r

def shell(name, c, s, rot=(0, 0, 0), cut=None, seg=(32, 16), thick=0.04, sub=1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1)
    if cut:
        dead = [v for v in bm.verts if not cut(v.co)]
        bmesh.ops.delete(bm, geom=dead, context='VERTS')
    ob = mesh_from_bm(name, bm)
    ob.location = c; ob.scale = s; ob.rotation_euler = rot
    activate(ob); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = thick; so.use_rim = True; so.offset = -1
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = 0.008; bv.segments = 2; bv.limit_method = 'ANGLE'
    if sub:
        sb = ob.modifiers.new('sub', 'SUBSURF'); sb.levels = sub
    apply_mods(ob); smooth_shade(ob)
    return ob

def spike(name, base, tip, r, curve=V((0, 0, 0)), n=7, flat=1.0, power=1.1, sub=2):
    # a tapered, slightly curved horn, claw or spike from base to tip
    t = Tree()
    i = None
    for k in range(n):
        u = k / (n - 1)
        p = V(base).lerp(V(tip), u) + V(curve) * math.sin(u * math.pi)
        rr = max(0.004, r * (1 - u) ** power)
        i = t.add(p, (rr, rr * flat), i)
    return t.build(name, sub)

def tube(name, path, radii, flat=1.0, sub=2):
    # a skinned tube along a path: horns that curl, tails, tendrils
    t = Tree()
    i = None
    for p, r in zip(path, radii):
        i = t.add(p, (r, r * flat), i)
    return t.build(name, sub)

def box(name, c, s, rot=(0, 0, 0), bevel=0.01, segs=2, sub=0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    ob = mesh_from_bm(name, bm)
    ob.location = c; ob.scale = s; ob.rotation_euler = rot
    activate(ob); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = segs
    if sub:
        sb = ob.modifiers.new('sub', 'SUBSURF'); sb.levels = sub
    apply_mods(ob); smooth_shade(ob)
    return ob

def rock(name, c, s, rot=(0, 0, 0), seed=0.0, rough=0.16, n=30, bevel=0.025):
    # a fractured boulder: the convex hull of jittered points on an ellipsoid, so it breaks into flat facets
    rnd = random.Random(int(seed * 1000) + 1)
    bm = bmesh.new()
    for i in range(n):
        z = rnd.uniform(-1, 1); a = rnd.uniform(0, math.tau); r = math.sqrt(1 - z * z)
        d = V((r * math.cos(a), r * math.sin(a), z))
        k = 1.0 + rnd.uniform(-rough, rough * 0.4)
        bm.verts.new(d * k)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    ob = mesh_from_bm(name, bm)
    ob.location = c; ob.scale = s; ob.rotation_euler = rot
    apply_xform(ob)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2; bv.limit_method = 'ANGLE'
        apply_mods(ob)
    return ob

def cloth(name, nx, nz, point, thick=0.02, sub=1, torn=None, strips=None):
    # a cloth panel from point(u in [-1,1], t in [0,1]) -> (x, y, z); torn(u, t) lifts the hem;
    # strips=(start, gap, seed) tears everything below `start` (0..1 down the panel) into hanging
    # strips of random length, a `gap` share of them torn away entirely
    bm = bmesh.new(); rows = []
    for j in range(nz + 1):
        t = j / nz
        row = []
        for i in range(nx + 1):
            u = i / nx * 2 - 1
            p = V(point(u, t))
            if torn and j > nz * 0.75:
                p.z += torn(u, t)
            row.append(bm.verts.new(p))
        rows.append(row)
    ends = [nz] * nx
    if strips:
        rnd = random.Random(strips[2])
        j0 = int(nz * strips[0])
        w = 0
        for i in range(nx):
            if w <= 0:   # strips one to three columns wide
                w = rnd.choice((1, 1, 2, 2, 3))
                e = j0 if rnd.random() < strips[1] else j0 + int((nz - j0) * rnd.random() ** 0.6)
            ends[i] = max(e, j0); w -= 1
    for j in range(nz):
        for i in range(nx):
            if j < ends[i]:
                bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    if strips:   # point the strip ends
        for i in range(nx):
            if ends[i] < nz:
                for v in (rows[ends[i]][i], rows[ends[i]][i + 1]):
                    if v.is_valid and len(v.link_faces) == 1:
                        v.co.z += 0.0
    ob = mesh_from_bm(name, bm)
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
    if sub:
        sb = ob.modifiers.new('sub', 'SUBSURF'); sb.levels = sub
    apply_mods(ob); smooth_shade(ob)
    return ob

def hem(seed=0.0, depth=0.12):
    def f(u, t):
        return depth * max(0, noise.noise(V((u * 9, 3.1 + seed, 0.5))) + 0.4) * t
    return f

def orb(name, c, s, rot=(0, 0, 0), seg=(16, 10)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1)
    ob = mesh_from_bm(name, bm)
    ob.location = c; ob.scale = s; ob.rotation_euler = rot
    apply_xform(ob); smooth_shade(ob)
    return ob

def ring(name, c, R, r, rot=(0, 0, 0), seg=(48, 8), flat=1.0):
    bm = bmesh.new()
    verts = []
    for i in range(seg[0]):
        a = i / seg[0] * math.tau
        row = []
        for j in range(seg[1]):
            b = j / seg[1] * math.tau
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * flat * math.sin(b))))
        verts.append(row)
    for i in range(seg[0]):
        for j in range(seg[1]):
            a, b = verts[i], verts[(i + 1) % seg[0]]
            bm.faces.new((a[j], b[j], b[(j + 1) % seg[1]], a[(j + 1) % seg[1]]))
    ob = mesh_from_bm(name, bm)
    ob.location = c; ob.rotation_euler = rot
    apply_xform(ob); smooth_shade(ob)
    return ob

def sit_on(ob, onto, axis=V((0, 1, 0)), gap=0.006):
    # slide a glow piece along +Y until it just clears the surface in front of it
    apply_xform(ob)
    tree = BVHTree.FromObject(onto, bpy.context.evaluated_depsgraph_get())
    c = sum((v.co for v in ob.data.vertices), V()) / len(ob.data.vertices)
    hit = tree.ray_cast(V((c.x, c.y - 2.0, c.z)), axis)
    if hit[0] is not None:
        dy = hit[0].y - c.y - gap
        for v in ob.data.vertices:
            v.co.y += dy

# ── athletic anatomy: a slim frame with every major muscle laid on as a tapered spindle ──
def muscle(a, b, r, t0=0.0, t1=1.0, off=V((0, 0, 0)), name='muscle', flat=1.0, taper=0.56, seg=(20, 14)):
    # a muscle belly between a and b: an ellipsoid along the segment, its ends inside the tendons
    a, b = V(a), V(b)
    p, q = a.lerp(b, t0) + V(off), a.lerp(b, t1) + V(off)
    d = q - p
    ob = blob(p.lerp(q, 0.5), (r, r * flat, max(r, d.length * taper)), seg=seg)
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return ob

def athlete(J, mass=1.0, hands='claw', fingers=4, neck=True, waist=1.0, torso_only=False, cut=0):
    """The body every humanoid boss starts from: V-tapered, lean, every muscle group defined.
    J is the joint table (see human_bones). mass scales the muscle; waist the core's girth.
    cut > 0 builds every muscle from a coarse, faceted ellipsoid, so the planes stay flat and the
    edges between them hard: carved rather than rounded (cut=1 is coarse, 2 coarser)."""
    u = (J['upchest'].z - J['pelvis'].z) / 0.86       # sized against the Monarch's torso
    m = mass * u
    X = lambda s: V((s, 0, 0))
    F = V((0, -1, 0)); B = V((0, 1, 0)); Z = V((0, 0, 1))
    sm, sb = ((20, 14), (24, 16)) if not cut else (((8, 5), (9, 6)) if cut < 2 else ((6, 4), (7, 4)))
    mus = lambda *a, **k: muscle(*a, seg=sm, **k)
    bl = lambda c, s, rot=(0, 0, 0): blob(c, s, rot, seg=sb)
    t = Tree()
    pel = t.add(J['pelvis'], (0.26 * u * waist, 0.19 * u))
    wai = t.add(J['waist'], (0.23 * u * waist, 0.165 * u), pel)
    che = t.add(J['chest'], (0.37 * u, 0.24 * u), wai)
    up = t.add(J['upchest'], (0.41 * u, 0.24 * u), che)
    if neck:
        nk = t.add(J['neck'], 0.105 * u, up)
        t.add(J['neck'].lerp(J['head'], 0.6), 0.09 * u, nk)
    obs = []
    ht = Tree()
    for s, n in SIDES:
        def T(lbl, ob, n=n):   # name the muscle, so armour can be cut to its shape (see muscle_fields)
            ob['muscle'] = lbl + '.' + n
            return ob
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        if not torso_only:
            a = t.add(sh, 0.13 * u, up)
            e = t.add(el.lerp(sh, 0.5), 0.1 * u, a)
            e = t.add(el, 0.08 * u, e)
            e = t.add(el.lerp(wr, 0.35), 0.08 * u, e)
            t.add(wr, 0.055 * u, e)
            # the hand: its own fine mesh, from mid-forearm (hidden in the arm) to the fingertips
            w = ht.add(el.lerp(wr, 0.75), 0.045 * u)
            w = ht.add(wr, 0.05 * u, w)
            palm = ht.add(wr.lerp(kn, 0.55), (0.07 * u, 0.04 * u), w)
            d = (kn - wr).normalized()
            for i in range(fingers):
                off = V((0, (-0.065 + i * 0.13 / max(1, fingers - 1)) * u, 0))
                k1 = ht.add(kn + off, 0.024 * u, palm)
                k2 = ht.add(kn + off + d * 0.08 * u + V((0, -0.025 * u, 0)), 0.019 * u, k1)
                tip = 0.005 if hands == 'claw' else 0.014
                ht.add(kn + off + d * (0.14 if hands == 'claw' else 0.12) * u + V((0, -0.06 * u, -0.01 * u)), tip * u, k2)
            t1 = ht.add(wr.lerp(kn, 0.3) + V((-s * 0.045 * u, -0.06 * u, 0)), 0.026 * u, palm)
            ht.add(wr.lerp(kn, 0.7) + V((-s * 0.06 * u, -0.1 * u, 0)), 0.016 * u, t1)
            hp, ke, an, to = J['hip.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n]
            h = t.add(hp, 0.15 * u, pel)
            h = t.add(hp.lerp(ke, 0.45), 0.13 * u, h)
            k = t.add(ke, 0.09 * u, h)
            k = t.add(ke.lerp(an, 0.3), 0.09 * u, k)
            ak = t.add(an, 0.06 * u, k)
            t.add(an.lerp(to, 0.55), (0.075 * u, 0.045 * u), ak)
            t.add(to, (0.055 * u, 0.03 * u), ak)
        # ── shoulders, chest, back ──
        ins = sh.lerp(el, 0.38)                                          # deltoid insertion
        obs += [T('frontdelt', mus(sh + X(-s * 0.12 * u) + F * 0.1 * u + Z * 0.03 * u, ins + F * 0.03 * u, 0.085 * m)),        # front delt
                T('sidedelt', mus(sh + X(s * 0.04 * u) + Z * 0.07 * u, ins + X(s * 0.03 * u), 0.095 * m)),                   # side delt
                T('reardelt', mus(sh + X(-s * 0.1 * u) + B * 0.12 * u + Z * 0.04 * u, ins + B * 0.04 * u, 0.08 * m))]        # rear delt
        # pectorals: an upper (clavicular) and a lower (sternal) mass, rising to the shoulder
        obs += [T('pec', bl(V((s * 0.16 * u, J['chest'].y - 0.17 * u, J['upchest'].z - 0.1 * u)), (0.19 * m, 0.08 * m, 0.15 * m), (0.3, 0, s * 0.12)))]
        obs += [T('uppertrap', mus(V((s * 0.05 * u, J['neck'].y + 0.06 * u, J['neck'].z - 0.02 * u)), sh + X(-s * 0.04 * u) + B * 0.04 * u + Z * 0.07 * u, 0.07 * m)),   # upper trap
                T('midtrap', mus(V((s * 0.04 * u, J['upchest'].y + 0.16 * u, J['upchest'].z)), V((s * 0.02 * u, J['chest'].y + 0.17 * u, J['chest'].z - 0.08 * u)), 0.075 * m)),  # mid trap
                T('lat', bl(V((s * 0.19 * u, J['chest'].y + 0.1 * u, J['chest'].z - 0.06 * u)), (0.13 * m, 0.075 * m, 0.25 * m), (0, s * 0.2, s * -0.2))),  # lat
                T('erector', mus(V((s * 0.06 * u, J['pelvis'].y + 0.14 * u, J['pelvis'].z + 0.06 * u)), V((s * 0.06 * u, J['chest'].y + 0.15 * u, J['chest'].z + 0.04 * u)), 0.05 * m)),  # erector
                T('oblique', mus(V((s * 0.2 * u, J['chest'].y - 0.06 * u, J['chest'].z - 0.18 * u)), V((s * 0.19 * u, J['pelvis'].y - 0.03 * u, J['pelvis'].z + 0.1 * u)), 0.065 * m))]  # oblique
        for i in range(3):                                                                                     # serratus
            z = J['chest'].z + (0.02 - i * 0.065) * u
            obs.append(T(f'serratus{i}', mus(V((s * 0.3 * u, J['chest'].y + 0.0 * u, z + 0.03 * u)), V((s * 0.25 * u, J['chest'].y - 0.1 * u, z - 0.03 * u)), 0.03 * m)))
        for i in range(4):                                                                                     # abdominals: four
            k = i / 3                                                                                          # rows of blocks from the
            z = (J['waist'].z - 0.13 * u) * (1 - k) + (J['chest'].z - 0.1 * u) * k                              # belt to under the pecs
            y = (J['waist'].y - 0.135 * u) * (1 - k) + (J['chest'].y - 0.2 * u) * k
            sz = (0.058 * m, 0.024 * m, 0.05 * m * (1.15 if i == 3 else 1))
            if cut:   # a flat-faced block, its front edges bevelled back: a carved plate, not a ball
                c = V((s * 0.062 * u, y, z)); hx, hy, hz = sz
                pts = [c + V((x * hx, -hy, zz * hz)) for x in (-0.8, 0.8) for zz in (-0.75, 0.75)]
                pts += [c + V((x * hx * 1.1, hy, zz * hz * 1.1)) for x in (-1, 1) for zz in (-1, 1)]
                pts += [c + V((x * hx, -hy * 0.6, zz * hz)) for x in (-1, 1) for zz in (-1, 1)]
                obs.append(T(f'ab{i}', hull('ab', pts, bevel=0)))
            else:
                obs.append(T(f'ab{i}', bl(V((s * 0.062 * u, y, z)), sz, (0.0, 0, s * 0.08))))
        if neck:                                                                                               # sternocleidomastoid
            obs.append(T('scm', mus(V((s * 0.05 * u, J['neck'].y + 0.0 * u, J['neck'].z + 0.06 * u)), V((s * 0.025 * u, J['upchest'].y - 0.12 * u, J['upchest'].z + 0.04 * u)), 0.035 * m)))
        obs.append(mus(V((s * 0.03 * u, J['upchest'].y - 0.15 * u, J['upchest'].z + 0.05 * u)), sh + Z * 0.05 * u, 0.022 * m))  # clavicle
        if torso_only:
            continue
        # ── arms ──
        obs += [T('biceps', mus(sh, el, 0.08 * m, 0.22, 0.9, off=F * 0.04 * u + X(-s * 0.01 * u))),       # biceps
                T('tricepslong', mus(sh, el, 0.075 * m, 0.15, 0.95, off=B * 0.05 * u)),                       # triceps long head
                T('tricepslat', mus(sh, el, 0.06 * m, 0.25, 0.85, off=B * 0.035 * u + X(s * 0.04 * u))),     # triceps lateral head
                T('brachiorad', mus(el, wr, 0.07 * m, -0.05, 0.6, off=F * 0.025 * u + X(s * 0.03 * u))),     # brachioradialis
                T('flexors', mus(el, wr, 0.06 * m, 0.0, 0.75, off=X(-s * 0.03 * u) + F * 0.01 * u)),     # flexors
                T('extensors', mus(el, wr, 0.055 * m, 0.0, 0.7, off=B * 0.025 * u))]                        # extensors
        # ── legs ──
        hp, ke, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        obs += [T('vastuslat', mus(hp, ke, 0.1 * m, 0.1, 0.9, off=X(s * 0.05 * u) + F * 0.01 * u)),        # vastus lateralis
                T('rectusfem', mus(hp, ke, 0.085 * m, 0.08, 0.88, off=F * 0.06 * u)),                       # rectus femoris
                T('vastusmed', mus(hp, ke, 0.08 * m, 0.55, 1.0, off=X(-s * 0.04 * u) + F * 0.03 * u)),     # vastus medialis (teardrop)
                T('hamstrings', mus(hp, ke, 0.085 * m, 0.1, 0.9, off=B * 0.06 * u)),                        # hamstrings
                T('adductors', mus(hp, ke, 0.075 * m, 0.0, 0.6, off=X(-s * 0.06 * u))),                     # adductors
                T('gastroout', mus(ke, an, 0.07 * m, 0.03, 0.55, off=B * 0.045 * u + X(s * 0.025 * u))),   # gastrocnemius, outer
                T('gastroin', mus(ke, an, 0.072 * m, 0.03, 0.6, off=B * 0.045 * u + X(-s * 0.025 * u))),  # gastrocnemius, inner
                T('tibialis', mus(ke, an, 0.04 * m, 0.1, 0.8, off=F * 0.03 * u + X(s * 0.02 * u))),       # tibialis
                T('glute', bl(V((s * 0.1 * u, J['pelvis'].y + 0.1 * u, J['pelvis'].z - 0.03 * u)), (0.12 * m, 0.1 * m, 0.12 * m)))]  # glute
    obs.insert(0, t.build('frame', 1 if cut else 2))
    hands_ob = ht.build('hands', 2) if ht.pts else None
    return obs, hands_ob

def muscle_copies(obs):
    """Copies, in world space, of the named muscles in athlete()'s parts (before they are remeshed
    into one body), so armour can later be cut to each muscle's shape: {name: object}."""
    out = {}
    for o in obs:
        if o and o.get('muscle'):
            c = o.copy(); c.data = o.data.copy(); c.name = 'm:' + o['muscle']; link(c)
            apply_xform(c)
            out[o['muscle']] = c
    return out

def muscle_fields(src, muscles, reach=0.05):
    """For every vertex of src (the body), how firmly each muscle owns it: the distance to the
    nearest other muscle minus the distance to this one. Positive where the surface is that
    muscle's, zero along the crease where two muscles meet, negative beyond it.
    Returns ({name: array over src's vertices}, distance to the nearest muscle)."""
    names = list(muscles)
    trees = [BVHTree.FromObject(muscles[k], bpy.context.evaluated_depsgraph_get()) for k in names]
    co = [v.co.copy() for v in src.data.vertices]
    D = np.full((len(co), len(names)), 9.0, np.float32)
    for j, t in enumerate(trees):
        for i, p in enumerate(co):
            hit = t.find_nearest(p, reach * 3)
            if hit[0] is not None:
                D[i, j] = hit[3]
    best = D.min(1)
    out = {}
    for j, k in enumerate(names):
        others = np.delete(D, j, 1).min(1) if len(names) > 1 else np.full(len(co), 9.0, np.float32)
        f = others - D[:, j]
        f[D[:, j] > reach] = -1.0   # too far from any of this muscle to be armoured as it
        out[k] = f
    return out, best

def iso_cut(bm, vals, thr):
    """Cut a mesh along the line where a per-vertex field crosses thr, keeping the side above it:
    edges crossing the line are split where the field meets it, so the cut runs smooth and clean
    instead of stepping vertex to vertex."""
    fl = bm.verts.layers.float.new('iso')
    for v in bm.verts:
        v[fl] = vals[v.index]
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[fl] < thr - 0.05], context='VERTS')
    made = set()
    for e in [e for e in bm.edges if (e.verts[0][fl] - thr) * (e.verts[1][fl] - thr) < 0]:
        a, b = e.verts
        t = (thr - a[fl]) / (b[fl] - a[fl])
        _, nv = bmesh.utils.edge_split(e, a, t)
        nv[fl] = thr; made.add(nv)
    for f in list(bm.faces):
        vs = [v for v in f.verts if v in made]
        if len(vs) == 2 and not any(e for e in vs[0].link_edges if e.other_vert(vs[0]) is vs[1]):
            bmesh.ops.connect_verts(bm, verts=vs)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[fl] < thr - 1e-6], context='VERTS')

def define(ob, amount=1.2, iters=2):
    # deepen the creases between muscles (concave vertices sink further along their normal): definition
    for _ in range(iters):
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
        moves = []
        for v in bm.verts:
            if not v.link_edges: continue
            avg = sum((e.other_vert(v).co for e in v.link_edges), V()) / len(v.link_edges)
            d = (v.co - avg).dot(v.normal)
            if d < 0:
                moves.append((v, v.normal * d * amount))
        for v, mv in moves:
            v.co += mv
        bm.to_mesh(ob.data); bm.free()
    return ob

def chisel(ob, angle=5.0, shade=30, ridge=0.0):
    # carve a sculpted surface into flat planes meeting at hard edges: near-flat regions merge
    # into single facets (planar dissolve), the creases between them stay, shaded hard. ridge > 0
    # first sharpens convex edges a little (the opposite of define), so the planes meet in a line
    if ridge:
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
        moves = []
        for v in bm.verts:
            if not v.link_edges: continue
            avg = sum((e.other_vert(v).co for e in v.link_edges), V()) / len(v.link_edges)
            d = (v.co - avg).dot(v.normal)
            if d > 0:
                moves.append((v, v.normal * d * ridge))
        for v, mv in moves:
            v.co += mv
        bm.to_mesh(ob.data); bm.free()
    facet(ob, math.radians(angle))
    return sharp(ob, shade)

def hull(name, pts, bevel=0.004, rot=None):
    # a hard, angular solid: the convex hull of the given points (skull plates, wedges, armour lames)
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(V(p))
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    ob = mesh_from_bm(name, bm)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 1; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(25)
        apply_mods(ob)
    return sharp(ob, 25)

def sharp(ob, angle=38):
    # flat-shade the creases: edges sharper than angle keep a hard break in the normals
    activate(ob)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    return ob

def facet(ob, angle=0.1):
    # cut a smooth surface into flat facets (planar dissolve), as forged or chipped plate
    d = ob.modifiers.new('facet', 'DECIMATE'); d.decimate_type = 'DISSOLVE'; d.angle_limit = angle
    apply_mods(ob)
    t = ob.modifiers.new('tri', 'TRIANGULATE')
    apply_mods(ob)
    return ob

def plate(src, name, keep, push=0.03, thick=0.03, smooth=3, facets=0.14, bevel=0.004, rim=0.0, rivets=0.0, cuts=(), bead=False, field=None, gap=0.0):
    """Armour: lifted from the body, relaxed, then cut into hard facets with crisp bevelled edges.
    field, gap: cut it instead along the line where a per-vertex field of src crosses gap (a muscle's
    ownership from muscle_fields, so the plate takes that muscle's outline).
    rim > 0 raises a rolled border that wide round the edge (the middle is sunk a little), the way
    plate is turned at its edges; rivets > 0 sets domed rivets along the border that far apart.
    cuts: (point, normal) planes the plate is trimmed to, everything on the normal's side removed,
    so its edges run clean and straight instead of following the body mesh's vertices."""
    bm = bmesh.new(); bm.from_mesh(src.data)
    bm.normal_update()
    if field is not None:   # cut to a muscle's shape: along the crease, `gap` inside it
        iso_cut(bm, field, gap)
        bm.normal_update()
    dead = [v for v in bm.verts if not keep(v.co)]
    bmesh.ops.delete(bm, geom=dead, context='VERTS')
    for v in bm.verts:
        v.co += v.normal * push
    ob = mesh_from_bm(name, bm)
    m = ob.modifiers.new('sm', 'SMOOTH'); m.iterations = smooth * 4; m.factor = 1.0
    apply_mods(ob)
    if cuts:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        for pt, nrm in cuts:
            pt, nrm = V(pt), V(nrm).normalized()
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=pt, plane_no=nrm, clear_outer=True, dist=1e-5)
        bm.to_mesh(ob.data); bm.free()
        if not ob.data.vertices:
            return ob
    if smooth:   # fair the surface, edges pinned: forged plate curves evenly, it does not ripple
        lp = ob.modifiers.new('fair', 'LAPLACIANSMOOTH'); lp.iterations = smooth * 3; lp.lambda_factor = 1.0; lp.lambda_border = 0.0
        lp.use_normalized = True
        apply_mods(ob)
    if facets:
        facet(ob, facets)
    studs = []
    if rim or rivets:
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
        if rivets:
            border = [e for e in bm.edges if len(e.link_faces) == 1]
            centre = sum((v.co for v in bm.verts), V()) / max(1, len(bm.verts))
            acc = 0.0
            for e in border:
                acc += e.calc_length()
                if acc >= rivets:
                    acc = 0.0
                    p = (e.verts[0].co + e.verts[1].co) / 2
                    nrm = (e.verts[0].normal + e.verts[1].normal).normalized()
                    inward = (centre - p); inward -= nrm * inward.dot(nrm)
                    if inward.length > 1e-6:
                        p = p + inward.normalized() * max(rim * 0.5, 0.012)
                    studs.append((p + nrm * thick, nrm))
        if rim and bead:   # a turned edge: a flat border, then a raised bead, then the field sunk below it
            faces = bm.faces[:]
            bmesh.ops.inset_region(bm, faces=faces, thickness=rim * 0.45, depth=rim * 0.3, use_even_offset=False)
            bmesh.ops.inset_region(bm, faces=faces, thickness=rim * 0.55, depth=-rim * 0.6, use_even_offset=False)
        elif rim:
            faces = bm.faces[:]
            bmesh.ops.inset_region(bm, faces=faces, thickness=rim, depth=-rim * 0.3, use_even_offset=False)
        bm.to_mesh(ob.data); bm.free()
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = thick; so.offset = 1; so.use_rim = True
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 3; bv.profile = 0.62; bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(30); bv.harden_normals = False
    apply_mods(ob)
    if studs:
        rv = []
        for i, (p, nrm) in enumerate(studs):
            s = orb(f'{name}_rv{i}', p, (0.009, 0.009, 0.006), seg=(8, 5))
            s.rotation_mode = 'QUATERNION'; s.rotation_quaternion = nrm.to_track_quat('Z', 'Y')
            apply_xform(s); rv.append(s)
        # the rivets only exist in the high mesh: they bake into the normal and occlusion maps
        ob['detail'] = join(rv, name + '_rivets').name
    return sharp(ob)

def strap(src, name, a, b, face, width=0.03, push=0.016, r=0.22, t0=0.0, t1=1.0, thick=0.008):
    """A leather strap along a limb, on the side `face` points to: lifted off the body under the plate,
    the hidden harness the lames hang from, visible in the gaps between them."""
    a, b = V(a), V(b); face = V(face).normalized()
    ab = b - a
    def keep(p):
        t = (p - a).dot(ab) / ab.length_squared
        if not (t0 <= t <= t1): return False
        o = p - a.lerp(b, t)
        if o.length > r or o.dot(face) <= 0: return False
        lat = o - face * o.dot(face); lat -= ab.normalized() * lat.dot(ab.normalized())
        return lat.length < width
    return plate(src, name, keep, push=push, thick=thick, smooth=1, facets=0.3, bevel=0.002)

def lames(src, name, keep, a, b, n, t0=0.0, t1=1.0, push=0.022, step=0.007, thick=0.014, overlap=0.3, facets=0.0, smooth=5, rim=0.008, rivets=0.07, cuts=(), bead=False):
    """Articulated armour: the region of src that keep() selects, cut into n thin bands along a->b,
    each overlapping the next by `overlap` of a band and lifted `step` further out, so they shingle
    like real lames and can slide over each other when the joint bends. Returns {name+i: plate}."""
    a, b = V(a), V(b)
    ab = b - a
    tt = lambda p: (p - a).dot(ab) / ab.length_squared
    out = {}
    w = (t1 - t0) / n
    for i in range(n):
        lo, hi = t0 + w * i, t0 + w * (i + 1 + overlap)
        m = w * 0.4   # select a little wide, then trim to straight edges across the limb
        planes = [(a + ab * lo, -ab), (a + ab * hi, ab)] + list(cuts)
        ob = plate(src, f'{name}{i}', lambda p, lo=lo - m, hi=hi + m: keep(p) and lo <= tt(p) <= hi,
                   push=push + step * i, thick=thick, smooth=smooth, facets=facets, bevel=0.003, rim=rim, rivets=rivets, cuts=planes, bead=bead)
        if ob is not None and len(ob.data.vertices):
            out[f'{name}{i}'] = ob
    return out

def along(ob, path, attr='hv'):
    """Write each vertex's place on a tube: a vector attribute (t, cos a, sin a), t 0..1 along `path`
    (a dense list of points down its centre) and a its angle round it, measured from a frame carried
    along the path without twisting. Materials use it to ring a horn and crack it along its grain."""
    from mathutils.kdtree import KDTree
    path = [V(p) for p in path]
    T = [(path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized() for i in range(len(path))]
    ref = V((0, 0, 1)) if abs(T[0].z) < 0.9 else V((1, 0, 0))
    N = [(ref - T[0] * ref.dot(T[0])).normalized()]
    for t in T[1:]:
        n = N[-1] - t * N[-1].dot(t)
        N.append(n.normalized() if n.length > 1e-6 else N[-1])
    kd = KDTree(len(path))
    for i, p in enumerate(path): kd.insert(p, i)
    kd.balance()
    me = ob.data
    out = np.zeros((len(me.vertices), 3), np.float32)
    for v in me.vertices:
        _, i, _ = kd.find(v.co)
        o = v.co - path[i]; o -= T[i] * o.dot(T[i])
        b = T[i].cross(N[i])
        a = math.atan2(o.dot(b), o.dot(N[i]))
        out[v.index] = (i / (len(path) - 1), math.cos(a), math.sin(a))
    at = me.attributes.new(attr, 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', out.ravel())
    return ob

def blade(name, base, tip, width, curve=V((0, 0, 0)), thick=0.18, n=7, power=0.9, sub=1):
    # a flat, curved blade or thorn: wide at the root, a hard edge, a needle tip
    return sharp(spike(name, base, tip, width, curve=curve, flat=thick, n=n, power=power, sub=sub), 30)

def thorns(src, name, region, count, length, r, up=0.5, back=0.0, curve=0.35, seed=1, flat=0.35):
    # a crop of curved thorns growing out of a surface: along the normal, swept up (and back)
    rnd = random.Random(seed)
    apply_xform(src)   # work in world space
    me = src.data
    vs = [v for v in me.vertices if region(v.co)]
    if not vs:
        return None
    rnd.shuffle(vs)
    picked = []
    mind = length * 0.35
    for v in vs:
        if all((v.co - p.co).length > mind for p in picked):
            picked.append(v)
        if len(picked) >= count:
            break
    obs = []
    for i, v in enumerate(picked):
        nrm = (v.normal + V((0, back, up))).normalized()
        L = length * rnd.uniform(0.6, 1.15)
        tip = v.co + nrm * L
        bend = (V((0, back, 1)) - nrm * nrm.dot(V((0, back, 1)))).normalized() * L * curve if L else V((0, 0, 0))
        obs.append(spike(f'{name}{i}', v.co - v.normal * r * 0.6, tip + bend * 0.4, r * rnd.uniform(0.8, 1.2), curve=bend * 0.25, flat=flat, n=5, power=1.0, sub=1))
    return sharp(join(obs, name), 30)

# ── procedural materials (Cycles nodes): what gets baked ──
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']

def nodes(nt):
    def n(kind, **kw):
        x = nt.nodes.new(kind)
        for k, v in kw.items():
            if k.startswith('i_'):
                x.inputs[k[2:].replace('_', ' ')].default_value = v
            else:
                setattr(x, k, v)
        return x
    return n

def L(nt, a, b):
    nt.links.new(a, b)

def ramp(n, nt, fac, stops):
    r = n('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
    el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = el.new(pos); e.color = (*col, 1)
    L(nt, fac, r.inputs['Fac'])
    return r

def mul_rgb(n, nt, a, b, fac=1.0):
    m = n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=fac)
    L(nt, a, m.inputs[6]); L(nt, b, m.inputs[7])
    return m.outputs[2]

def mix_rgb(n, nt, fac, a, b):
    m = n('ShaderNodeMix', data_type='RGBA')
    L(nt, fac, m.inputs['Factor']); L(nt, a, m.inputs[6]); L(nt, b, m.inputs[7])
    return m.outputs[2]

def mat_hide(name, stops, fissure=None, scale=26.0, big=7.0, rough=(0.75, 0.45), bump=(0.6, 0.8)):
    # scaled hide: voronoi cells with deep creases; optional glowing fissures along the big cracks
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    vor = n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', i_Scale=scale); L(nt, tc.outputs['Object'], vor.inputs['Vector'])
    vor2 = n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', i_Scale=big); L(nt, tc.outputs['Object'], vor2.inputs['Vector'])
    noi = n('ShaderNodeTexNoise', i_Scale=4.0, i_Detail=8.0, i_Roughness=0.6); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    col = ramp(n, nt, noi.outputs['Fac'], stops)
    crease = ramp(n, nt, vor.outputs['Distance'], [(0.0, (0.25, 0.25, 0.25)), (0.12, (1, 1, 1))])
    L(nt, mul_rgb(n, nt, col.outputs['Color'], crease.outputs['Color']), P.inputs['Base Color'])
    if fissure:
        fis = ramp(n, nt, vor2.outputs['Distance'], [(0.0, fissure), (0.025, (0.0, 0.0, 0.0))])
        gate = ramp(n, nt, noi.outputs['Fac'], [(0.5, (0, 0, 0)), (0.62, (1, 1, 1))])
        L(nt, mul_rgb(n, nt, fis.outputs['Color'], gate.outputs['Color']), P.inputs['Emission Color']); P.inputs['Emission Strength'].default_value = 1.0
    rr = ramp(n, nt, vor.outputs['Distance'], [(0.0, (rough[0],) * 3), (0.15, (rough[1],) * 3)])
    L(nt, rr.outputs['Color'], P.inputs['Roughness'])
    b1 = n('ShaderNodeBump', i_Strength=bump[0], i_Distance=0.004); L(nt, vor.outputs['Distance'], b1.inputs['Height'])
    b2 = n('ShaderNodeBump', i_Strength=bump[1], i_Distance=0.01); L(nt, vor2.outputs['Distance'], b2.inputs['Height']); L(nt, b1.outputs['Normal'], b2.inputs['Normal'])
    L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_skin(name, stops, pores=60.0, wrinkle=9.0, rough=0.55, sss=None):
    # living skin: mottled colour, pores and wrinkles, darker in the folds
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    noi = n('ShaderNodeTexNoise', i_Scale=3.0, i_Detail=6.0, i_Roughness=0.55); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    por = n('ShaderNodeTexVoronoi', i_Scale=pores); L(nt, tc.outputs['Object'], por.inputs['Vector'])
    wr = n('ShaderNodeTexWave', i_Scale=wrinkle, i_Distortion=9.0, i_Detail=4.0); L(nt, tc.outputs['Object'], wr.inputs['Vector'])
    geo = n('ShaderNodeNewGeometry')
    cav = ramp(n, nt, geo.outputs['Pointiness'], [(0.42, (0.45, 0.45, 0.45)), (0.52, (1, 1, 1))])
    col = ramp(n, nt, noi.outputs['Fac'], stops)
    L(nt, mul_rgb(n, nt, col.outputs['Color'], cav.outputs['Color']), P.inputs['Base Color'])
    rr = ramp(n, nt, noi.outputs['Fac'], [(0.3, (rough - 0.1,) * 3), (0.7, (rough + 0.12,) * 3)])
    L(nt, rr.outputs['Color'], P.inputs['Roughness'])
    if sss:
        P.inputs['Subsurface Weight'].default_value = 0.15
        P.inputs['Subsurface Radius'].default_value = sss
    b1 = n('ShaderNodeBump', i_Strength=0.25, i_Distance=0.002); L(nt, por.outputs['Distance'], b1.inputs['Height'])
    b2 = n('ShaderNodeBump', i_Strength=0.35, i_Distance=0.004); L(nt, wr.outputs['Fac'], b2.inputs['Height']); L(nt, b1.outputs['Normal'], b2.inputs['Normal'])
    L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_stone(name, stops, glow=None, moss=None, scale=3.0, glow_width=0.03):
    # weathered rock: layered noise, chipped cracks (dark, or glowing), moss on the up-facing surfaces
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    geo = n('ShaderNodeNewGeometry')
    noi = n('ShaderNodeTexNoise', i_Scale=scale, i_Detail=12.0, i_Roughness=0.65); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    fine = n('ShaderNodeTexNoise', i_Scale=40.0, i_Detail=8.0); L(nt, tc.outputs['Object'], fine.inputs['Vector'])
    crk = n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', i_Scale=scale * 1.6); L(nt, tc.outputs['Object'], crk.inputs['Vector'])
    warp = n('ShaderNodeTexNoise', i_Scale=6.0, i_Detail=4.0); L(nt, tc.outputs['Object'], warp.inputs['Vector'])
    col = ramp(n, nt, noi.outputs['Fac'], stops)
    dark = ramp(n, nt, crk.outputs['Distance'], [(0.0, (0.15, 0.15, 0.15)), (0.05, (1, 1, 1))])
    base = mul_rgb(n, nt, col.outputs['Color'], dark.outputs['Color'])
    edge = ramp(n, nt, geo.outputs['Pointiness'], [(0.5, (0, 0, 0)), (0.58, (0.35, 0.35, 0.35))])
    chip = n('ShaderNodeRGB'); chip.outputs[0].default_value = (0.62, 0.6, 0.55, 1)
    base = mix_rgb(n, nt, edge.outputs['Color'], base, chip.outputs[0])
    if moss:
        sep = n('ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Normal'], sep.inputs['Vector'])
        up = n('ShaderNodeMath', operation='MULTIPLY_ADD', i_Value=1.0)
        up.inputs[1].default_value = 1.0; up.inputs[2].default_value = 0.0
        L(nt, sep.outputs['Z'], up.inputs[0])
        mn = n('ShaderNodeMath', operation='ADD'); L(nt, up.outputs[0], mn.inputs[0]); L(nt, warp.outputs['Fac'], mn.inputs[1])
        mg = ramp(n, nt, mn.outputs[0], [(1.05, (0, 0, 0)), (1.25, (1, 1, 1))])
        mc = n('ShaderNodeRGB'); mc.outputs[0].default_value = (*moss, 1)
        mcol = mul_rgb(n, nt, mc.outputs[0], fine.outputs['Color'], 0.5)
        base = mix_rgb(n, nt, mg.outputs['Color'], base, mcol)
    L(nt, base, P.inputs['Base Color'])
    if glow:
        g = ramp(n, nt, crk.outputs['Distance'], [(0.0, glow), (glow_width, (0, 0, 0))])
        gate = ramp(n, nt, warp.outputs['Fac'], [(0.42, (0, 0, 0)), (0.55, (1, 1, 1))])
        L(nt, mul_rgb(n, nt, g.outputs['Color'], gate.outputs['Color']), P.inputs['Emission Color']); P.inputs['Emission Strength'].default_value = 1.0
    rr = ramp(n, nt, fine.outputs['Fac'], [(0.3, (0.72,) * 3), (0.7, (0.95,) * 3)])
    L(nt, rr.outputs['Color'], P.inputs['Roughness'])
    b1 = n('ShaderNodeBump', i_Strength=0.35, i_Distance=0.004); L(nt, fine.outputs['Fac'], b1.inputs['Height'])
    b2 = n('ShaderNodeBump', i_Strength=0.9, i_Distance=0.012); L(nt, crk.outputs['Distance'], b2.inputs['Height']); L(nt, b1.outputs['Normal'], b2.inputs['Normal'])
    L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_metal(name, base, edge, rough=0.32, engrave=None, rust=None, glow_edge=None):
    # worn metal: bright edges where the surface turns sharply, grime, optional inlaid filigree or rust;
    # glow_edge lights the sharpest edges as a burning trim
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    geo = n('ShaderNodeNewGeometry')
    noi = n('ShaderNodeTexNoise', i_Scale=14.0, i_Detail=10.0); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    big = n('ShaderNodeTexNoise', i_Scale=2.5, i_Detail=4.0); L(nt, tc.outputs['Object'], big.inputs['Vector'])
    edge_m = ramp(n, nt, geo.outputs['Pointiness'], [(0.5, (0, 0, 0)), (0.56, (1, 1, 1))])
    grime = ramp(n, nt, big.outputs['Fac'], [(0.35, (0.55, 0.55, 0.55)), (0.65, (1, 1, 1))])
    basec = n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=1.0, i_A=(*base, 1))
    L(nt, grime.outputs['Color'], basec.inputs[7])
    ec = n('ShaderNodeMix', data_type='RGBA', i_B=(*edge, 1))
    L(nt, edge_m.outputs['Color'], ec.inputs['Factor']); L(nt, basec.outputs[2], ec.inputs[6])
    col = ec.outputs[2]
    metal = n('ShaderNodeValue'); metal.outputs[0].default_value = 1.0
    metal_out = metal.outputs[0]
    rr = ramp(n, nt, noi.outputs['Fac'], [(0.3, (rough - 0.1,) * 3), (0.7, (rough + 0.14,) * 3)])
    rough_out = rr.outputs['Color']
    height = noi.outputs['Fac']
    if rust:
        rg = ramp(n, nt, big.outputs['Fac'], [(0.48, (0, 0, 0)), (0.62, (1, 1, 1))])
        rn = n('ShaderNodeTexNoise', i_Scale=30.0, i_Detail=10.0); L(nt, tc.outputs['Object'], rn.inputs['Vector'])
        rc = ramp(n, nt, rn.outputs['Fac'], [(0.35, rust[0]), (0.65, rust[1])])
        col = mix_rgb(n, nt, rg.outputs['Color'], col, rc.outputs['Color'])
        inv = n('ShaderNodeMath', operation='SUBTRACT', i_Value=1.0); inv.inputs[0].default_value = 1.0
        L(nt, rg.outputs['Color'], inv.inputs[1]); metal_out = inv.outputs[0]
        rmx = n('ShaderNodeMix', data_type='RGBA', i_B=(0.9, 0.9, 0.9, 1))
        L(nt, rg.outputs['Color'], rmx.inputs['Factor']); L(nt, rough_out, rmx.inputs[6]); rough_out = rmx.outputs[2]
    if engrave:
        wav = n('ShaderNodeTexWave', wave_type='RINGS', i_Scale=6.0, i_Distortion=7.0, i_Detail=3.0); L(nt, tc.outputs['Object'], wav.inputs['Vector'])
        lines = ramp(n, nt, wav.outputs['Fac'], [(0.0, (1, 1, 1)), (0.08, (0, 0, 0))])
        gate = ramp(n, nt, big.outputs['Fac'], [(0.45, (0, 0, 0)), (0.5, (1, 1, 1))])
        mm = n('ShaderNodeMath', operation='MULTIPLY'); L(nt, lines.outputs['Color'], mm.inputs[0]); L(nt, gate.outputs['Color'], mm.inputs[1])
        g = n('ShaderNodeMix', data_type='RGBA', i_B=(*engrave, 1))
        L(nt, mm.outputs[0], g.inputs['Factor']); L(nt, col, g.inputs[6]); col = g.outputs[2]
        b = n('ShaderNodeBump', i_Strength=0.5, i_Distance=0.003, invert=True); L(nt, mm.outputs[0], b.inputs['Height'])
        b2 = n('ShaderNodeBump', i_Strength=0.08, i_Distance=0.002); L(nt, noi.outputs['Fac'], b2.inputs['Height']); L(nt, b.outputs['Normal'], b2.inputs['Normal'])
        L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    else:
        b2 = n('ShaderNodeBump', i_Strength=0.12, i_Distance=0.002); L(nt, height, b2.inputs['Height'])
        L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    if glow_edge:
        trim = ramp(n, nt, geo.outputs['Pointiness'], [(0.54, (0, 0, 0)), (0.6, glow_edge)])
        L(nt, trim.outputs['Color'], P.inputs['Emission Color']); P.inputs['Emission Strength'].default_value = 1.0
    L(nt, col, P.inputs['Base Color']); L(nt, metal_out, P.inputs['Metallic']); L(nt, rough_out, P.inputs['Roughness'])
    return m

def mat_plain(name, col, rough, metal=0.0, bump=0.2, scale=30.0, emit=None):
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    noi = n('ShaderNodeTexNoise', i_Scale=scale, i_Detail=8.0); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    P.inputs['Base Color'].default_value = (*col, 1)
    P.inputs['Metallic'].default_value = metal
    rr = ramp(n, nt, noi.outputs['Fac'], [(0.3, (rough - 0.08,) * 3), (0.7, (rough + 0.1,) * 3)])
    L(nt, rr.outputs['Color'], P.inputs['Roughness'])
    if emit:
        P.inputs['Emission Color'].default_value = (*emit, 1); P.inputs['Emission Strength'].default_value = 1.0
    b = n('ShaderNodeBump', i_Strength=bump, i_Distance=0.003); L(nt, noi.outputs['Fac'], b.inputs['Height'])
    L(nt, b.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_horn(name, zmin, zmax, stops, rough=0.42, bands=18.0):
    # horn, bone, claw: dark at the root, pale at the tip, with growth ridges
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    sep = n('ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sep.inputs['Vector'])
    mr = n('ShaderNodeMapRange', i_From_Min=zmin, i_From_Max=zmax); L(nt, sep.outputs['Z'], mr.inputs['Value'])
    col = ramp(n, nt, mr.outputs['Result'], stops)
    wav = n('ShaderNodeTexWave', i_Scale=bands, i_Distortion=2.0, wave_profile='SAW'); L(nt, tc.outputs['Object'], wav.inputs['Vector'])
    wav.bands_direction = 'Z'
    L(nt, col.outputs['Color'], P.inputs['Base Color'])
    P.inputs['Roughness'].default_value = rough
    b = n('ShaderNodeBump', i_Strength=0.5, i_Distance=0.006); L(nt, wav.outputs['Fac'], b.inputs['Height'])
    L(nt, b.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_cloth(name, zmin, zmax, stops, rough=0.85, sheen=0.4, weave=160.0):
    # woven cloth, darker and scorched toward the hem
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    sep = n('ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sep.inputs['Vector'])
    mr = n('ShaderNodeMapRange', i_From_Min=zmin, i_From_Max=zmax); L(nt, sep.outputs['Z'], mr.inputs['Value'])
    noi = n('ShaderNodeTexNoise', i_Scale=6.0, i_Detail=6.0); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    wv = n('ShaderNodeTexWave', i_Scale=weave, wave_profile='SIN'); L(nt, tc.outputs['Object'], wv.inputs['Vector'])
    col = ramp(n, nt, mr.outputs['Result'], stops)
    L(nt, mul_rgb(n, nt, col.outputs['Color'], noi.outputs['Color'], 0.45), P.inputs['Base Color'])
    P.inputs['Roughness'].default_value = rough
    P.inputs['Sheen Weight'].default_value = sheen
    b = n('ShaderNodeBump', i_Strength=0.15, i_Distance=0.002); L(nt, wv.outputs['Fac'], b.inputs['Height'])
    L(nt, b.outputs['Normal'], P.inputs['Normal'])
    return m

# ── premium materials: layered surfaces with wear, grime, scratches and roughness breakup ──
# Everything is procedural and baked; Object coordinates are world coordinates here (every part has
# its transform applied), so a texture's scale is in metres. Masks are 0..1 float sockets.
class G:
    """A tiny node-graph builder: math on sockets or numbers, noise, masks and colour layering."""
    def __init__(self, name):
        self.m, self.nt, self.P = new_mat(name)
        self.n = nodes(self.nt)
        self.tc = self.n('ShaderNodeTexCoord')
        self.geo = self.n('ShaderNodeNewGeometry')
        self.co = self.tc.outputs['Object']
        self.bumps = []
    def _in(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = (*v, 1) if len(v) == 3 else v
        else: L(self.nt, v, sock)
    def math(self, op, a, b=0.0, clamp=True):
        x = self.n('ShaderNodeMath', operation=op); x.use_clamp = clamp
        self._in(x.inputs[0], a); self._in(x.inputs[1], b)
        return x.outputs[0]
    def mul(self, a, b): return self.math('MULTIPLY', a, b)
    def add(self, a, b): return self.math('ADD', a, b, clamp=False)
    def inv(self, a): return self.math('SUBTRACT', 1.0, a)
    def mx(self, a, b): return self.math('MAXIMUM', a, b)
    def band(self, v, lo, hi):
        # smooth 0->1 step from lo to hi (hi < lo gives the falling edge)
        r = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', i_From_Min=lo, i_From_Max=hi)
        self._in(r.inputs['Value'], v); return r.outputs['Result']
    def vec(self, scale=(1, 1, 1), rot=(0, 0, 0)):
        mp = self.n('ShaderNodeMapping'); L(self.nt, self.co, mp.inputs['Vector'])
        mp.inputs['Scale'].default_value = scale; mp.inputs['Rotation'].default_value = rot
        return mp.outputs['Vector']
    def noise(self, scale, detail=6.0, rough=0.55, vec=None, dist=0.0):
        x = self.n('ShaderNodeTexNoise', i_Scale=scale, i_Detail=detail, i_Roughness=rough, i_Distortion=dist)
        L(self.nt, vec or self.co, x.inputs['Vector']); return x.outputs['Fac']
    def edges(self, scale, vec=None, rnd=1.0):
        x = self.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', i_Scale=scale, i_Randomness=rnd)
        L(self.nt, vec or self.co, x.inputs['Vector']); return x.outputs['Distance']
    def cells(self, scale, vec=None):
        x = self.n('ShaderNodeTexVoronoi', feature='F1', i_Scale=scale)
        L(self.nt, vec or self.co, x.inputs['Vector']); return x.outputs['Distance']
    def pointy(self): return self.geo.outputs['Pointiness']
    def ao(self, dist=0.05, samples=8):
        # ambient occlusion: 1 in open air, falling toward 0 under an overlapping plate or in a crevice
        x = self.n('ShaderNodeAmbientOcclusion', samples=samples); x.inputs['Distance'].default_value = dist
        return x.outputs['AO']
    def bevel_edge(self, radius=0.005):
        # 0 on an open surface, rising toward any edge within radius, however dense the mesh is
        b = self.n('ShaderNodeBevel', samples=6); b.inputs['Radius'].default_value = radius
        d = self.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        L(self.nt, b.outputs['Normal'], d.inputs[0]); L(self.nt, self.geo.outputs['Normal'], d.inputs[1])
        return self.math('MULTIPLY', self.inv(d.outputs['Value']), 6.0)
    def normal_axis(self, axis):
        s = self.n('ShaderNodeSeparateXYZ'); L(self.nt, self.geo.outputs['Normal'], s.inputs['Vector'])
        return s.outputs[axis]
    def crater(self, scale, size=0.3, share=0.15):
        # sparse round dents: one in every few voronoi cells
        v = self.n('ShaderNodeTexVoronoi', feature='F1', i_Scale=scale); L(self.nt, self.co, v.inputs['Vector'])
        pick = self.band(v.outputs['Color'], 1 - share, 1 - share + 0.01)
        bowl = self.band(v.outputs['Distance'], size, 0.0)
        return self.mul(self.mul(bowl, bowl), pick)
    def lerp(self, fac, a, b):
        x = self.n('ShaderNodeMix', data_type='RGBA')
        self._in(x.inputs['Factor'], fac); self._in(x.inputs[6], a); self._in(x.inputs[7], b)
        return x.outputs[2]
    def lerpf(self, fac, a, b):
        x = self.n('ShaderNodeMix', data_type='FLOAT')
        self._in(x.inputs['Factor'], fac); self._in(x.inputs[2], a); self._in(x.inputs[3], b)
        return x.outputs[0]
    def tint(self, col, v, lo, hi):
        # col scaled by a value remapped to lo..hi: cheap colour variation
        k = self.lerpf(v, lo, hi)
        x = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=1.0)
        self._in(x.inputs[6], col); self._in(x.inputs[7], self._grey(k))
        return x.outputs[2]
    def _grey(self, k):
        c = self.n('ShaderNodeCombineColor')
        for i in range(3): L(self.nt, k, c.inputs[i])
        return c.outputs[0]
    def bump(self, h, strength, dist, invert=False):
        self.bumps.append((h, strength, dist, invert))
    def wear(self, lo=0.53, hi=0.6, breakup=0.5, scale=14.0):
        # bare-metal edge wear: the sharpest convex edges, broken up by noise so it is not a clean line
        e = self.band(self.pointy(), lo, hi)
        nz = self.band(self.noise(scale, 8.0, 0.6), 0.5 - breakup * 0.3, 0.5 + breakup * 0.1)
        return self.mul(e, nz)
    def cavity(self, lo=0.5, hi=0.44):
        return self.band(self.pointy(), lo, hi)
    def scratches(self, scale=9.0, density=0.5, width=0.012):
        # long thin scratches in two crossing directions, clustered in patches
        out = None
        for rot in ((0, 0, 0.4), (0.3, 1.2, -0.7), (1.1, 0.2, 2.0)):
            d = self.edges(scale, self.vec((1, 1, 0.12), rot))
            s = self.band(d, width, 0.0)
            out = s if out is None else self.mx(out, s)
        gate = self.band(self.noise(2.2, 4.0), 0.62 - density * 0.2, 0.72 - density * 0.2)
        return self.mul(out, gate)
    def finish(self, base, rough, metal=0.0, emit=None, emit_strength=1.0):
        P = self.P
        self._in(P.inputs['Base Color'], base); self._in(P.inputs['Roughness'], rough); self._in(P.inputs['Metallic'], metal)
        if emit is not None:
            self._in(P.inputs['Emission Color'], emit); P.inputs['Emission Strength'].default_value = emit_strength
        nrm = None
        for h, s, d, inv in self.bumps:
            b = self.n('ShaderNodeBump', i_Strength=s, i_Distance=d, invert=inv)
            L(self.nt, h, b.inputs['Height'])
            if nrm is not None: L(self.nt, nrm, b.inputs['Normal'])
            nrm = b.outputs['Normal']
        if nrm is not None: L(self.nt, nrm, P.inputs['Normal'])
        return self.m

# Where wear lands is read off the geometry at bake time, not scattered by noise:
#   edge     the bevel shader finds every edge within a few mm (convex or concave)
#   open     ambient occlusion: low under an overlapping lame, in a crevice, round a rivet's root
#   facing   the surface normal: upward faces gather dust, undersides run with rust, faces turned
#            toward the enemy (-Y) take the blows
# so struck edges are polished bright, the band past an overlapping lame's edge is rubbed smooth
# where the lame above slides on it, and filth packs into what is never cleaned.
def _masks(g):
    edge = g.bevel_edge(0.006)
    near = g.ao(0.014)
    occ = g.ao(0.06)
    m = {'edge': edge, 'near': near, 'occ': occ}
    m['convex'] = g.mul(g.band(edge, 0.025, 0.12), g.band(near, 0.8, 0.95))
    m['crevice'] = g.band(near, 0.78, 0.4)
    m['under'] = g.band(occ, 0.72, 0.35)
    m['rub'] = g.mul(g.band(occ, 0.5, 0.72), g.band(occ, 0.97, 0.86))
    m['up'] = g.band(g.normal_axis('Z'), 0.35, 0.85)
    m['down'] = g.band(g.normal_axis('Z'), -0.25, -0.75)
    m['front'] = g.band(g.normal_axis('Y'), -0.15, -0.75)
    return m

def mat_steel(name, base=(0.035, 0.034, 0.036), bare=(0.3, 0.29, 0.3), rough=0.34, engrave=None, paint=None, dents=1.0,
              wear=None, glow=None):
    """Forged plate, aged the way armour really ages: dark blued steel with faint tempering colours;
    edges polished bright and chipped where they are struck; the band past each overlapping lame
    rubbed smooth with fine scratches running the way it slides; scratches and dents concentrated
    on the faces that meet blows; grime and rust packed into crevices, under the lames and round the
    rivets, rust running down from them; dust on the upward faces.
    engrave: inlay colour of etched filigree (glow: that filigree smoulders this colour).
    paint: (colour, roughness) of a lacquer coat, chipped back to steel on the edges and the blows."""
    g = G(name)
    k = _masks(g)
    patches = g.noise(2.6, 4.0)
    smudge = g.noise(16.0, 6.0)
    col = g.tint(base, patches, 0.75, 1.3)
    temper = g.noise(1.3, 3.0, 0.5, None, 1.5)                      # heat and age: brown-gold and blue tempering
    col = g.lerp(g.mul(g.band(temper, 0.56, 0.78), 0.55), col, (0.055, 0.036, 0.018))
    col = g.lerp(g.mul(g.band(temper, 0.42, 0.24), 0.55), col, (0.016, 0.022, 0.045))
    r = g.add(rough - 0.12, g.mul(patches, 0.24))
    r = g.add(r, g.mul(g.add(smudge, -0.5), 0.14))
    metal = 1.0
    emit = None
    if engrave:
        wav = g.n('ShaderNodeTexWave', wave_type='RINGS', i_Scale=16.0, i_Distortion=6.0, i_Detail=3.0, i_Detail_Scale=1.2)
        L(g.nt, g.co, wav.inputs['Vector'])
        lines = g.band(wav.outputs['Fac'], 0.04, 0.0)
        en = g.mul(lines, g.mul(g.band(g.noise(3.0, 2.0), 0.52, 0.56), g.inv(k['edge'])))   # etched panels, clear of the edges
        col = g.lerp(g.mul(en, 0.75), col, engrave); r = g.lerpf(en, r, 0.6)
        g.bump(en, 0.6, 0.0025, invert=True)
        if glow:
            emit = g.lerp(g.mul(en, g.band(g.noise(2.0, 2.0), 0.4, 0.6)), (0, 0, 0), glow)
    front = g.add(0.3, k['front'])
    if paint:
        chips = g.mul(g.band(g.noise(26.0, 10.0, 0.7), 0.6, 0.64), front)       # flakes knocked off by blows
        edgechip = g.mul(g.band(k['edge'], 0.02, 0.07), g.band(g.noise(18.0, 6.0), 0.4, 0.5))
        worn = g.mx(g.mx(chips, edgechip), k['rub'])
        pm = g.inv(worn)
        col = g.lerp(pm, col, paint[0]); r = g.lerpf(pm, r, paint[1])
        metal = g.inv(pm)
        g.bump(pm, 0.3, 0.0015)
    w = g.mul(k['convex'], g.band(g.noise(14.0, 8.0, 0.6), 0.25, 0.55))       # struck and handled edges: polished bright
    col = g.lerp(w, col, bare); r = g.lerpf(w, r, 0.2)
    chip = g.mul(g.band(k['edge'], 0.02, 0.08), g.band(g.noise(32.0, 4.0, 0.5), 0.63, 0.67))   # bites out of the edge
    col = g.lerp(chip, col, tuple(c * 0.75 for c in bare)); r = g.lerpf(chip, r, 0.32)
    g.bump(chip, 0.6, 0.0016, invert=True)
    slide = g.band(g.edges(70.0, g.vec((1, 1, 0.03))), 0.03, 0.0)             # the rub band: fine scratches along the slide
    rub = g.mul(k['rub'], g.band(g.noise(8.0, 4.0), 0.3, 0.5))
    col = g.lerp(g.mul(rub, 0.6), col, bare); r = g.lerpf(rub, r, 0.18)
    col = g.lerp(g.mul(g.mul(rub, slide), 0.7), col, bare)
    g.bump(g.mul(rub, slide), 0.2, 0.0006, invert=True)
    if paint: metal = g.mx(metal, g.mx(w, rub))
    sc = g.mul(g.scratches(scale=18.0, density=0.2, width=0.005), front)       # scratches where blows land: they
    col = g.lerp(g.mul(sc, 0.16), col, bare); r = g.lerpf(g.mul(sc, 0.6), r, 0.22)   # catch the light more than they show
    g.bump(sc, 0.3, 0.0008, invert=True)
    g.bump(g.mul(g.crater(7.0, 0.32, 0.14), front), 0.55 * dents, 0.006, invert=True)   # dents
    g.bump(g.cells(38.0), 0.05 * dents, 0.004)                                 # hammer marks
    g.bump(g.noise(5.0, 3.0), 0.12 * dents, 0.01)                              # warping
    dust = g.mul(g.mul(k['up'], g.band(g.noise(22.0, 6.0), 0.45, 0.75)), 0.25)
    col = g.lerp(dust, col, (0.06, 0.052, 0.045)); r = g.lerpf(dust, r, 0.8)
    gr = g.mx(k['crevice'], g.mul(k['under'], 0.85))                           # grime: crevices, under lames
    col = g.lerp(g.mul(gr, 0.85), col, (0.01, 0.008, 0.006)); r = g.lerpf(gr, r, 0.85)
    run = g.band(g.noise(30.0, 4.0, 0.5, g.vec((1, 1, 0.07))), 0.58, 0.68)    # rust in them, running downward
    rust = g.mul(g.mx(gr, g.mul(g.band(g.ao(0.1), 0.92, 0.7), run)), g.band(g.noise(11.0, 6.0, 0.6), 0.42, 0.58))
    col = g.lerp(rust, col, (0.05, 0.017, 0.006)); r = g.lerpf(rust, r, 0.92)
    g.bump(rust, 0.25, 0.001)
    metal = g.lerpf(g.mx(rust, g.mul(gr, 0.5)), metal, 0.0)
    return g.finish(col, r, metal, emit=emit, emit_strength=1.0 if glow else 0.0)

def mat_leather(name, col=(0.03, 0.018, 0.012), rough=0.62, pale=(0.1, 0.066, 0.045)):
    # oiled leather: grain and pores, creases, cut edges burnished dark and glossy, paler and crazed
    # where it is stretched over plate and rivets, grime in the creases
    g = G(name)
    k = _masks(g)
    c = g.tint(col, g.noise(5.0, 6.0), 0.7, 1.35)
    grain = g.cells(160.0)
    pores = g.band(g.cells(340.0), 0.12, 0.0)
    crease = g.band(g.edges(24.0, g.vec((1, 1, 4))), 0.03, 0.0)
    c = g.lerp(g.mul(crease, 0.5), c, (0.006, 0.004, 0.003))
    burnish = g.band(k['edge'], 0.04, 0.18)
    c = g.lerp(g.mul(burnish, 0.7), c, (0.011, 0.006, 0.004))
    stretch = g.mul(g.band(g.pointy(), 0.5, 0.56), g.band(g.noise(9.0, 4.0), 0.35, 0.6))
    c = g.lerp(g.mul(stretch, 0.6), c, pale)   # pale where stretched (on a thin hanging panel, read as all of it: pass a darker pale)
    craze = g.mul(g.band(g.edges(80.0), 0.025, 0.0), stretch)
    c = g.lerp(g.mul(k['crevice'], 0.8), c, (0.004, 0.003, 0.002))
    r = g.add(rough - 0.1, g.mul(g.noise(9.0, 4.0), 0.25))
    r = g.lerpf(burnish, r, 0.36); r = g.lerpf(stretch, r, 0.48); r = g.lerpf(k['crevice'], r, 0.9)
    g.bump(grain, 0.25, 0.001); g.bump(pores, 0.15, 0.0006, invert=True)
    g.bump(crease, 0.35, 0.002, invert=True); g.bump(craze, 0.3, 0.0008, invert=True)
    return g.finish(c, r)

def mat_bone(name, col=(0.32, 0.27, 0.2), rough=0.55):
    # old bone: yellowed, stained brown in the cracks and hollows, fine cracks and pores
    g = G(name)
    c = g.tint(col, g.noise(6.0, 6.0), 0.55, 1.15)
    cav = g.band(g.ao(0.02), 0.85, 0.4)
    c = g.lerp(cav, c, (0.04, 0.025, 0.012))
    cracks = g.band(g.edges(14.0, None, 0.9), 0.012, 0.0)
    c = g.lerp(g.mul(cracks, 0.8), c, (0.03, 0.02, 0.01))
    tip = g.band(g.bevel_edge(0.006), 0.03, 0.12)                    # edges and points worn smooth and pale
    c = g.lerp(g.mul(tip, 0.5), c, tuple(x * 1.5 for x in col))
    r = g.add(rough - 0.1, g.mul(g.noise(20.0, 4.0), 0.2))
    r = g.lerpf(tip, r, rough - 0.2)
    g.bump(cracks, 0.4, 0.0015, invert=True); g.bump(g.cells(90.0), 0.12, 0.001)
    return g.finish(c, r)

def mat_horn2(name, root=(0.012, 0.009, 0.009), tip=(0.2, 0.05, 0.03), zmin=0.0, zmax=1.0, rough=0.4, bands=60.0, along=None):
    """Keratin horn. along: the name of a vector attribute (t, cos a, sin a) giving each point's place
    along the horn (t 0 root .. 1 tip) and round it, so growth rings run round it and cracks along it.
    Without it, height zmin..zmax stands in for t. Dark at the root, paling to the tip; ringed;
    striated; split by fine cracks along its grain; the tip worn smooth, glossy and chipped; grime
    packed between the rings."""
    g = G(name)
    if along:
        a = g.n('ShaderNodeAttribute', attribute_name=along)
        sep = g.n('ShaderNodeSeparateXYZ'); L(g.nt, a.outputs['Vector'], sep.inputs['Vector'])
        t, ca, sa = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
        def grain(kt, ka):   # coordinates on the horn's own surface: t along, the angle round it
            cmb = g.n('ShaderNodeCombineXYZ')
            L(g.nt, g.math('MULTIPLY', t, kt, clamp=False), cmb.inputs['X'])
            L(g.nt, g.math('MULTIPLY', ca, ka, clamp=False), cmb.inputs['Y'])
            L(g.nt, g.math('MULTIPLY', sa, ka, clamp=False), cmb.inputs['Z'])
            return cmb.outputs['Vector']
    else:
        sep = g.n('ShaderNodeSeparateXYZ'); L(g.nt, g.co, sep.inputs['Vector'])
        t = g.band(sep.outputs['Z'], zmin, zmax)
        grain = lambda kt, ka: g.vec((ka, ka, kt))
    c = g.lerp(g.math('POWER', t, 1.6), root, tip)
    c = g.tint(c, g.noise(2.5, 4.0, 0.5, grain(3.0, 1.5)), 0.7, 1.35)          # broad colour variation
    stri = g.noise(18.0, 8.0, 0.6, grain(1.0, 9.0))                             # striations along the grain
    c = g.tint(c, stri, 0.65, 1.35)
    ph = g.math('MULTIPLY', t, bands * math.tau, clamp=False)
    ring = g.band(g.math('SINE', ph, clamp=False), 0.2, 0.95)                   # growth rings, and finer ones between
    fine = g.band(g.math('SINE', g.math('MULTIPLY', ph, 3.7, clamp=False), clamp=False), 0.5, 1.0)
    c = g.lerp(g.mul(g.inv(ring), 0.45), c, tuple(x * 0.5 for x in root))
    cr = g.band(g.edges(5.0, grain(14.0, 2.0)), 0.035, 0.0)                     # cracks split along the grain
    cr = g.mul(cr, g.band(g.noise(3.0, 3.0, 0.5, grain(4.0, 1.0)), 0.48, 0.6))
    c = g.lerp(g.mul(cr, 0.9), c, (0.004, 0.003, 0.003))
    cav = g.band(g.ao(0.02), 0.85, 0.45)
    c = g.lerp(g.mul(cav, 0.7), c, (0.006, 0.004, 0.004))
    worn = g.band(t, 0.8, 0.97)                                                # the tip: worn smooth, pale, glossy
    w = g.mx(g.mul(worn, 0.8), g.wear(0.54, 0.62, 0.5, 12.0))
    c = g.lerp(w, c, (0.21, 0.15, 0.11))
    r = g.lerpf(t, rough + 0.15, rough - 0.12)
    r = g.add(r, g.mul(g.add(stri, -0.5), 0.2))
    r = g.lerpf(worn, r, rough - 0.2); r = g.lerpf(g.mx(cr, cav), r, 0.85)
    g.bump(ring, 0.35, 0.004); g.bump(fine, 0.12, 0.001); g.bump(stri, 0.3, 0.002)
    g.bump(cr, 0.5, 0.0015, invert=True)
    return g.finish(c, r)

def mat_fabric(name, zmin, zmax, stops, rough=0.86, sheen=0.4, weave=150.0, lining=None):
    # heavy wool twill: a diagonal weave, slubs and fuzz, faded on the folds, filthy and scorched toward
    # the frayed hem, dust in the creases
    g = G(name)
    sep = g.n('ShaderNodeSeparateXYZ'); L(g.nt, g.co, sep.inputs['Vector'])
    mr = g.n('ShaderNodeMapRange', i_From_Min=zmin, i_From_Max=zmax); L(g.nt, sep.outputs['Z'], mr.inputs['Value'])
    c = ramp(g.n, g.nt, mr.outputs['Result'], stops).outputs['Color']
    slub = g.noise(40.0, 4.0, 0.5, g.vec((1, 1, 0.15)))
    c = g.tint(c, slub, 0.75, 1.25)
    c = g.tint(c, g.noise(3.0, 5.0), 0.6, 1.3)
    hem = g.band(mr.outputs['Result'], 0.25, 0.0)
    filth = g.mul(hem, g.band(g.noise(6.0, 8.0), 0.35, 0.6))
    c = g.lerp(filth, c, (0.01, 0.008, 0.006))
    fold = g.band(g.pointy(), 0.52, 0.58)
    c = g.lerp(g.mul(fold, 0.35), c, (0.14, 0.11, 0.1))
    c = g.lerp(g.mul(g.band(g.ao(0.04), 0.8, 0.4), 0.7), c, (0.006, 0.005, 0.005))
    tw = g.n('ShaderNodeTexWave', i_Scale=weave, wave_profile='SAW', bands_direction='DIAGONAL'); L(g.nt, g.co, tw.inputs['Vector'])
    w2 = g.n('ShaderNodeTexWave', i_Scale=weave * 1.6, wave_profile='SIN', bands_direction='Z'); L(g.nt, g.co, w2.inputs['Vector'])
    c = g.tint(c, tw.outputs['Fac'], 0.82, 1.12)
    fuzz = g.noise(260.0, 2.0)
    r = g.add(rough - 0.06, g.mul(slub, 0.1))
    g.P.inputs['Sheen Weight'].default_value = sheen
    g.bump(tw.outputs['Fac'], 0.22, 0.0008); g.bump(w2.outputs['Fac'], 0.1, 0.0006); g.bump(slub, 0.2, 0.002); g.bump(fuzz, 0.08, 0.0004)
    return g.finish(c, r)

def mat_membrane(name, dark=(0.02, 0.006, 0.008), light=(0.14, 0.02, 0.018), vein=(0.06, 0.008, 0.008), rough=0.55, along=None):
    """A wing membrane: thin, leathery and wrinkled, a web of raised veins, darker and thicker where it
    wraps the bones, paler, rough and cracked where it has dried out toward the torn trailing edge,
    old scars healed glossy and puckered. along: a vector attribute (hem, bone, 0): 1 at the trailing
    edge and 1 against a bone, falling to 0 away from them."""
    g = G(name)
    if along:
        a = g.n('ShaderNodeAttribute', attribute_name=along)
        sep = g.n('ShaderNodeSeparateXYZ'); L(g.nt, a.outputs['Vector'], sep.inputs['Vector'])
        hem, bone = sep.outputs['X'], sep.outputs['Y']
    else:
        hem, bone = 0.0, 0.0
    mott = g.noise(4.0, 6.0)
    c = g.lerp(mott, dark, light)
    wr = g.noise(26.0, 6.0, 0.6, g.vec((1, 0.15, 1), (0, 0, 0.6)))
    c = g.tint(c, wr, 0.6, 1.3)
    small = g.band(g.edges(16.0), 0.02, 0.0)
    big = g.band(g.edges(4.0, None, 0.8), 0.012, 0.0)
    c = g.lerp(g.mul(small, 0.5), c, (0.008, 0.003, 0.003))
    c = g.lerp(g.mul(big, 0.8), c, vein)
    c = g.lerp(g.mul(bone, 0.6), c, tuple(x * 0.4 for x in dark))
    dry = g.mul(hem, g.band(g.noise(6.0, 6.0), 0.3, 0.55))
    c = g.lerp(g.mul(dry, 0.8), c, (0.085, 0.055, 0.045))
    dcrack = g.mul(dry, g.band(g.edges(90.0), 0.03, 0.0))
    scar = g.band(g.noise(3.2, 3.0, 0.5, None, 2.0), 0.7, 0.74)
    c = g.lerp(g.mul(scar, 0.7), c, (0.13, 0.06, 0.05))
    r = g.add(rough - 0.1, g.mul(wr, 0.25))
    r = g.lerpf(dry, r, 0.88); r = g.lerpf(scar, r, 0.32)
    g.bump(wr, 0.35, 0.003); g.bump(small, 0.4, 0.0015); g.bump(big, 0.7, 0.003)
    g.bump(dcrack, 0.4, 0.0008, invert=True); g.bump(g.mul(scar, g.noise(70.0, 3.0)), 0.5, 0.0015)
    return g.finish(c, r)

def mat_mail(name, base=(0.05, 0.048, 0.05), ring=0.02, rough=0.38):
    """Riveted mail: interlocked rings in rows, each grid staggered half a ring, projected from the
    side the surface faces. Bright on the crowns of the rings, black in the gaps, rust in them."""
    g = G(name)
    f = 1.0 / ring
    def lattice(ax, ay):
        sep = g.n('ShaderNodeSeparateXYZ'); L(g.nt, g.co, sep.inputs['Vector'])
        out = None
        for off in (0.0, 0.5):
            cmb = g.n('ShaderNodeCombineXYZ')
            L(g.nt, g.math('ADD', g.math('MULTIPLY', sep.outputs[ax], f, clamp=False), off, clamp=False), cmb.inputs['X'])
            L(g.nt, g.math('ADD', g.math('MULTIPLY', sep.outputs[ay], f * 1.15, clamp=False), off, clamp=False), cmb.inputs['Y'])
            fr = g.n('ShaderNodeVectorMath', operation='FRACTION'); L(g.nt, cmb.outputs['Vector'], fr.inputs[0])
            sub = g.n('ShaderNodeVectorMath', operation='SUBTRACT'); L(g.nt, fr.outputs['Vector'], sub.inputs[0]); sub.inputs[1].default_value = (0.5, 0.5, 0.0)
            ln = g.n('ShaderNodeVectorMath', operation='LENGTH'); L(g.nt, sub.outputs['Vector'], ln.inputs[0])
            d = g.math('ABSOLUTE', g.math('SUBTRACT', ln.outputs['Value'], 0.36, clamp=False), clamp=False)
            rg = g.band(d, 0.13, 0.03)
            out = rg if out is None else g.mx(out, rg)
        return out
    side = g.band(g.math('ABSOLUTE', g.normal_axis('X'), clamp=False), 0.45, 0.7)
    rings = g.lerpf(side, lattice('X', 'Z'), lattice('Y', 'Z'))
    c = g.lerp(rings, (0.004, 0.004, 0.004), base)
    c = g.tint(c, g.noise(4.0, 4.0), 0.6, 1.5)
    rust = g.mul(g.inv(rings), g.band(g.noise(9.0, 6.0), 0.45, 0.62))
    c = g.lerp(rust, c, (0.04, 0.014, 0.005))
    c = g.lerp(g.mul(g.band(g.ao(0.04), 0.85, 0.4), 0.8), c, (0.004, 0.003, 0.003))
    r = g.lerpf(rings, 0.9, rough)
    metal = g.lerpf(rust, rings, 0.0)
    g.bump(rings, 0.8, 0.003)
    return g.finish(c, r, metal)


# ── weights: distance to bone segments, restricted to the bones a part may follow ──
def smooth_weights(co, allowed, segs, mid=0.08):
    side = 'L' if co.x > 0 else 'R'
    cands = []
    for b, (a, t) in segs.items():
        if allowed is None:
            if b not in HUMAN: continue
            if b[-2:] in ('.L', '.R') and (b[-1] != side or abs(co.x) < mid): continue
        elif b not in allowed:
            continue
        d = max((co - a.lerp(t, seg_t(co, a, t))).length, 0.02)
        cands.append((1.0 / d ** 5, b))
    cands.sort(reverse=True)
    cands = cands[:3]
    s = sum(w for w, _ in cands)
    return [(b, w / s) for w, b in cands if w / s > 0.02]

def assign_weights(ob, rule, segs, mid):
    kind, arg = rule
    groups = {}
    def vg(name):
        if name not in groups: groups[name] = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        return groups[name]
    if kind == 'rigid':
        vg(arg).add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')
        return
    for v in ob.data.vertices:
        for b, w in smooth_weights(v.co, arg, segs, mid):
            vg(b).add([v.index], w, 'REPLACE')

def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

# ── the standard clips, in figure space (X bends forward, Y tips sideways, Z turns) ──
TAU = math.tau
def ease(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

def idle_pose(t, T=4.0, k=1.0):
    s = math.sin(TAU * t / T); c = math.cos(TAU * t / T); s2 = math.sin(2 * TAU * t / T)
    return {
        'spine': (k * (0.03 + 0.02 * s), 0, 0.02 * c * k), 'chest': (0.04 * s * k, 0.01 * c, 0.02 * c * k), 'neck': (-0.02 * s, 0, 0),
        'head': (0.06 + 0.03 * s2, 0.02 * c, 0.1 * s * k),
        'upperarm.L': (0.05 * s, -0.06 - 0.04 * s, 0), 'upperarm.R': (0.05 * s, 0.06 + 0.04 * s, 0),
        'forearm.L': (-0.12 - 0.04 * s, 0, 0), 'forearm.R': (-0.12 - 0.04 * s, 0, 0),
        'hand.L': (-0.1, 0, 0), 'hand.R': (-0.1, 0, 0),
        'thigh.L': (-0.06, 0, 0), 'thigh.R': (-0.06, 0, 0), 'shin.L': (0.1, 0, 0), 'shin.R': (0.1, 0, 0), 'foot.L': (-0.04, 0, 0), 'foot.R': (-0.04, 0, 0),
    }

def roar_pose(t, idle=idle_pose):
    a = ease(t / 0.6) * (1 - ease((t - 0.6) / 0.35))
    b = ease((t - 0.6) / 0.35) * (1 - ease((t - 2.3) / 0.7))
    tr = math.sin(t * 60) * 0.015 * b
    base = idle(t)
    out = {k: tuple(v * (1 - max(a, b)) for v in base[k]) for k in base}
    def add(k, x=0, y=0, z=0):
        p = out.get(k, (0, 0, 0)); out[k] = (p[0] + x, p[1] + y, p[2] + z)
    add('spine', 0.2 * a - 0.18 * b + tr); add('chest', 0.18 * a - 0.24 * b); add('neck', 0.1 * a - 0.2 * b)
    add('head', 0.25 * a - 0.45 * b + tr)
    add('upperarm.L', 0.2 * a - 0.55 * b, 0.15 * a - 0.6 * b); add('upperarm.R', 0.2 * a - 0.55 * b, -0.15 * a + 0.6 * b)
    add('forearm.L', -0.5 * a - 0.7 * b, 0, 0.3 * b); add('forearm.R', -0.5 * a - 0.7 * b, 0, -0.3 * b)
    add('hand.L', -0.3 * a + 0.3 * b); add('hand.R', -0.3 * a + 0.3 * b)
    add('thigh.L', -0.25 * a - 0.08 * b); add('thigh.R', -0.25 * a - 0.08 * b); add('shin.L', 0.45 * a + 0.12 * b); add('shin.R', 0.45 * a + 0.12 * b)
    add('foot.L', -0.2 * a); add('foot.R', -0.2 * a)
    out['_a'], out['_b'] = a, b
    return out

# ── finish: materials baked to one atlas, low-poly copies, the rig, the clips, the export ──
def layout_uvs(ob, margin=0.0012, hidden=0.0004, gap=0.025):
    """Share the atlas out by how much each part will be seen. Parts arrive unwrapped one by one
    (each face tagged 'pid'); they are first brought to one texel density. Each face carries a
    'uvw' weight (the part's importance), and a face that faces straight into another surface
    within `gap` (body under armour, the inside of a plate against the body) is never seen, so it
    gets `hidden` of that and shrinks to a speck. Islands are scaled by the square root of their
    weight, so their pixel area goes with it, then packed tight round their real outlines."""
    me = ob.data
    w = np.ones(len(me.polygons), np.float32)
    if 'uvw' in me.attributes:
        me.attributes['uvw'].data.foreach_get('value', w)
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    for p in me.polygons:
        c, nrm = p.center, p.normal
        hit = tree.ray_cast(c + nrm * 0.002, nrm, gap)
        if hit[0] is not None:
            w[p.index] *= hidden
    pid = np.zeros(len(me.polygons), np.int32)
    if 'pid' in me.attributes:
        me.attributes['pid'].data.foreach_get('value', pid)
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    # each part was unwrapped on its own: bring them all to the same texel density first
    a3, a2 = {}, {}
    for f in bm.faces:
        q = [l[uv].uv for l in f.loops]
        ua = abs(sum(q[i].x * q[(i + 1) % len(q)].y - q[(i + 1) % len(q)].x * q[i].y for i in range(len(q)))) / 2
        a3[pid[f.index]] = a3.get(pid[f.index], 0.0) + f.calc_area(); a2[pid[f.index]] = a2.get(pid[f.index], 0.0) + ua
    dens = {k: math.sqrt(a3[k] / a2[k]) if a2[k] > 1e-12 else 1.0 for k in a3}
    parent = list(range(len(bm.faces)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for e in bm.edges:
        ll = e.link_loops
        if len(ll) != 2: continue
        l1, l2 = ll
        if pid[l1.face.index] == pid[l2.face.index] and (l1[uv].uv - l2.link_loop_next[uv].uv).length < 1e-6 and (l1.link_loop_next[uv].uv - l2[uv].uv).length < 1e-6:
            a, b = find(l1.face.index), find(l2.face.index)
            if a != b: parent[a] = b
    isl = {}
    for f in bm.faces:
        isl.setdefault(find(f.index), []).append(f)
    if os.environ.get('UV_PNG'):
        sz = np.array([len(v) for v in isl.values()])
        print('island sizes: 1 face', (sz == 1).sum(), '2', (sz == 2).sum(), '3-9', ((sz >= 3) & (sz < 10)).sum(), '10+', (sz >= 10).sum(), flush=True)
        wv = {}
        for fs in isl.values():
            if len(fs) <= 2: wv[round(float(w[fs[0].index]), 2)] = wv.get(round(float(w[fs[0].index]), 2), 0) + 1
        print('tiny islands by weight', wv, flush=True)
    for fs in isl.values():
        area = sum(f.calc_area() for f in fs) or 1e-9
        # smart project already sizes islands by their 3D area: scale that by the weight
        k = math.sqrt(max(sum(f.calc_area() * w[f.index] for f in fs) / area, 0.0004)) * dens[pid[fs[0].index]]
        loops = [l for f in fs for l in f.loops]
        c = sum((l[uv].uv for l in loops), Vector((0, 0))) / len(loops)
        for l in loops:
            l[uv].uv = c + (l[uv].uv - c) * k
    bm.to_mesh(me); bm.free()
    activate(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    scene().tool_settings.use_uv_select_sync = True   # pack every island (UV selection follows the mesh's)
    r = bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=margin, shape_method=os.environ.get('UV_SHAPE', 'CONCAVE'))
    bpy.ops.object.mode_set(mode='OBJECT')
    uvs = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uvs); uvs = uvs.reshape(-1, 2)
    st = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', st)
    used = 0.0
    for p in me.polygons:
        q = uvs[p.loop_start:p.loop_start + p.loop_total]
        used += abs(np.dot(q[:, 0], np.roll(q[:, 1], -1)) - np.dot(q[:, 1], np.roll(q[:, 0], -1))) / 2
    if os.environ.get('UV_PNG'):
        st = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', st)
        tot = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_total', tot)
        cen = np.zeros(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('center', cen)
        ar = np.zeros(len(me.polygons), np.float32); me.polygons.foreach_get('area', ar)
        np.savez(os.environ['UV_PNG'], uv=uvs, start=st, total=tot, w=w, cen=cen.reshape(-1, 3), area=ar)
    print(f'uv: {len(isl)} islands ({r}), {used:.0%} of the atlas used, {int((w < 0.5).sum())} faces hidden', flush=True)

def finish(name, out, J, bones, parts, glow, part_info, mats, flat, tri_target, glow_rgb,
           idle=idle_pose, roar=roar_pose, mid=0.08, emit_strength=3.0, glow_strength=6.0, clips=(),
           uv_weight=lambda name: 1.0, split=()):
    """uv_weight(part) -> how much texture a part deserves (1 = its fair share by area).
    split: material keys that get their own copy of the baked material in the export, named
    <name>_<key>, so the runtime can treat them differently (the wing membranes' translucency)."""
    sc = scene()
    groups = list(mats)
    segs = {b: (J[h], J[t]) for b, h, t, _ in bones}
    highs, lows = {}, []
    for pname in [k for k, v in parts.items() if v is None]:
        print('part came out empty, skipped:', pname, flush=True)
    for pname, hi in [(k, v) for k, v in parts.items() if v is not None]:
        key, rule = part_info(pname)
        hi.data.materials.clear(); hi.data.materials.append(mats[key])
        lo = hi.copy(); lo.data = hi.data.copy(); lo.name = pname + '_low'; link(lo)
        # unwrap before decimating: the full mesh splits into clean islands, the decimated one into slivers
        activate(lo); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        tris = tri_count(hi)
        tgt = tri_target(pname, tris)
        if tris > tgt:
            d = lo.modifiers.new('dec', 'DECIMATE'); d.ratio = tgt / tris
            apply_mods(lo)
            sharp(lo, 40)   # decimation smears the hard edges' normals: break them again
        lo.data.materials.clear()
        for g in groups:
            lo.data.materials.append(bpy.data.materials.get('slot_' + g) or bpy.data.materials.new('slot_' + g))
        gi = groups.index(key)
        for p in lo.data.polygons: p.material_index = gi
        uw = lo.data.attributes.get('uvw') or lo.data.attributes.new('uvw', 'FLOAT', 'FACE')
        uw.data.foreach_set('value', np.full(len(lo.data.polygons), uv_weight(pname), np.float32))
        pid = lo.data.attributes.get('pid') or lo.data.attributes.new('pid', 'INT', 'FACE')
        pid.data.foreach_set('value', np.full(len(lo.data.polygons), len(lows), np.int32))
        assign_weights(lo, rule, segs, mid)
        highs.setdefault(key, []).append(hi)
        if hi.get('detail'):   # bake-only detail (rivets and the like): high mesh only, same material
            d = bpy.data.objects[hi['detail']]
            d.data.materials.clear(); d.data.materials.append(mats[key])
            highs[key].append(d)
        lows.append(lo)

    boss = join(lows, 'boss')
    boss.data.validate(clean_customdata=False)   # drop any degenerate faces the plate cuts left behind
    bm = bmesh.new(); bm.from_mesh(boss.data)   # and zero-area slivers: invisible, but each one wrecks the UV layout
    dead = [f for f in bm.faces if f.calc_area() < 2e-8]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(boss.data); bm.free()
    print('slivers removed:', len(dead), flush=True)
    print('triangles (body mesh):', tri_count(boss), flush=True)
    layout_uvs(boss)
    if os.environ.get('UV_ONLY'):
        return

    def make_img(iname, size, data=True):
        im = bpy.data.images.new(iname, size, size, alpha=False)
        if data: im.colorspace_settings.name = 'Non-Color'
        return im

    if BAKE:
        sc.render.engine = 'CYCLES'
        sc.cycles.device = 'CPU'
        sc.cycles.samples = 4
        sc.render.bake.margin = 6
        IM = {'base': make_img('boss_base', TEX, data=False), 'normal': make_img('boss_normal', TEX), 'rough': make_img('boss_rough', TEX),
              'metal': make_img('boss_metal', TEX), 'emit': make_img('boss_emit', TEX // 2, data=False), 'ao': make_img('boss_ao', TEX)}
        IM['normal'].generated_color = (0.5, 0.5, 1, 1)
        activate(boss)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='MATERIAL')
        bpy.ops.object.mode_set(mode='OBJECT')
        pieces = [o for o in bpy.context.selected_objects]
        bake_mat = bpy.data.materials.new('bake'); bake_mat.use_nodes = True
        img_node = bake_mat.node_tree.nodes.new('ShaderNodeTexImage')
        bake_mat.node_tree.nodes.active = img_node

        def route(m, sock):
            nt = m.node_tree; P = nt.nodes['Principled BSDF']; O = nt.nodes['Material Output']
            E = nt.nodes.new('ShaderNodeEmission'); E.name = '_route'
            src = P.inputs[sock]
            if src.is_linked:
                nt.links.new(src.links[0].from_socket, E.inputs['Color'])
            elif sock == 'Emission Color' and P.inputs['Emission Strength'].default_value == 0:
                E.inputs['Color'].default_value = (0, 0, 0, 1)
            else:
                v = src.default_value
                E.inputs['Color'].default_value = tuple(v) if hasattr(v, '__len__') else (v, v, v, 1)
            nt.links.new(E.outputs['Emission'], O.inputs['Surface'])
        def unroute(m):
            nt = m.node_tree; P = nt.nodes['Principled BSDF']; O = nt.nodes['Material Output']
            nt.nodes.remove(nt.nodes['_route'])
            nt.links.new(P.outputs['BSDF'], O.inputs['Surface'])

        CH = [('base', 'Base Color'), ('rough', 'Roughness'), ('metal', 'Metallic'), ('emit', 'Emission Color'), ('normal', None)]
        for piece in pieces:
            key = piece.data.materials[piece.data.polygons[0].material_index].name[len('slot_'):]
            piece.data.materials.clear(); piece.data.materials.append(bake_mat)
            src = highs[key]
            for ch, sock in CH:
                img_node.image = IM[ch]
                activate(piece)
                for h in src: h.select_set(True)
                if sock:
                    route(mats[key], sock)
                    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, use_clear=False, margin=2)
                    unroute(mats[key])
                else:
                    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, use_clear=False, margin=2)
            print('baked', key, flush=True)
            if key in split:   # its own slot, so it exports as its own material
                sm_ = bake_mat.copy(); sm_.name = 'split_' + key
                piece.data.materials.clear(); piece.data.materials.append(sm_)
        boss = join(pieces, 'boss')
        for hs in highs.values():
            for h in hs: h.hide_render = True
        sc.cycles.samples = 48
        img_node.image = IM['ao']
        for m_ in boss.data.materials:
            if m_.name.startswith('split_'): m_.node_tree.nodes.active.image = IM['ao']
        activate(boss)
        bpy.ops.object.bake(type='AO', use_clear=True, margin=6)
        print('baked ao', flush=True)

        def px(im): a = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(a); return a.reshape(-1, 4)
        ao, ro, me = px(IM['ao']), px(IM['rough']), px(IM['metal'])
        orm = make_img('boss_orm', TEX)
        orm.pixels.foreach_set(np.stack([ao[:, 0], ro[:, 0], me[:, 0], np.ones(len(ao))], 1).astype(np.float32).ravel())
        base = px(IM['base'])
        base[:, :3] *= (0.55 + 0.45 * ao[:, :1])
        IM['base'].pixels.foreach_set(base.ravel())
        tmp = os.path.join(os.path.dirname(os.path.abspath(out)), '.bake-' + name.lower())
        os.makedirs(tmp, exist_ok=True)
        for k, im in (('base', IM['base']), ('normal', IM['normal']), ('orm', orm), ('emit', IM['emit'])):
            im.filepath_raw = os.path.join(tmp, f'{k}.png'); im.file_format = 'PNG'; im.save()

        fm = bpy.data.materials.new(name); fm.use_nodes = True
        nt = fm.node_tree; P = nt.nodes['Principled BSDF']; n = nodes(nt)
        tb = n('ShaderNodeTexImage', image=IM['base']); L(nt, tb.outputs['Color'], P.inputs['Base Color'])
        tn = n('ShaderNodeTexImage', image=IM['normal']); nm = n('ShaderNodeNormalMap'); L(nt, tn.outputs['Color'], nm.inputs['Color']); L(nt, nm.outputs['Normal'], P.inputs['Normal'])
        to = n('ShaderNodeTexImage', image=orm); sp = n('ShaderNodeSeparateColor'); L(nt, to.outputs['Color'], sp.inputs['Color'])
        L(nt, sp.outputs['Green'], P.inputs['Roughness']); L(nt, sp.outputs['Blue'], P.inputs['Metallic'])
        te = n('ShaderNodeTexImage', image=IM['emit']); L(nt, te.outputs['Color'], P.inputs['Emission Color'])
        P.inputs['Emission Strength'].default_value = emit_strength
        grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        gn = nt.nodes.new('ShaderNodeGroup'); gn.node_tree = grp
        L(nt, sp.outputs['Red'], gn.inputs['Occlusion'])
        fm.use_backface_culling = True
        slots = [m.name for m in boss.data.materials]
        mi = np.zeros(len(boss.data.polygons), np.int32); boss.data.polygons.foreach_get('material_index', mi)
        out_mats = [fm]
        for sn in slots:
            if sn.startswith('split_'):
                cp = fm.copy(); cp.name = name + '_' + sn[len('split_'):]; out_mats.append(cp)
        remap = np.array([0 if not sn.startswith('split_') else 1 + [x for x in slots if x.startswith('split_')].index(sn) for sn in slots], np.int32)
        boss.data.materials.clear()
        for m_ in out_mats: boss.data.materials.append(m_)
        boss.data.polygons.foreach_set('material_index', remap[mi])
    else:
        for i, g in enumerate(groups):
            m = boss.data.materials[i]; m.use_nodes = True
            P = m.node_tree.nodes['Principled BSDF']; c = flat[g]
            P.inputs['Base Color'].default_value = (*c[:3], 1); P.inputs['Roughness'].default_value = c[3]; P.inputs['Metallic'].default_value = c[4]
    for hs in highs.values():
        for h in hs: bpy.data.objects.remove(h)
    smooth_shade(boss)

    # glow: the eyes and cores, tagged so the raid can recolour them
    gm = bpy.data.materials.new(name + 'Glow'); gm.use_nodes = True; gm.use_backface_culling = True
    P = gm.node_tree.nodes['Principled BSDF']
    P.inputs['Base Color'].default_value = (*glow_rgb, 1)
    P.inputs['Emission Color'].default_value = (*glow_rgb, 1)
    P.inputs['Emission Strength'].default_value = glow_strength
    for gname, (ob, bone) in glow.items():
        ob.data.materials.clear(); ob.data.materials.append(gm)
        ob['eye'] = True

    # the rig
    arm = bpy.data.armatures.new('rig'); rig = link(bpy.data.objects.new('rig', arm))
    activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for b, h, t, par in bones:
        e = arm.edit_bones.new(b); e.head = J[h]; e.tail = J[t]
        if par: e.parent = eb[par]; e.use_connect = False
        eb[b] = e
    bpy.ops.object.mode_set(mode='OBJECT')
    boss.parent = rig
    md = boss.modifiers.new('rig', 'ARMATURE'); md.object = rig
    bpy.context.view_layer.update()
    for gname, (ob, bone) in glow.items():
        mw = ob.matrix_world.copy()
        ob.parent = rig; ob.parent_type = 'BONE'; ob.parent_bone = bone
        bpy.context.view_layer.update()
        ob.matrix_world = mw

    FPS = 30
    sc.render.fps = FPS
    def local_q(pb, ex, ey, ez):
        R = pb.bone.matrix_local.to_quaternion()
        q = Matrix.Rotation(ez, 4, 'Z').to_quaternion() @ Matrix.Rotation(ey, 4, 'Y').to_quaternion() @ Matrix.Rotation(ex, 4, 'X').to_quaternion()
        return R.inverted() @ q @ R
    def key_action(aname, frames, pose_at):
        rig.animation_data_create()
        rig.animation_data.action = None
        for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
        for f in range(0, frames + 1, 2):
            pose = pose_at(f / FPS)
            for pb in rig.pose.bones:
                pb.rotation_quaternion = local_q(pb, *pose.get(pb.name, (0, 0, 0)))
                pb.keyframe_insert('rotation_quaternion', frame=f)
            hp = rig.pose.bones['hips']
            hp.location = V(pose.get('_hips_loc', (0, 0, 0)))
            hp.keyframe_insert('location', frame=f)
        act = rig.animation_data.action
        act.name = aname; act.use_fake_user = True
        tr = rig.animation_data.nla_tracks.new(); tr.name = aname
        tr.strips.new(aname, 0, act)
        rig.animation_data.action = None
    key_action('Idle', 120, idle)
    key_action('Roar', 90, roar)
    for cname, frames, fn in clips:   # each boss's own attack, showing off its strength
        key_action(cname, frames, fn)

    keep = (rig, boss, *(ob for ob, _ in glow.values()))
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_yup=True, export_apply=False, export_extras=True,
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_image_format='JPEG', export_jpeg_quality=86, export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6, export_materials='EXPORT')
    print('exported', out, os.path.getsize(out), 'bytes; triangles', tri_count(boss) + sum(tri_count(ob) for ob, _ in glow.values()), flush=True)
