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
BOSS = arg('--boss', '/home/claude/Auramaxxing/art/models/antares.glb'); BOSS_H = arg('--boss-h', 38.0, float)
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

def stone(name, base, rough, crack_strength, scale=2.2, bump=0.5, wet=0.0, blocks=None):
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
    # chipped, rounded edges: a bevel normal feeds the bump
    bev = N(m, 'ShaderNodeBevel'); bev.samples = 4; val(bev, 'Radius', 0.05)
    L(m, bev, 'Normal', bmp, 'Normal')
    hmix = N(m, 'ShaderNodeMath', operation='MULTIPLY_ADD')
    if blocks:   # ashlar courses: mortar grooves between dressed blocks, each block its own tone
        br = N(m, 'ShaderNodeTexBrick'); L(m, mp, 0, br, 'Vector'); val(br, 'Scale', blocks); val(br, 'Mortar Size', 0.012); val(br, 'Mortar Smooth', 0.1); val(br, 'Bias', 0.0); val(br, 'Brick Width', 1.6); val(br, 'Row Height', 0.5)
        br.inputs['Color1'].default_value = (0.9, 0.9, 0.92, 1); br.inputs['Color2'].default_value = (0.55, 0.57, 0.62, 1); br.inputs['Mortar'].default_value = (0.1, 0.1, 0.1, 1)
        L(m, br, 'Fac', hmix, 0); val(hmix, 1, 0.5); L(m, noise, 'Fac', hmix, 2)
    else:
        L(m, noise, 'Fac', hmix, 0); val(hmix, 1, 1.0); val(hmix, 2, 0.0)
    L(m, hmix, 0, bmp, 'Height'); val(bmp, 'Strength', bump); val(bmp, 'Distance', 0.12)
    L(m, bmp, 'Normal', bs, 'Normal')
    cm = N(m, 'ShaderNodeMix', data_type='RGBA'); val(cm, 'A', base); val(cm, 'B', tuple(c * 0.35 for c in base[:3]) + (1,)); L(m, noise, 'Fac', cm, 'Factor')
    # crevice grime: ambient occlusion darkens the corners, and rain streaks run down the faces
    ao = N(m, 'ShaderNodeAmbientOcclusion'); ao.samples = 4; val(ao, 'Distance', 1.4)
    gm = N(m, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); val(gm, 'Factor', 1.0); L(m, cm, 'Result', gm, 'A'); L(m, ao, 'Color', gm, 'B')
    stm = N(m, 'ShaderNodeMapping'); val(stm, 'Scale', (6.0, 6.0, 0.6)); L(m, tc, 'Object', stm, 0)
    stn = N(m, 'ShaderNodeTexNoise'); val(stn, 'Scale', 2.0); val(stn, 'Detail', 6.0); L(m, stm, 0, stn, 'Vector')
    sr = N(m, 'ShaderNodeMapRange'); L(m, stn, 'Fac', sr, 'Value'); val(sr, 'From Min', 0.45); val(sr, 'From Max', 0.8); val(sr, 'To Min', 1.0); val(sr, 'To Max', 0.42)
    gm2 = N(m, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); val(gm2, 'Factor', 1.0); L(m, gm, 'Result', gm2, 'A'); L(m, sr, 'Result', gm2, 'B')
    L(m, gm2, 'Result', bs, 'Base Color')
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
floor.data.materials.append(stone('floor', (0.05, 0.055, 0.07, 1), 0.26, 0.9, scale=0.35, bump=0.35, wet=0.1, blocks=5.0))
floor.location = (0, -14, 0)
displaced(floor, 0.35, 6.0, 4)

# the gate: two buttressed pylons and a lintel
stone_m = stone('pylon', (0.075, 0.08, 0.095, 1), 0.55, 2.2, scale=0.22, bump=1.0, blocks=14.0)
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
dark = mat('silhouette'); do = N(dark, 'ShaderNodeOutputMaterial'); db = N(dark, 'ShaderNodeBsdfPrincipled'); val(db, 'Base Color', (0.012, 0.015, 0.025, 1)); val(db, 'Roughness', 0.9); L(dark, db, 'BSDF', do, 'Surface')
# sky dome behind the gate: cold bright at the horizon, deep violet overhead
sky = mat('sky'); so = N(sky, 'ShaderNodeOutputMaterial'); se = N(sky, 'ShaderNodeEmission'); stc = N(sky, 'ShaderNodeTexCoord'); ssp = N(sky, 'ShaderNodeSeparateXYZ'); sr = N(sky, 'ShaderNodeValToRGB')
L(sky, stc, 'Generated', ssp, 0); sr.color_ramp.elements[0].position = 0.0; sr.color_ramp.elements[0].color = (1.0, 0.7, 0.34, 1); sr.color_ramp.elements[1].position = 0.55; sr.color_ramp.elements[1].color = (0.02, 0.018, 0.03, 1)
e2 = sr.color_ramp.elements.new(0.22); e2.color = (0.42, 0.28, 0.2, 1)
L(sky, ssp, 'Z', sr, 'Fac'); L(sky, sr, 'Color', se, 'Color'); val(se, 'Strength', 2.4); L(sky, se, 'Emission', so, 'Surface')
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=170)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -6 or v.co.z < -2], context='VERTS')
for v in bm.verts: v.co.y -= 0
to_obj('sky', bm, sky).location = (0, -50, 0)
# the causeway: a long stone road across a void, with low parapets, running to a citadel
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co.x *= 8.0; v.co.y *= 110.0; v.co.z = (v.co.z + 0.5) * 0.8 - 0.8
cw = to_obj('causeway', bm, stone_m); cw.location = (0, -92, 0.0); displaced(cw, 0.05, 0.5, 4)
for sx in (-1, 1):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 0.5; v.co.y *= 110.0; v.co.z = (v.co.z + 0.5) * 1.0
    to_obj('parapet', bm, stone_m).location = (sx * 4.0, -92, 0.0)
# the arena: a broken stone floor ringed by dead pillars, with the boss standing in the middle distance, backlit
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=70)
ar = to_obj('arena', bm, stone_m); ar.location = (0, -128, 0.0); displaced(ar, 0.04, 0.8, 1)
for i in range(16):
    a = i / 16 * math.tau; px, py = 58 * math.cos(a), -128 + 58 * math.sin(a)
    if py > -75: continue
    h = random.uniform(10, 34)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=random.choice([5, 6, 8]), radius1=random.uniform(2.4, 4), radius2=random.uniform(1.2, 2.6), depth=h)
    for v in bm.verts: v.co.z += h / 2
    displaced(to_obj('deadpillar', bm, dark), 0.15, 2.0, 3).location = (px, py, 0)
for i in range(30):   # rubble scattered across the arena
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    ob = to_obj('arubble', bm, dark); r = random.uniform(1.0, 2.2); ob.scale = (r, r, r * 0.6); ob.location = (random.uniform(-40, 40), random.uniform(-125, -70), 0.3); displaced(ob, 0.4, 1.0, 1)
# the boss: Antares from the art pack, huge, facing the gate
bpy.ops.import_scene.gltf(filepath=BOSS)
bobs = [o for o in bpy.context.selected_objects]
root = bpy.data.objects.new('boss', None); sc.collection.objects.link(root)
for o in bobs:
    if o.parent is None: o.parent = root
mn = Vector((1e9,) * 3); mx2 = Vector((-1e9,) * 3)
for o in bobs:
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx2 = Vector(map(max, mx2, w))
bh = max(mx2.z - mn.z, 0.01)
root.scale = (BOSS_H / bh,) * 3; root.rotation_euler = (0, 0, math.pi); root.location = (0, -104, 0)
# the fog gate: a wall of golden mist in the opening, lit from beyond, swirling slowly
fg = mat('fog'); fo = N(fg, 'ShaderNodeOutputMaterial'); pv = N(fg, 'ShaderNodeVolumePrincipled')
ftc = N(fg, 'ShaderNodeTexCoord'); fmp = N(fg, 'ShaderNodeMapping'); fn = N(fg, 'ShaderNodeTexNoise'); fr = N(fg, 'ShaderNodeValToRGB'); fm = N(fg, 'ShaderNodeMath', operation='MULTIPLY')
L(fg, ftc, 'Object', fmp, 0); fmp.inputs['Location'].default_value = (T * 0.05, T * 0.12, T * 0.03); val(fmp, 'Scale', (1.6, 1.6, 0.35))
L(fg, fmp, 0, fn, 'Vector'); val(fn, 'Scale', 1.2); val(fn, 'Detail', 5.0); val(fn, 'Roughness', 0.6)
L(fg, fn, 'Fac', fr, 'Fac'); fr.color_ramp.elements[0].position = 0.35; fr.color_ramp.elements[0].color = (0.1, 0.1, 0.1, 1); fr.color_ramp.elements[1].position = 0.8; fr.color_ramp.elements[1].color = (1, 1, 1, 1)
L(fg, fr, 'Color', fm, 0); val(fm, 1, 0.38 + 1.2 * max(0, (T - 4.8) / 1.2))
L(fg, fm, 0, pv, 'Density'); val(pv, 'Color', (1.0, 0.86, 0.6, 1)); val(pv, 'Anisotropy', 0.3)
pv.inputs['Emission Strength'].default_value = 0.7 + 7.0 * max(0, (T - 5.0) / 1.2) ** 2; pv.inputs['Emission Color'].default_value = (1.0, 0.82, 0.5, 1)
L(fg, pv, 'Volume', fo, 'Volume')
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co = Vector((v.co.x * 6.5, v.co.y * 1.6, (v.co.z + 0.5) * 25.5))
rift = to_obj('fog', bm, fg); rift.location = (0, -33.0, 1.5)
# vaulted ceiling beams across the hall, so it reads as an interior with a far end
for i in range(4):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 15.0; v.co.y *= 1.1; v.co.z = (v.co.z + 0.5) * 1.0
    ob = displaced(to_obj('beam', bm, stone_m), 0.2, 1.0, 3); ob.location = (random.uniform(-2, 2), 6 - i * 9.0, 19.5 + random.uniform(-.4, .4)); ob.rotation_euler = (0, random.uniform(-.06, .06), random.uniform(-.05, .05)); ob.scale = (random.uniform(.55, 1.0), 1, 1)

# floating rocks and floor debris
rock_m = stone('rock', (0.06, 0.06, 0.07, 1), 0.6, 0.0, scale=0.5, bump=1.0)
for i in range(70):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    s = random.choice([0.12, 0.2, 0.35, 0.6, 1.0, 1.6]); x = random.uniform(-14, 14); z = random.choice([0.1, 0.1, 0.1, random.uniform(2, 16)])
    if abs(x) < 4 and z > 1: x += 6 * (1 if x > 0 else -1)
    ob = to_obj('rock', bm, rock_m); ob.scale = (s, s * random.uniform(.6, 1.2), s * random.uniform(.4, 1)); ob.location = (x, random.uniform(-30, 8), z + s * 0.3)
    ob.rotation_euler = (random.random() * 6, random.random() * 6, random.random() * 6); displaced(ob, 0.5, 0.7, 1)


def emit(name, col, strength):
    m = mat(name); o = N(m, 'ShaderNodeOutputMaterial'); e = N(m, 'ShaderNodeEmission'); val(e, 'Color', col); val(e, 'Strength', strength); L(m, e, 'Emission', o, 'Surface'); return m
# flame: a tapering teardrop with a hot core fading to dark orange tips, wobbling with time
flame_m = mat('flameEm'); flo = N(flame_m, 'ShaderNodeOutputMaterial'); fem = N(flame_m, 'ShaderNodeEmission'); fr2 = N(flame_m, 'ShaderNodeValToRGB')
fgc = N(flame_m, 'ShaderNodeTexCoord'); fsz = N(flame_m, 'ShaderNodeSeparateXYZ'); fnz = N(flame_m, 'ShaderNodeTexNoise')
L(flame_m, fgc, 'Generated', fsz, 0); L(flame_m, fsz, 'Z', fr2, 'Fac')
fr2.color_ramp.elements[0].position = 0.0; fr2.color_ramp.elements[0].color = (1.0, 0.9, 0.55, 1); fr2.color_ramp.elements[1].position = 1.0; fr2.color_ramp.elements[1].color = (0.9, 0.18, 0.02, 1)
L(flame_m, fr2, 'Color', fem, 'Color'); val(fem, 'Strength', 9.0); L(flame_m, fem, 'Emission', flo, 'Surface')
def flame_mesh():
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.5)
    ph = random.random() * 6
    for v in bm.verts:
        z = v.co.z + 0.5; k = max(0.0, 1.0 - z) ** 1.3
        v.co.x = v.co.x * k * 0.9 + math.sin(z * 5 + T * 6 + ph) * 0.07 * z
        v.co.y = v.co.y * k * 0.9 + math.cos(z * 4 + T * 5 + ph) * 0.05 * z
        v.co.z = z * 1.4
    return bm
ember_m = emit('ember', (1.0, 0.45, 0.12, 1), 60.0)
# ---- scale cues ----
col_m = stone('column', (0.045, 0.052, 0.075, 1), 0.5, 0.0, scale=0.3, bump=0.9, blocks=9.0)
def fluted(r1, r2, depth, segs=48, flutes=16, depth_f=0.07, rings=14):
    """A column shaft with carved flutes and entasis, so it reads as worked stone, not a cylinder."""
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > depth * 0.5], cuts=rings, use_grid_fill=True)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x); rr = math.hypot(v.co.x, v.co.y)
        if rr < 1e-4: continue
        k = 1 - depth_f * (0.5 + 0.5 * math.cos(a * flutes)) ** 0.6
        zt = v.co.z / depth + 0.5; k *= 1 + 0.025 * math.sin(zt * math.pi)
        v.co.x *= k; v.co.y *= k
    return bm
def column(x, y, h, r):
    bm = fluted(r, r * 0.86, h)
    for v in bm.verts: v.co.z += h / 2
    ob = to_obj('column', bm, col_m); ob.location = (x, y, 0); ob.rotation_euler = (random.uniform(-.035, .035), random.uniform(-.035, .035), 0); displaced(ob, 0.22, 0.7, 3)
    for k in range(5):   # rubble heaped at the foot, so nothing meets the floor cleanly
        rb = bmesh.new(); bmesh.ops.create_icosphere(rb, subdivisions=2, radius=1.0)
        rr = random.uniform(0.15, 0.5); rk = to_obj('foot', rb, col_m); rk.scale = (rr * 1.4, rr, rr * 0.6); rk.location = (x + random.uniform(-r * 1.6, r * 1.6), y + random.uniform(-r * 1.6, r * 1.6), rr * 0.3); displaced(rk, 0.3, 0.6, 1)
    for z0, hh in ((0, 0.9), (h - 0.6, 0.6), (h * 0.5, 0.25)):   # base, capital and a band: repeated rhythm
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r * 1.25, radius2=r * 1.25, depth=hh)
        for v in bm.verts: v.co.z += hh / 2 + z0
        to_obj('ring', bm, col_m).location = (x, y, 0)
for i in range(9):
    for sx in (-1, 1):
        column(sx * (5.6 + (i % 2) * 0.3), 8 - i * 4.4, 13 + (i % 3), 0.95)
# tall fallen column drums and a toppled column: human-height boulders of worked stone
for (x, y, ang) in ((-2.4, -6.5, 0.4), (3.0, -12.0, -0.9), (-1.2, 1.5, 0.2)):
    bm = fluted(1.0, 1.0, 1.6, depth_f=0.09, rings=6)
    for v in bm.verts:   # a fractured end: one face is torn in jagged steps, the other stays squared
        if v.co.z > 0.6: v.co.z -= abs(math.sin(v.co.x * 7 + v.co.y * 5)) * 0.22 + random.uniform(0, 0.05)
    ob = to_obj('drum', bm, col_m); ob.location = (x, y, 0.9); ob.rotation_euler = (math.pi / 2, 0, ang); displaced(ob, 0.03, 0.35, 2)
    for k in range(9):   # chips and shards fallen from the break
        rb = bmesh.new(); bmesh.ops.create_icosphere(rb, subdivisions=2, radius=1.0)
        rr = random.uniform(0.06, 0.28); rk = to_obj('chip', rb, col_m); rk.scale = (rr * 1.5, rr, rr * 0.6)
        rk.location = (x + random.uniform(-1.8, 1.8), y + random.uniform(-1.8, 1.8), rr * 0.3); rk.rotation_euler = (random.random() * 3, random.random() * 3, random.random() * 3); displaced(rk, 0.25, 0.4, 1)
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
        to_obj('flame', flame_mesh(), flame_m).location = (x, y, 1.25)
        for k in range(6):   # embers lifting off each brazier
            bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=random.uniform(0.012, 0.03))
            to_obj('ember', bm, ember_m).location = (x + random.uniform(-0.5, 0.5), y + random.uniform(-0.5, 0.5), random.uniform(1.8, 5.5))
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

# ---- atmosphere: ground mist, drifting ash, motes in the light ----
gmv = mat('groundmist'); gvo = N(gmv, 'ShaderNodeOutputMaterial'); gvs = N(gmv, 'ShaderNodeVolumeScatter'); gtc = N(gmv, 'ShaderNodeTexCoord'); gmp = N(gmv, 'ShaderNodeMapping'); gnz = N(gmv, 'ShaderNodeTexNoise')
gsz = N(gmv, 'ShaderNodeSeparateXYZ'); gh = N(gmv, 'ShaderNodeMath', operation='SUBTRACT'); gp = N(gmv, 'ShaderNodeMath', operation='POWER'); gd = N(gmv, 'ShaderNodeMath', operation='MULTIPLY'); gd2 = N(gmv, 'ShaderNodeMath', operation='MULTIPLY')
L(gmv, gtc, 'Generated', gsz, 0); val(gh, 0, 1.0); L(gmv, gsz, 'Z', gh, 1); L(gmv, gh, 0, gp, 0); val(gp, 1, 2.5)
L(gmv, gtc, 'Object', gmp, 0); gmp.inputs['Location'].default_value = (T * 0.15, T * 0.05, 0); val(gmp, 'Scale', (0.35, 0.35, 0.7)); L(gmv, gmp, 0, gnz, 'Vector'); val(gnz, 'Scale', 1.4); val(gnz, 'Detail', 4.0)
L(gmv, gnz, 'Fac', gd, 0); L(gmv, gp, 0, gd, 1); L(gmv, gd, 0, gd2, 0); val(gd2, 1, 0.55); L(gmv, gd2, 0, gvs, 'Density'); val(gvs, 'Color', (0.62, 0.66, 0.8, 1)); val(gvs, 'Anisotropy', 0.2)
gmv.node_tree.links.new(gvs.outputs[0], gvo.inputs['Volume'])
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co = Vector((v.co.x * 26, v.co.y * 80, (v.co.z + 0.5) * 3.2))
to_obj('groundmist', bm, gmv).location = (0, -10, 0)
ash_m = emit('ash', (0.85, 0.78, 0.7, 1), 1.6)
for i in range(420):   # flakes of ash falling through the hall: pale in the light, giving the air a texture
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=random.uniform(0.008, 0.032))
    to_obj('ashflake', bm, ash_m).location = (random.uniform(-9, 9), random.uniform(13, -32), random.uniform(0.3, 15))

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
