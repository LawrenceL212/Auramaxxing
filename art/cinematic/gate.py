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
# stepped plinth up to the rift
for i in range(5):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 9.6 + i * 1.4; v.co.y *= 2.2; v.co.z = (v.co.z + 0.5) * 0.28
    displaced(to_obj('step', bm, stone_m), 0.06, 0.4, 4).location = (0, -30.6 + (4 - i) * 2.0 + 2.2 * 0, 0.28 * (4 - i)) if False else (0, -33 + (4 - i) * 2.0, 0.28 * (4 - i) - 0.0)

# the rift: a tall emissive tear, the main light of the scene
rm = mat('rift'); o = N(rm, 'ShaderNodeOutputMaterial'); em = N(rm, 'ShaderNodeEmission')
tc = N(rm, 'ShaderNodeTexCoord'); gr = N(rm, 'ShaderNodeValToRGB')
sep = N(rm, 'ShaderNodeSeparateXYZ'); ab = N(rm, 'ShaderNodeMath', operation='ABSOLUTE'); inv = N(rm, 'ShaderNodeMath', operation='SUBTRACT')
L(rm, tc, 'Generated', sep, 0); val(inv, 0, 1.0)
cx = N(rm, 'ShaderNodeMath', operation='SUBTRACT'); L(rm, sep, 'X', cx, 0); val(cx, 1, 0.5)
L(rm, cx, 0, ab, 0); mul = N(rm, 'ShaderNodeMath', operation='MULTIPLY'); L(rm, ab, 0, mul, 0); val(mul, 1, 2.0)
L(rm, mul, 0, inv, 1)
pw = N(rm, 'ShaderNodeMath', operation='POWER'); L(rm, inv, 0, pw, 0); val(pw, 1, 4.5)
col = N(rm, 'ShaderNodeMix', data_type='RGBA'); val(col, 'A', RANK + (1,)); val(col, 'B', (0.85, 0.93, 1.0, 1)); L(rm, pw, 0, col, 'Factor')
L(rm, col, 'Result', em, 'Color'); st = N(rm, 'ShaderNodeMath', operation='MULTIPLY'); L(rm, pw, 0, st, 0); val(st, 1, 9.0 + 2 * math.sin(T * 3) + 6 * max(0, (T - 4.4) / 2.0) ** 2); L(rm, st, 0, em, 'Strength')
L(rm, em, 'Emission', o, 'Surface')
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
for v in bm.verts: v.co = Vector((v.co.x * 2 * (6.4 + 1.2 * max(0, T - 4) / 2), 0, (v.co.y + 0.5) * 2 * 25.5))
rift = to_obj('rift', bm, rm); rift.location = (0, -33.0, 1.5)
rift.rotation_euler = (math.pi / 2 * 0, 0, 0)

# floating rocks and floor debris
rock_m = stone('rock', (0.06, 0.06, 0.07, 1), 0.6, 0.0, scale=0.5, bump=1.0)
for i in range(70):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    s = random.choice([0.12, 0.2, 0.35, 0.6, 1.0, 1.6]); x = random.uniform(-14, 14); z = random.choice([0.1, 0.1, 0.1, random.uniform(2, 16)])
    if abs(x) < 4 and z > 1: x += 6 * (1 if x > 0 else -1)
    ob = to_obj('rock', bm, rock_m); ob.scale = (s, s * random.uniform(.6, 1.2), s * random.uniform(.4, 1)); ob.location = (x, random.uniform(-30, 8), z + s * 0.3)
    ob.rotation_euler = (random.random() * 6, random.random() * 6, random.random() * 6); displaced(ob, 0.5, 0.7, 1)

# volumetric haze: god rays from the rift
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co = Vector((v.co.x * 60, v.co.y * 70, (v.co.z + 0.5) * 34))
vm = mat('haze'); vo = N(vm, 'ShaderNodeOutputMaterial'); vs = N(vm, 'ShaderNodeVolumeScatter'); val(vs, 'Density', 0.007); val(vs, 'Anisotropy', 0.45); val(vs, 'Color', (0.55, 0.7, 1.0, 1))
vm.node_tree.links.new(vs.outputs[0], vo.inputs['Volume'])
haze = to_obj('haze', bm, vm); haze.location = (0, -14, 12)

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

bpy.ops.render.render(write_still=True)
print('rendered', OUT)
