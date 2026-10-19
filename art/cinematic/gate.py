# The System Gate: a path-traced still/clip of the opening, rendered offline in Blender Cycles.
#   python3.11 gate.py --out /tmp/gate.png [--t 3.2] [--spp 48] [--res 540 1170]
import bpy, bmesh, math, sys, random
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
def arg(name, default, cast=str):
    return cast(argv[argv.index(name) + 1]) if name in argv else default
OUT = arg('--out', '/tmp/gate.png'); T = arg('--t', 3.2, float); SPP = arg('--spp', 48, int)
RW = int(argv[argv.index('--res') + 1]) if '--res' in argv else 540
RH = int(argv[argv.index('--res') + 2]) if '--res' in argv else 1170
RANK = (0.18, 0.5, 1.0)
random.seed(5)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 6; sc.cycles.volume_bounces = 1; sc.cycles.volume_step_rate = 2.0
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = RW, RH, 100
sc.render.filepath = OUT; sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items.keys() else 'AgX'
sc.view_settings.look = 'None'; sc.view_settings.exposure = -0.2

# world: near-black with a faint cold ambient
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.007, 0.018, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0

def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes.clear(); return m
def N(m, t, **kw):
    n = m.node_tree.nodes.new(t)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def L(m, a, ao, b, bi): m.node_tree.links.new(a.outputs[ao], b.inputs[bi])
def val(n, name, v): n.inputs[name].default_value = v

def stone(name, base, rough, crack_strength, scale=2.2, bump=0.5, wet=0.0):
    m = mat(name); nt = m.node_tree
    out = N(m, 'ShaderNodeOutputMaterial'); bs = N(m, 'ShaderNodeBsdfPrincipled')
    tc = N(m, 'ShaderNodeTexCoord'); mp = N(m, 'ShaderNodeMapping')
    noise = N(m, 'ShaderNodeTexNoise'); vor = N(m, 'ShaderNodeTexVoronoi'); rmp = N(m, 'ShaderNodeValToRGB')
    bmp = N(m, 'ShaderNodeBump'); mix = N(m, 'ShaderNodeMath', operation='MULTIPLY')
    L(m, tc, 'Object', mp, 0); val(mp, 'Scale', (scale, scale, scale))
    L(m, mp, 0, noise, 'Vector'); val(noise, 'Scale', 3.0); val(noise, 'Detail', 12.0); val(noise, 'Roughness', 0.62)
    L(m, mp, 0, vor, 'Vector'); vor.feature = 'DISTANCE_TO_EDGE'; val(vor, 'Scale', 2.6)
    rm = N(m, 'ShaderNodeMapRange'); L(m, noise, 'Fac', rm, 'Value'); val(rm, 'From Min', 0.35); val(rm, 'From Max', 0.7); val(rm, 'To Min', rough * 0.7); val(rm, 'To Max', min(1, rough * 1.25 + wet))
    L(m, rm, 'Result', bs, 'Roughness')
    L(m, noise, 'Fac', bmp, 'Height'); val(bmp, 'Strength', bump); val(bmp, 'Distance', 0.12)
    L(m, bmp, 'Normal', bs, 'Normal')
    cm = N(m, 'ShaderNodeMix', data_type='RGBA'); val(cm, 'A', base); val(cm, 'B', tuple(c * 0.35 for c in base[:3]) + (1,)); L(m, noise, 'Fac', cm, 'Factor')
    L(m, cm, 'Result', bs, 'Base Color')
    if crack_strength > 0:  # glowing seams along the voronoi cell edges
        cr = N(m, 'ShaderNodeMapRange'); L(m, vor, 'Distance', cr, 'Value'); val(cr, 'From Min', 0.0); val(cr, 'From Max', 0.012); val(cr, 'To Min', 1.0); val(cr, 'To Max', 0.0); cr.clamp = True
        n2 = N(m, 'ShaderNodeTexNoise'); L(m, mp, 0, n2, 'Vector'); val(n2, 'Scale', 0.9); val(n2, 'Detail', 3.0)
        mk = N(m, 'ShaderNodeMapRange'); L(m, n2, 'Fac', mk, 'Value'); val(mk, 'From Min', 0.52); val(mk, 'From Max', 0.64); mk.clamp = True
        sp = N(m, 'ShaderNodeMath', operation='MULTIPLY'); L(m, cr, 'Result', sp, 0); L(m, mk, 'Result', sp, 1)
        L(m, sp, 0, mix, 0); val(mix, 1, crack_strength)
        L(m, mix, 'Value', bs, 'Emission Strength'); bs.inputs['Emission Color'].default_value = RANK + (1,)
    bs.inputs['Specular IOR Level'].default_value = 0.5
    L(m, bs, 'BSDF', out, 'Surface')
    return m

def to_obj(name, bm, mt, subd=0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.data.materials.append(mt); return ob

def displaced(ob, strength, scale, cuts=3):
    sd = ob.modifiers.new('s', 'SUBSURF'); sd.subdivision_type = 'SIMPLE'; sd.levels = cuts; sd.render_levels = cuts
    tx = bpy.data.textures.new(ob.name + 't', 'CLOUDS'); tx.noise_scale = scale; tx.noise_depth = 4
    d = ob.modifiers.new('d', 'DISPLACE'); d.texture = tx; d.strength = strength; d.mid_level = 0.5
    return ob

# floor
fl = bpy.data.meshes.new('floor'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=8, y_segments=8, size=60); bm.to_mesh(fl); bm.free()
floor = bpy.data.objects.new('floor', fl); sc.collection.objects.link(floor)
floor.data.materials.append(stone('floor', (0.05, 0.055, 0.07, 1), 0.28, 0.9, scale=0.35, bump=0.25, wet=0.1))
floor.location = (0, -14, 0)

# the gate: two buttressed pylons and a lintel
stone_m = stone('pylon', (0.07, 0.075, 0.09, 1), 0.55, 2.2, scale=0.22, bump=0.9)
def pylon(sx):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 3.6 * (1 - 0.18 * (v.co.z > 0)); v.co.y *= 3.4; v.co.z = (v.co.z + 0.5) * 28
    ob = to_obj('pylon', bm, stone_m); ob.location = (sx * 5.2, -34, 0); displaced(ob, 0.35, 0.9, 5); return ob
pylon(-1); pylon(1)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co.x *= 14.5; v.co.y *= 3.6; v.co.z = (v.co.z + 0.5) * 2.6
displaced(to_obj('lintel', bm, stone_m), 0.3, 0.9, 5).location = (0, -34, 27.6)
# a wide flight of human-sized steps up to the rift: the eye counts them and reads the scale
for i in range(14):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 15.0 + (13 - i) * 0.5; v.co.y *= 0.9; v.co.z = (v.co.z + 0.5) * 0.19 * (14 - i)
    displaced(to_obj('step', bm, stone_m), 0.025, 0.3, 3).location = (0, -33.0 + i * 0.9, 0)

# the world beyond the gate: sky, a ringed moon, a causeway over a void to a citadel, towers and floating islands
def emit(name, col, strength):
    m = mat(name); o = N(m, 'ShaderNodeOutputMaterial'); e = N(m, 'ShaderNodeEmission'); val(e, 'Color', col); val(e, 'Strength', strength); L(m, e, 'Emission', o, 'Surface'); return m
dark = mat('silhouette'); do = N(dark, 'ShaderNodeOutputMaterial'); db = N(dark, 'ShaderNodeBsdfPrincipled'); val(db, 'Base Color', (0.012, 0.015, 0.025, 1)); val(db, 'Roughness', 0.9); L(dark, db, 'BSDF', do, 'Surface')
# sky dome behind the gate: cold bright at the horizon, deep violet overhead
sky = mat('sky'); so = N(sky, 'ShaderNodeOutputMaterial'); se = N(sky, 'ShaderNodeEmission'); stc = N(sky, 'ShaderNodeTexCoord'); ssp = N(sky, 'ShaderNodeSeparateXYZ'); sr = N(sky, 'ShaderNodeValToRGB')
L(sky, stc, 'Generated', ssp, 0); sr.color_ramp.elements[0].position = 0.0; sr.color_ramp.elements[0].color = (0.55, 0.75, 1.0, 1); sr.color_ramp.elements[1].position = 0.55; sr.color_ramp.elements[1].color = (0.015, 0.012, 0.07, 1)
e2 = sr.color_ramp.elements.new(0.22); e2.color = (0.25, 0.32, 0.7, 1)
L(sky, ssp, 'Z', sr, 'Fac'); L(sky, sr, 'Color', se, 'Color'); val(se, 'Strength', 2.4); L(sky, se, 'Emission', so, 'Surface')
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=170)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -6 or v.co.z < -2], context='VERTS')
for v in bm.verts: v.co.y -= 0
to_obj('sky', bm, sky).location = (0, -50, 0)
# a huge ringed moon low on the horizon
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=14)
moon = to_obj('moon', bm, emit('moon', (0.8, 0.88, 1.0, 1), 6.0)); moon.location = (24, -150, 30)
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=False, segments=96, radius=26)
ring = to_obj('moonring', bm, emit('ring', (0.7, 0.8, 1.0, 1), 1.6)); ring.location = (24, -150, 30); ring.rotation_euler = (math.radians(72), 0, math.radians(20))
ring.scale = (1, 1, 1)
# the causeway: a long stone road across a void, with low parapets, running to a citadel
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co.x *= 8.0; v.co.y *= 110.0; v.co.z = (v.co.z + 0.5) * 0.8 - 0.8
cw = to_obj('causeway', bm, stone_m); cw.location = (0, -92, 0.0); displaced(cw, 0.05, 0.5, 4)
for sx in (-1, 1):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 0.5; v.co.y *= 110.0; v.co.z = (v.co.z + 0.5) * 1.0
    to_obj('parapet', bm, stone_m).location = (sx * 4.0, -92, 0.0)
for i in range(10):   # lamp posts along the causeway, receding: a ruler for distance
    for sx in (-1, 1):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.12, radius2=0.1, depth=3.0)
        for v in bm.verts: v.co.z += 1.5
        to_obj('post', bm, stone_m).location = (sx * 4.0, -40 - i * 11, 0.9)
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.22)
        to_obj('lamp', bm, emit('lamp', (0.5, 0.75, 1.0, 1), 60.0)).location = (sx * 4.0, -40 - i * 11, 4.3)
# the citadel at the end of the road
for i, (w, d, h, x, y) in enumerate([(26, 12, 30, 0, -150), (12, 8, 56, -10, -152), (10, 8, 66, 12, -154), (8, 6, 80, 2, -156), (7, 7, 48, -20, -150), (9, 7, 44, 22, -151)]):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= w * (1 - 0.35 * (v.co.z > 0)); v.co.y *= d; v.co.z = (v.co.z + 0.5) * h
    displaced(to_obj('tower', bm, dark), 0.08, 3.0, 4).location = (x, y, -2)
    for k in range(int(h / 4)):   # lit windows
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=0.7)
        to_obj('win', bm, emit('win', (1.0, 0.78, 0.45, 1), 25.0)).location = (x + random.uniform(-w * .3, w * .3), y + d / 2 + 0.2, 4 + k * 4)
# distant towers and floating islands either side of the road: layers of depth
for i in range(22):
    sx = random.choice([-1, 1]); x = sx * random.uniform(14, 70); y = random.uniform(-150, -70); h = random.uniform(15, 70)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=random.choice([4, 6, 8]), radius1=random.uniform(2, 5), radius2=random.uniform(0.2, 2), depth=h)
    for v in bm.verts: v.co.z += h / 2
    displaced(to_obj('spire', bm, dark), 0.12, 2.0, 3).location = (x, y, -3)
for i in range(9):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    isl = to_obj('island', bm, dark); isl.scale = (random.uniform(5, 12), random.uniform(5, 12), random.uniform(1.5, 3)); isl.location = (random.uniform(-60, 60), random.uniform(-140, -80), random.uniform(18, 46)); displaced(isl, 0.5, 1.5, 1)
# the portal veil: a faint shimmering membrane across the opening, not a wall of light
vl = mat('veil'); vo2 = N(vl, 'ShaderNodeOutputMaterial'); mx = N(vl, 'ShaderNodeMixShader'); tr = N(vl, 'ShaderNodeBsdfTransparent'); ve = N(vl, 'ShaderNodeEmission')
vtc = N(vl, 'ShaderNodeTexCoord'); vn = N(vl, 'ShaderNodeTexNoise'); vr = N(vl, 'ShaderNodeMapRange')
L(vl, vtc, 'Object', vn, 'Vector'); val(vn, 'Scale', 0.35); val(vn, 'Detail', 1.0)
L(vl, vn, 'Fac', vr, 'Value'); val(vr, 'From Min', 0.3); val(vr, 'From Max', 0.6); val(vr, 'To Min', 0.0); val(vr, 'To Max', 0.012 + 0.8 * max(0, (T - 5.2) / 1.0) ** 2)
L(vl, vr, 'Result', mx, 0); L(vl, tr, 'BSDF', mx, 1); L(vl, ve, 'Emission', mx, 2); val(ve, 'Color', RANK + (1,)); val(ve, 'Strength', 2.0 + 25 * max(0, (T - 5.2) / 1.0) ** 2); L(vl, mx, 'Shader', vo2, 'Surface')
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
for v in bm.verts: v.co = Vector((v.co.x * 2 * 6.4, 0, (v.co.y + 0.5) * 2 * 25.5))
rift = to_obj('rift', bm, vl); rift.location = (0, -33.0, 1.5)
# vaulted ceiling beams across the hall, so it reads as an interior with a far end
for i in range(4):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 15.0; v.co.y *= 1.1; v.co.z = (v.co.z + 0.5) * 1.0
    displaced(to_obj('beam', bm, stone_m), 0.08, 1.0, 3).location = (0, 6 - i * 9.0, 19.5)

# floating rocks and floor debris
rock_m = stone('rock', (0.06, 0.06, 0.07, 1), 0.6, 0.0, scale=0.5, bump=1.0)
for i in range(70):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    s = random.choice([0.12, 0.2, 0.35, 0.6, 1.0, 1.6]); x = random.uniform(-14, 14); z = random.choice([0.1, 0.1, 0.1, random.uniform(2, 16)])
    if abs(x) < 4 and z > 1: x += 6 * (1 if x > 0 else -1)
    ob = to_obj('rock', bm, rock_m); ob.scale = (s, s * random.uniform(.6, 1.2), s * random.uniform(.4, 1)); ob.location = (x, random.uniform(-30, 8), z + s * 0.3)
    ob.rotation_euler = (random.random() * 6, random.random() * 6, random.random() * 6); displaced(ob, 0.5, 0.7, 1)


# ---- scale cues ----
col_m = stone('column', (0.04, 0.05, 0.075, 1), 0.5, 0.0, scale=0.3, bump=0.8)
def column(x, y, h, r):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r * 0.86, depth=h)
    for v in bm.verts: v.co.z += h / 2
    ob = to_obj('column', bm, col_m); ob.location = (x, y, 0); displaced(ob, 0.12, 0.6, 3)
    for z0, hh in ((0, 0.9), (h - 0.6, 0.6), (h * 0.5, 0.25)):   # base, capital and a band: repeated rhythm
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r * 1.25, radius2=r * 1.25, depth=hh)
        for v in bm.verts: v.co.z += hh / 2 + z0
        to_obj('ring', bm, col_m).location = (x, y, 0)
for i in range(9):
    for sx in (-1, 1):
        column(sx * (5.6 + (i % 2) * 0.3), 8 - i * 4.4, 13 + (i % 3), 0.95)
# tall fallen column drums and a toppled column: human-height boulders of worked stone
for (x, y, ang) in ((-2.4, -6.5, 0.4), (3.0, -12.0, -0.9), (-1.2, 1.5, 0.2)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=1.0, radius2=1.0, depth=1.6)
    ob = to_obj('drum', bm, col_m); ob.location = (x, y, 0.9); ob.rotation_euler = (math.pi / 2, 0, ang); displaced(ob, 0.08, 0.5, 2)
# braziers: bowl on a stand, 1.2 m tall, a warm flame against the cold blue
fire = mat('flame'); fo = N(fire, 'ShaderNodeOutputMaterial'); fe = N(fire, 'ShaderNodeEmission'); val(fe, 'Color', (1.0, 0.45, 0.12, 1)); val(fe, 'Strength', 28.0); L(fire, fe, 'Emission', fo, 'Surface')
iron = mat('iron'); io = N(iron, 'ShaderNodeOutputMaterial'); ib = N(iron, 'ShaderNodeBsdfPrincipled'); val(ib, 'Base Color', (0.02, 0.02, 0.025, 1)); val(ib, 'Metallic', 1.0); val(ib, 'Roughness', 0.4); L(iron, ib, 'BSDF', io, 'Surface')
for i in range(7):
    for sx in (-1, 1):
        x, y = sx * 3.2, 6.5 - i * 4.4
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.08, radius2=0.08, depth=1.0)
        for v in bm.verts: v.co.z += 0.5
        to_obj('stand', bm, iron).location = (x, y, 0)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.38, radius2=0.22, depth=0.3)
        for v in bm.verts: v.co.z += 1.1
        to_obj('bowl', bm, iron).location = (x, y, 0)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=0.26, radius2=0.0, depth=0.95)
        for v in bm.verts: v.co.z += 1.55
        to_obj('flame', bm, fire).location = (x, y, 0)
# chains and tattered banners hanging from the lintel: links the size of a forearm
for cx in (-4.5, -1.6, 1.6, 4.5):
    for k in range(34):
        bm = bmesh.new(); bmesh.ops.create_torus(bm, major_segments=10, minor_segments=5, major_radius=0.18, minor_radius=0.045) if hasattr(bmesh.ops, 'create_torus') else bmesh.ops.create_cube(bm, size=0.2)
        ob = to_obj('link', bm, iron); ob.location = (cx + 0.02 * math.sin(k), -33.2, 26.4 - k * 0.27); ob.rotation_euler = (math.pi / 2 * (k % 2), 0, 0)
for bx in (-8.2, 8.2):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=6, y_segments=14, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * 3.0, 0.0, (v.co.y - 1.0) * 5.5 + 21.0 - 5.5))
    ob = to_obj('banner', bm, col_m); ob.location = (bx, -32.0, 0); ob.rotation_euler = (0, 0, 0)
    tx = bpy.data.textures.new('bw', 'CLOUDS'); tx.noise_scale = 1.4; d = ob.modifiers.new('d', 'DISPLACE'); d.texture = tx; d.strength = 0.8; d.direction = 'Y'

# volumetric haze: god rays from the rift
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co = Vector((v.co.x * 160, v.co.y * 330, (v.co.z + 0.5) * 70))
vm = mat('haze'); vo = N(vm, 'ShaderNodeOutputMaterial'); vs = N(vm, 'ShaderNodeVolumeScatter'); val(vs, 'Density', 0.0006); val(vs, 'Anisotropy', 0.45); val(vs, 'Color', (0.55, 0.7, 1.0, 1))
vm.node_tree.links.new(vs.outputs[0], vo.inputs['Volume'])
haze = to_obj('haze', bm, vm); haze.location = (0, -100, 0)

# camera: low and wide, rising to eye height, closing in
k = lambda a, b, x: a + (b - a) * max(0, min(1, x))
e = lambda x: (lambda y: y * y * (3 - 2 * y))(max(0, min(1, x)))
cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
b = e((T - 1.6) / 1.6); c = e((T - 4.0) / 2.4)
co.location = (math.sin(T * 1.8) * 0.04 * b, k(12, 1, e(T / 6.4) * .55 + T / 6.4 * .45) * 0 + k(14, 5, T / 6.4), k(0.3, 1.72, b) + abs(math.sin(T * 3.6)) * 0.045 * b)
tgt = Vector((0, -33, k(2.4, 10, b) + c * 8)); d = tgt - co.location
co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
cam.lens = k(20, 34, b) + c * 24; cam.sensor_width = 36
cam.dof.use_dof = True; cam.dof.focus_distance = d.length * 0.9; cam.dof.aperture_fstop = 4.0

sc.use_nodes = True; ct = sc.node_tree; ct.nodes.clear()
rl = ct.nodes.new('CompositorNodeRLayers'); gl = ct.nodes.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'; gl.quality = 'HIGH'; gl.threshold = 1.0; gl.size = 7; gl.mix = -0.5
cp = ct.nodes.new('CompositorNodeComposite'); ct.links.new(rl.outputs[0], gl.inputs[0]); ct.links.new(gl.outputs[0], cp.inputs[0])
bpy.ops.render.render(write_still=True)
print('rendered', OUT)
