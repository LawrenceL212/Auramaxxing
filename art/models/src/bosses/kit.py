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
        ob.data.skin_vertices[0].data[0].use_root = True
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

def cloth(name, nx, nz, point, thick=0.02, sub=1, torn=None):
    # a cloth panel from point(u in [-1,1], t in [0,1]) -> (x, y, z); torn(u, t) lifts the hem
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
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
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

def mat_metal(name, base, edge, rough=0.32, engrave=None, rust=None):
    # worn metal: bright edges where the surface turns sharply, grime, optional inlaid filigree or rust
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
def finish(name, out, J, bones, parts, glow, part_info, mats, flat, tri_target, glow_rgb,
           idle=idle_pose, roar=roar_pose, mid=0.08, emit_strength=3.0, glow_strength=6.0):
    sc = scene()
    groups = list(mats)
    segs = {b: (J[h], J[t]) for b, h, t, _ in bones}
    highs, lows = {}, []
    for pname, hi in parts.items():
        key, rule = part_info(pname)
        hi.data.materials.clear(); hi.data.materials.append(mats[key])
        lo = hi.copy(); lo.data = hi.data.copy(); lo.name = pname + '_low'; link(lo)
        tris = tri_count(hi)
        tgt = tri_target(pname, tris)
        if tris > tgt:
            d = lo.modifiers.new('dec', 'DECIMATE'); d.ratio = tgt / tris
            apply_mods(lo)
        lo.data.materials.clear()
        for g in groups:
            lo.data.materials.append(bpy.data.materials.get('slot_' + g) or bpy.data.materials.new('slot_' + g))
        gi = groups.index(key)
        for p in lo.data.polygons: p.material_index = gi
        assign_weights(lo, rule, segs, mid)
        highs.setdefault(key, []).append(hi)
        lows.append(lo)

    boss = join(lows, 'boss')
    print('triangles (body mesh):', tri_count(boss), flush=True)
    activate(boss)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
    bpy.ops.object.mode_set(mode='OBJECT')

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
                    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, use_clear=False, margin=6)
                    unroute(mats[key])
                else:
                    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, use_clear=False, margin=6)
            print('baked', key, flush=True)
        boss = join(pieces, 'boss')
        for hs in highs.values():
            for h in hs: h.hide_render = True
        sc.cycles.samples = 48
        img_node.image = IM['ao']
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
        boss.data.materials.clear(); boss.data.materials.append(fm)
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
