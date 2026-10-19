# Builds the raid boss ("the Monarch") headless in Blender:
#   python3.11 build.py [--bake] [--out path.glb]
# Blender coords: Z up, the figure faces -Y (glTF +Z). Units are metres; ~3.4 m to the horn tips.
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix, Quaternion, noise

ARGS = sys.argv
BAKE = '--bake' in ARGS
OUT = ARGS[ARGS.index('--out') + 1] if '--out' in ARGS else os.path.join(os.path.dirname(__file__), 'boss.glb')
TEX = int(ARGS[ARGS.index('--tex') + 1]) if '--tex' in ARGS else 2048
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
V = Vector

def link(ob):
    scene.collection.objects.link(ob)
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

# ── the skeleton: one table drives the body, the armour and the rig ──
J = {
    'pelvis': V((0, 0.02, 1.22)), 'waist': V((0, 0.03, 1.48)), 'chest': V((0, 0.0, 1.86)), 'upchest': V((0, 0.02, 2.08)),
    'neck': V((0, -0.02, 2.26)), 'head': V((0, -0.06, 2.46)), 'crown': V((0, -0.04, 2.66)),
}
for s, n in ((1, 'L'), (-1, 'R')):
    J['shoulder.' + n] = V((s * 0.56, 0.04, 2.1))
    J['elbow.' + n] = V((s * 0.86, 0.1, 1.6))
    J['wrist.' + n] = V((s * 0.98, -0.06, 1.13))
    J['knuckle.' + n] = V((s * 1.02, -0.1, 0.93))
    J['hip.' + n] = V((s * 0.24, 0.02, 1.16))
    J['knee.' + n] = V((s * 0.33, -0.06, 0.64))
    J['ankle.' + n] = V((s * 0.36, 0.06, 0.13))
    J['toe.' + n] = V((s * 0.4, -0.28, 0.05))

BONES = [  # name, head joint, tail joint, parent
    ('hips', 'pelvis', 'waist', None), ('spine', 'waist', 'chest', 'hips'), ('chest', 'chest', 'upchest', 'spine'),
    ('neck', 'upchest', 'neck', 'chest'), ('head', 'neck', 'crown', 'neck'),
]
for n in ('L', 'R'):
    BONES += [
        ('upperarm.' + n, 'shoulder.' + n, 'elbow.' + n, 'chest'), ('forearm.' + n, 'elbow.' + n, 'wrist.' + n, 'upperarm.' + n),
        ('hand.' + n, 'wrist.' + n, 'knuckle.' + n, 'forearm.' + n), ('thigh.' + n, 'hip.' + n, 'knee.' + n, 'hips'),
        ('shin.' + n, 'knee.' + n, 'ankle.' + n, 'thigh.' + n), ('foot.' + n, 'ankle.' + n, 'toe.' + n, 'shin.' + n),
    ]

# ── body: a skin-modifier frame unioned with muscle masses and voxel-remeshed, like a base sculpt ──
def skin_body():
    pts, edges, radii = [], [], []
    def add(p, r, parent=None):
        pts.append(p); radii.append(r)
        if parent is not None:
            edges.append((parent, len(pts) - 1))
        return len(pts) - 1
    pel = add(J['pelvis'], (0.3, 0.24))
    wai = add(J['waist'], (0.27, 0.21), pel)
    che = add(J['chest'], (0.42, 0.3), wai)
    up = add(J['upchest'], (0.48, 0.3), che)
    nk = add(J['neck'], (0.17, 0.17), up)
    hd = add(J['head'], (0.17, 0.2), nk)
    add(J['head'] + V((0, -0.06, 0.12)), (0.14, 0.15), hd)
    for s, n in ((1, 'L'), (-1, 'R')):
        sh = add(J['shoulder.' + n], (0.22, 0.22), up)
        el = add(J['elbow.' + n], (0.15, 0.15), sh)
        wr = add(J['wrist.' + n], (0.12, 0.1), el)
        palm = add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.6), (0.11, 0.07), wr)
        # four clawed fingers, curled, and a thumb
        d = (J['knuckle.' + n] - J['wrist.' + n]).normalized()
        for i in range(4):
            off = V((s * 0.0, -0.075 + i * 0.05, 0))
            k1 = add(J['knuckle.' + n] + off, (0.032, 0.032), palm)
            k2 = add(J['knuckle.' + n] + off + d * 0.1 + V((0, -0.03, 0)), (0.026, 0.026), k1)
            add(J['knuckle.' + n] + off + d * 0.17 + V((-s * 0.0, -0.08, 0.01)), (0.012, 0.012), k2)
        t1 = add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.35) + V((-s * 0.06, -0.08, 0)), (0.035, 0.035), palm)
        add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.75) + V((-s * 0.08, -0.13, 0)), (0.02, 0.02), t1)
        hp = add(J['hip.' + n], (0.2, 0.2), pel)
        kn = add(J['knee.' + n], (0.15, 0.15), hp)
        an = add(J['ankle.' + n], (0.1, 0.1), kn)
        add(J['toe.' + n], (0.09, 0.05), an)
    me = bpy.data.meshes.new('skin')
    me.from_pydata([tuple(p) for p in pts], edges, [])
    ob = link(bpy.data.objects.new('skin', me))
    m = ob.modifiers.new('skin', 'SKIN')
    for i, r in enumerate(radii):
        ob.data.skin_vertices[0].data[i].radius = r
    ob.data.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
    apply_mods(ob)
    return ob

def blob(c, s, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1)
    ob = mesh_from_bm('blob', bm)
    ob.location = c; ob.scale = s; ob.rotation_euler = rot
    return ob

def muscles():
    out = []
    for s, n in ((1, 'L'), (-1, 'R')):
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        out.append(blob(sh + V((s * 0.04, 0.0, 0.03)), (0.26, 0.25, 0.22)))                      # deltoid
        out.append(blob(V((s * 0.22, -0.2, 1.93)), (0.24, 0.12, 0.17), (0.25, 0, s * 0.2)))      # pectoral
        out.append(blob(V((s * 0.2, 0.18, 2.16)), (0.24, 0.12, 0.12), (0, 0, s * -0.4)))          # trapezius
        out.append(blob(V((s * 0.22, 0.16, 1.78)), (0.2, 0.14, 0.3), (0, s * 0.2, 0)))           # lats
        out.append(blob(sh.lerp(el, 0.5) + V((0, -0.05, 0)), (0.15, 0.15, 0.24), (0.1, s * -0.5, 0)))  # biceps
        out.append(blob(el.lerp(wr, 0.3), (0.14, 0.14, 0.2), (0.3, s * -0.2, 0)))                 # forearm
        hp, kn, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        out.append(blob(hp.lerp(kn, 0.45) + V((s * 0.02, -0.04, 0)), (0.19, 0.19, 0.32)))         # quad
        out.append(blob(kn.lerp(an, 0.3) + V((0, 0.06, 0)), (0.12, 0.13, 0.2)))                   # calf
        out.append(blob(V((s * 0.13, 0.17, 1.14)), (0.18, 0.15, 0.16)))                           # glute
        for i in range(3):                                                                         # abdominals
            out.append(blob(V((s * 0.085, -0.19, 1.42 + i * 0.12)), (0.08, 0.06, 0.06)))
    out.append(blob(V((0, -0.11, 2.36)), (0.13, 0.13, 0.12)))                                     # jaw
    return out

def build_body():
    base = skin_body()
    body = join([base] + muscles(), 'body_high')
    r = body.modifiers.new('remesh', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.014; r.adaptivity = 0
    sm = body.modifiers.new('smooth', 'SMOOTH'); sm.iterations = 6; sm.factor = 0.8
    apply_mods(body)
    smooth_shade(body)
    return body

# ── armour: plates extracted from the body surface (as an artist would), then thickened ──
def extract(src, name, keep, push=0.035, thick=0.035, smooth=4):
    bm = bmesh.new(); bm.from_mesh(src.data)
    bm.normal_update()
    dead = [v for v in bm.verts if not keep(v.co)]
    bmesh.ops.delete(bm, geom=dead, context='VERTS')
    for v in bm.verts:
        v.co += v.normal * push
    ob = mesh_from_bm(name, bm)
    # plates are smoother than the flesh beneath: relax away the muscle detail, then thicken
    m = ob.modifiers.new('sm', 'SMOOTH'); m.iterations = smooth * 4; m.factor = 1.0
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = thick; so.offset = 1; so.use_rim = True
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = 0.006; bv.segments = 2; bv.limit_method = 'ANGLE'
    apply_mods(ob); smooth_shade(ob)
    return ob

def seg_t(p, a, b):
    ab = b - a
    return max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))

def near_seg(p, a, b, lo, hi, r=0.3):
    t = (p - a).dot(b - a) / (b - a).length_squared
    return lo <= t <= hi and (p - a.lerp(b, t)).length < r

def shell(name, c, s, rot=(0, 0, 0), cut=None, seg=(32, 16), thick=0.04):
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
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
    apply_mods(ob); smooth_shade(ob)
    return ob

def spike(name, base, tip, r, segs=8, curve=V((0, 0, 0))):
    # a tapered, slightly curved horn or spike from base to tip
    pts, edges, radii = [], [], []
    n = 7
    for i in range(n):
        t = i / (n - 1)
        p = base.lerp(tip, t) + curve * math.sin(t * math.pi) * 1.0
        pts.append(p); radii.append(max(0.004, r * (1 - t) ** 1.1))
        if i: edges.append((i - 1, i))
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in pts], edges, [])
    ob = link(bpy.data.objects.new(name, me))
    ob.modifiers.new('skin', 'SKIN')
    for i, rr in enumerate(radii):
        ob.data.skin_vertices[0].data[i].radius = (rr, rr)
    ob.data.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
    apply_mods(ob); smooth_shade(ob)
    return ob

def horn(name, s):
    # a great horn sweeping out from the helm, back, then up and forward at the tip
    path = [V((s * 0.16, -0.02, 2.62)), V((s * 0.32, 0.02, 2.72)), V((s * 0.5, 0.1, 2.8)), V((s * 0.62, 0.22, 2.96)),
            V((s * 0.66, 0.26, 3.16)), V((s * 0.62, 0.2, 3.34)), V((s * 0.54, 0.08, 3.44))]
    radii = [0.085, 0.078, 0.066, 0.052, 0.038, 0.022, 0.006]
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in path], [(i, i + 1) for i in range(len(path) - 1)], [])
    ob = link(bpy.data.objects.new(name, me))
    ob.modifiers.new('skin', 'SKIN')
    for i, rr in enumerate(radii):
        ob.data.skin_vertices[0].data[i].radius = (rr, rr * 1.15)
    ob.data.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 3
    apply_mods(ob); smooth_shade(ob)
    return ob

def build_armour(body):
    P = {}
    # cuirass: the torso from the belt to the collar, inside the arms
    P['cuirass'] = extract(body, 'cuirass', lambda p: 1.42 < p.z < 2.2 and abs(p.x) < 0.43 - max(0, p.z - 2.0) * 0.6, push=0.04, thick=0.04)
    P['belt'] = extract(body, 'belt', lambda p: 1.2 < p.z < 1.4 and abs(p.x) < 0.5, push=0.07, thick=0.05)
    P['gorget'] = extract(body, 'gorget', lambda p: 2.15 < p.z < 2.31 and abs(p.x) < 0.24, push=0.05, thick=0.03)
    # helm: the whole head, thickened; the visor slit is cut by the glow pieces sitting on it
    P['helm'] = extract(body, 'helm', lambda p: p.z > 2.3 and abs(p.x) < 0.3, push=0.045, thick=0.04, smooth=8)
    for s, n in ((1, 'L'), (-1, 'R')):
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        hp, kn, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        P['vambrace.' + n] = extract(body, 'vambrace.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.5 and near_seg(p, el, wr, 0.3, 0.98), push=0.035, thick=0.03)
        P['cuisse.' + n] = extract(body, 'cuisse.' + n, lambda p, hp=hp, kn=kn, s=s: s * p.x > 0.06 and near_seg(p, hp, kn, 0.15, 0.85) and p.z < 1.12, push=0.035)
        P['greave.' + n] = extract(body, 'greave.' + n, lambda p, kn=kn, an=an, s=s: s * p.x > 0.1 and near_seg(p, kn, an, 0.15, 1.1) and p.z > 0.05, push=0.035)
        # pauldron: three overlapping lames, the top one spiked
        out = V((s * 0.62, 0.04, 2.18))
        for i, (rz, sc) in enumerate(((0, 1.0), (0.18, 0.92), (0.36, 0.84))):
            P[f'pauldron{i}.' + n] = shell(f'pauldron{i}.' + n, out + V((s * 0.07 * i, 0, -0.1 * i)), (0.36 * sc, 0.34 * sc, 0.22 * sc),
                                       rot=(0, s * (0.35 + rz), 0), cut=lambda c: c.z > -0.2)
        for k in range(3):
            P[f'pspike{k}.' + n] = spike(f'pspike{k}.' + n, out + V((s * (0.06 + k * 0.09), -0.12 + k * 0.12, 0.17 - k * 0.04)),
                                         out + V((s * (0.14 + k * 0.12), -0.14 + k * 0.16, 0.5 - k * 0.07)), 0.05 - k * 0.008)
        # knee cop and elbow spike
        P['kneecop.' + n] = shell('kneecop.' + n, kn + V((0, -0.14, 0.02)), (0.13, 0.08, 0.14), cut=lambda c: c.y < 0.3)
        P['kspike.' + n] = spike('kspike.' + n, kn + V((0, -0.2, 0.04)), kn + V((0, -0.4, 0.14)), 0.04)
        P['espike.' + n] = spike('espike.' + n, el + V((0, 0.12, 0)), el + V((s * 0.05, 0.42, 0.02)), 0.045)
        P['horn.' + n] = horn('horn.' + n, s)
    # helm detail: cheek guards sweeping down to a point either side of the eye slit
    hc = J['head']
    for s in (1, -1):
        P['cheek.' + ('L' if s > 0 else 'R')] = spike('cheek' + str(s), V((s * 0.19, -0.27, 2.46)), V((s * 0.06, -0.37, 2.24)), 0.055)
    # crown: a ring of blades around the helm
    for i in range(7):
        a = (i - 3) * 0.32
        r = 0.21
        base = V((math.sin(a) * r, -0.06 - math.cos(a) * r * 0.95, 2.6))
        tip = base + V((math.sin(a) * 0.05, -math.cos(a) * 0.04, 0.2 + (0.1 if i == 3 else 0) - abs(i - 3) * 0.02))
        P[f'crown{i}'] = spike(f'crown{i}', base, tip, 0.035)
    # tassets: plates hanging from the belt over the thighs, front and sides
    for i, ax in enumerate((-0.33, 0.33)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        ob = mesh_from_bm(f'tasset{i}', bm)
        ob.location = (ax, -0.3 + abs(ax) * 0.25, 1.06); ob.scale = (0.2, 0.035, 0.32); ob.rotation_euler = (-0.18, 0, -ax * 0.6)
        activate(ob); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = 0.012; bv.segments = 2
        sd = ob.modifiers.new('sd', 'SIMPLE_DEFORM'); sd.deform_method = 'BEND'; sd.angle = 0.5; sd.deform_axis = 'Z'
        apply_mods(ob); smooth_shade(ob)
        P[f'tasset{i}'] = ob
    # tabard: a hanging panel of the cloak's cloth down the front, between the side tassets
    nx, nz = 8, 14
    bm = bmesh.new(); rows = []
    for j in range(nz + 1):
        t = j / nz
        z = 1.3 - t * 0.66
        row = []
        for i in range(nx + 1):
            u = i / nx * 2 - 1
            x = u * (0.17 + t * 0.06)
            y = -0.27 - t * 0.06 + (u * u) * 0.08 + math.sin(u * 5) * 0.012 * t
            zz = z + (0.05 * max(0, noise.noise(V((u * 5, 2.2, 0.3))) + 0.3) if j == nz else 0)
            row.append(bm.verts.new((x, y, zz)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
    ob = mesh_from_bm('tabard', bm)
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = 0.02; so.offset = 1
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
    apply_mods(ob); smooth_shade(ob)
    P['tabard'] = ob
    return P

def build_cloak():
    # a heavy cape from the shoulders to the ankles, curved around the back, torn at the hem
    nx, nz = 28, 34
    bm = bmesh.new()
    rows = []
    for j in range(nz + 1):
        t = j / nz
        z = 2.18 - t * 2.06
        half = 0.62 + t * 0.55
        row = []
        for i in range(nx + 1):
            u = i / nx * 2 - 1
            a = u * (1.25 + t * 0.35)
            x = math.sin(a) * half * 0.85
            y = 0.18 + math.cos(a) * (0.12 + t * 0.32) + t * 0.12
            fold = math.sin(u * 9.0 + t * 2) * 0.035 * t + math.sin(u * 4.3) * 0.02 * t
            y += fold
            if j == nz or (j > nz * 0.82 and noise.noise(V((u * 6, t * 4, 1.7))) > 0.15 + (1 - t) * 1.5):
                z += 0.12 * max(0, noise.noise(V((u * 9, 3.1, 0.5))) + 0.4) * t
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    ob = mesh_from_bm('cloak', bm)
    so = ob.modifiers.new('solid', 'SOLIDIFY'); so.thickness = 0.025; so.offset = 1
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
    apply_mods(ob); smooth_shade(ob)
    return ob

def build_glow():
    # the eyes behind the visor and the rift in the chest: the parts the raid recolours
    g = {}
    for s, n in ((1, 'L'), (-1, 'R')):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1)
        ob = mesh_from_bm('eye.' + n, bm)
        ob.location = (s * 0.075, -0.3, 2.47); ob.scale = (0.055, 0.02, 0.018); ob.rotation_euler = (0, s * -0.25, s * -0.2)
        activate(ob); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); smooth_shade(ob)
        g['eye.' + n] = ob
    # chest rift: a jagged crack of light down the sternum
    pts = [V((0, -0.0, 2.08)), V((0.03, 0, 2.0)), V((-0.02, 0, 1.93)), V((0.025, 0, 1.85)), V((-0.01, 0, 1.76)), V((0.0, 0, 1.68))]
    me = bpy.data.meshes.new('rift'); me.from_pydata([tuple(p) for p in pts], [(i, i + 1) for i in range(len(pts) - 1)], [])
    ob = link(bpy.data.objects.new('rift', me))
    ob.modifiers.new('skin', 'SKIN')
    for i in range(len(pts)):
        w = 0.035 * math.sin((i + 0.5) / len(pts) * math.pi) + 0.006
        ob.data.skin_vertices[0].data[i].radius = (w, 0.012)
    ob.data.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
    apply_mods(ob); smooth_shade(ob)
    g['rift'] = ob
    return g

body = build_body()
armour = build_armour(body)
cloak = build_cloak()
glow = build_glow()

# the rift sits on the cuirass surface: push it forward until it clears the plate
def project_forward(ob, onto, gap=0.004):
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(onto, dg)
    for v in ob.data.vertices:
        hit = tree.ray_cast(V((v.co.x, -1.0, v.co.z)), V((0, 1, 0)))
        if hit[0] is not None:
            v.co.y = v.co.y + hit[0].y - gap
project_forward(glow['rift'], armour['cuirass'])
for n in ('L', 'R'):
    ob = glow['eye.' + n]
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(armour['helm'], bpy.context.evaluated_depsgraph_get())
    c = sum((v.co for v in ob.data.vertices), V()) / len(ob.data.vertices)
    hit = tree.ray_cast(V((c.x, -1.0, c.z)), V((0, 1, 0)))
    if hit[0] is not None:
        dy = hit[0].y - c.y - 0.006
        for v in ob.data.vertices:
            v.co.y += dy

# longer legs: stretch everything below the hips by a quarter, lift the rest to match
def warp(z):
    return z * 1.25 if z < 1.0 else z + 0.25
for ob in scene.objects:
    if ob.type == 'MESH':
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            w.z = warp(w.z)
            v.co = ob.matrix_world.inverted() @ w
for k in J:
    J[k] = V((J[k].x, J[k].y, warp(J[k].z)))

exec(open(os.path.join(os.path.dirname(__file__), 'finish.py')).read())
