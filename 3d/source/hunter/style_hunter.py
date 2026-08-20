"""Auramaxxing Hunter v6 - the styled character pass.

  blender --background --python style_hunter.py -- --variant m1|f2 [--export OUT.glb]

Pack for the runtime with (flags are NOT optional):
  gltfpack -i hunter-XX-raw.glb -o hunter-XX.glb -cc -kn -kv -vtf
    -kn  keep node names (equipment attach_* points)
    -kv  keep vertex attributes: no material references a texture, so without
         this gltfpack strips the body UVs and the 21-region atlas goes dead
    -vtf float UVs: quantized UVs store their dequantization scale in a
         material texture transform, which textureless materials cannot carry -
         quantized UVs collapse to ~0..0.06 and every region samples as 0

Replaces the mannequin look of build_hunter_mpfb.py's exports. Root cause of the
old flat physique: set_target_value silently no-ops when the target was never
loaded as a shape key, and the load_target fallback was called with a bare name
instead of a full path, so nearly every body target failed. This script resolves
every target through TargetService.target_full_path() and loads it explicitly.

Adds, on top of the MPFB body:
  - a deliberate physique (V-taper, delts, lats, chest, narrow waist)
  - a sculpted face (jaw, cheekbones, brow, nose, lips, narrowed eyes)
  - procedural eyes (dark sclera + emissive iris, named Hunter_Eye_* so the
    runtime can drive iris emissive from Aura state)
  - stylized faceted hair built from the MPFB 'scalp' vertex group
    (named Hunter_Hair; keeps its own exported material at runtime)
  - attachment empties for the future equipment phase (attach_hand_R, etc.)

The body object is named Hunter_Body: the runtime applies the region shader to
that mesh ONLY. Its UV layout is untouched, so the existing region atlases
(hunter-male-regions.png / hunter-female-regions.png) remain valid.
"""
import bpy, bmesh, math, os, sys, random
import mathutils
from mathutils import Vector

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(flag, default=None):
    return ARGV[ARGV.index(flag) + 1] if flag in ARGV else default

VARIANT = arg("--variant", "m1")
EXPORT = arg("--export")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE'

# ── variant definitions ─────────────────────────────────────────────────────
VARIANTS = {
    # Male Hunter. Athletic, not bodybuilder: high muscle + low weight is what
    # produces definition; the V-taper comes from shoulder/vshape/waist targets.
    "m1": dict(
        macro=dict(gender=1.0, age=0.42, muscle=0.82, weight=0.36,
                   proportions=0.85, height=0.60),
        targets={
            # silhouette
            "torso/torso-vshape-incr": 0.90,
            "torso/measure-shoulder-dist-incr": 0.80,
            "torso/measure-waist-circ-decr": 0.55,
            "torso/measure-hips-circ-decr": 0.30,
            "torso/torso-muscle-pectoral-incr": 0.70,
            "torso/torso-muscle-dorsi-incr": 0.85,
            "torso/measure-frontchest-dist-incr": 0.45,
            "torso/torso-scale-depth-incr": 0.15,
            "hip/hip-scale-horiz-decr": 0.30,
            "stomach/stomach-tone-incr": 0.90,
            "arms/l-upperarm-muscle-incr": 0.62, "arms/r-upperarm-muscle-incr": 0.62,
            "arms/l-upperarm-shoulder-muscle-incr": 0.85,
            "arms/r-upperarm-shoulder-muscle-incr": 0.85,
            "arms/l-lowerarm-muscle-incr": 0.45, "arms/r-lowerarm-muscle-incr": 0.45,
            "legs/l-upperleg-muscle-incr": 0.50, "legs/r-upperleg-muscle-incr": 0.50,
            "legs/l-lowerleg-muscle-incr": 0.45, "legs/r-lowerleg-muscle-incr": 0.45,
            "buttocks/buttocks-volume-incr": 0.25,
            "neck/measure-neck-circ-incr": 0.45,
            # face - sharp, serious, intentionally structured
            "head/head-invertedtriangular": 0.35,
            "head/head-scale-depth-incr": 0.15,
            "chin/chin-bones-incr": 0.60,
            "chin/chin-prominent-incr": 0.40,
            "chin/chin-width-incr": 0.20,
            "chin/chin-width-incr": 0.35,
            "cheek/l-cheek-bones-incr": 0.65, "cheek/r-cheek-bones-incr": 0.65,
            "cheek/l-cheek-volume-decr": 0.20, "cheek/r-cheek-volume-decr": 0.20,
            "eyebrows/eyebrows-trans-down": 0.35,
            "eyebrows/eyebrows-angle-up": 0.20,
            "eyes/l-eye-height2-decr": 0.35, "eyes/r-eye-height2-decr": 0.35,
            "eyes/l-eye-corner1-up": 0.20, "eyes/r-eye-corner1-up": 0.20,
            "eyes/l-eye-scale-incr": 0.15, "eyes/r-eye-scale-incr": 0.15,
            "nose/nose-greek-incr": 0.25,
            "nose/nose-width2-decr": 0.25,
            "nose/nose-volume-decr": 0.15,
            "mouth/mouth-scale-horiz-decr": 0.10,
            "mouth/mouth-angles-down": 0.10,
            "forehead/forehead-temple-decr": 0.20,
            # subtle asymmetry so the face stops reading as generated
            "asym/asym-brown-1-r": 0.12, "asym/asym-cheek-1-r": 0.10,
        },
    ),
    # Female Hunter. Her own design, not a scaled male: longer neck, softer jaw
    # but still sharp cheekbones, athletic shoulders, defined waist.
    "f2": dict(
        macro=dict(gender=0.0, age=0.38, muscle=0.68, weight=0.34,
                   proportions=0.85, height=0.55),
        targets={
            "torso/torso-vshape-incr": 0.45,
            "torso/measure-shoulder-dist-incr": 0.45,
            "torso/measure-waist-circ-decr": 0.55,
            "torso/torso-muscle-dorsi-incr": 0.50,
            "stomach/stomach-tone-incr": 0.85,
            "arms/l-upperarm-muscle-incr": 0.40, "arms/r-upperarm-muscle-incr": 0.40,
            "arms/l-upperarm-shoulder-muscle-incr": 0.55,
            "arms/r-upperarm-shoulder-muscle-incr": 0.55,
            "legs/l-upperleg-muscle-incr": 0.42, "legs/r-upperleg-muscle-incr": 0.42,
            "legs/l-lowerleg-muscle-incr": 0.35, "legs/r-lowerleg-muscle-incr": 0.35,
            "buttocks/buttocks-volume-incr": 0.40,
            "legs/measure-thigh-circ-incr": 0.25,
            "neck/measure-neck-height-incr": 0.25,
            # face
            "head/head-oval": 0.30,
            "chin/chin-bones-incr": 0.30,
            "chin/chin-triangle": 0.25,
            "cheek/l-cheek-bones-incr": 0.55, "cheek/r-cheek-bones-incr": 0.55,
            "cheek/l-cheek-volume-decr": 0.25, "cheek/r-cheek-volume-decr": 0.25,
            "eyes/l-eye-scale-incr": 0.30, "eyes/r-eye-scale-incr": 0.30,
            "eyes/l-eye-corner1-up": 0.25, "eyes/r-eye-corner1-up": 0.25,
            "eyebrows/eyebrows-trans-down": 0.15,
            "nose/nose-scale-vert-decr": 0.15,
            "nose/nose-width2-decr": 0.30,
            "nose/nose-volume-decr": 0.25,
            "mouth/mouth-lowerlip-volume-incr": 0.30,
            "mouth/mouth-cupidsbow-incr": 0.25,
            "asym/asym-brown-1-l": 0.10,
        },
    ),
}
spec = VARIANTS[VARIANT]
FEMALE = VARIANT.startswith("f")

macro = TargetService.get_default_macro_info_dict()
macro.update(spec["macro"])
if FEMALE:
    for k, v in dict(cupsize=0.55, firmness=0.70, breastsize=0.55,
                     breastfirmness=0.70).items():
        if k in macro: macro[k] = v

basemesh = HumanService.create_human(mask_helpers=True, detailed_helpers=False,
                                     extra_vertex_groups=True, feet_on_ground=True,
                                     scale=0.1, macro_detail_dict=macro)
basemesh.name = "Hunter_Body"
print(f"[HUNTER] {VARIANT}: base verts={len(basemesh.data.vertices)}")

# ── targets: resolve full path, load explicitly, verify ─────────────────────
ok = fail = 0
for name, weight in spec["targets"].items():
    try:
        path = TargetService.target_full_path(name.split("/")[-1])
        if not path:
            raise RuntimeError("no path for " + name)
        TargetService.load_target(basemesh, path, weight=weight,
                                  name=name.split("/")[-1])
        ok += 1
    except Exception as e:
        fail += 1
        print(f"   !! target failed: {name}: {e}")
print(f"[HUNTER] targets: {ok} ok, {fail} failed")
if fail > ok:
    raise SystemExit("most targets failed - aborting rather than exporting a mannequin")

bpy.context.view_layer.objects.active = basemesh
basemesh.select_set(True)

# ── landmarks (computed before helper removal, in world space) ──────────────
def group_verts(obj, gname):
    gi = obj.vertex_groups[gname].index
    return [v for v in obj.data.vertices
            if any(g.group == gi for g in v.groups)]

deps = bpy.context.evaluated_depsgraph_get()
ev = basemesh.evaluated_get(deps)          # with shape keys applied
evm = ev.to_mesh()
gi_lips = basemesh.vertex_groups["lips"].index
gi_scalp = basemesh.vertex_groups["scalp"].index
lips = [evm.vertices[v.index].co for v in basemesh.data.vertices
        if any(g.group == gi_lips for g in v.groups)]
scalp = [(v.index, evm.vertices[v.index].co.copy()) for v in basemesh.data.vertices
         if any(g.group == gi_scalp for g in v.groups)]
top_z = max(v.co.z for v in evm.vertices)
lips_z = sum(c.z for c in lips) / len(lips)
lips_y = min(c.y for c in lips)            # front of the face (faces -Y)
height = top_z
unit = height / 1.75                       # normalize feature sizes to stature
eye_z = lips_z + 0.30 * (top_z - lips_z)
eye_x = 0.0315 * unit
# front surface y AT the socket, not at the nose: sample the band around the
# pupil x, otherwise the nose tip sets the depth and the eyes sit on goggles.
front = [v.co for v in evm.vertices
         if abs(v.co.z - eye_z) < 0.012 * unit
         and abs(abs(v.co.x) - eye_x) < 0.012 * unit]
front_y = min((c.y for c in front), default=lips_y)
eye_y = front_y + 0.0140 * unit
eye_r = 0.0112 * unit
scalp_pts = [c for _, c in scalp]
scalp_c = sum(scalp_pts, Vector()) / len(scalp_pts)
print(f"[HUNTER] height={height:.3f} eye_z={eye_z:.3f} front_y={front_y:.3f} "
      f"scalp_c=({scalp_c.x:.3f},{scalp_c.y:.3f},{scalp_c.z:.3f})")

# ── materials for the secondary meshes (exported into the GLB; the runtime
#    keeps these and only replaces the Hunter_Body material) ─────────────────
def pmat(name, base, rough, metal, emission=None, estr=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emission is not None:
        b.inputs["Emission Color"].default_value = (*emission, 1.0)
        b.inputs["Emission Strength"].default_value = estr
    return m

MAT_HAIR = pmat("Hunter_HairMat", (0.006, 0.008, 0.018), 0.72, 0.05)
MAT_SCLERA = pmat("Hunter_ScleraMat", (0.020, 0.022, 0.030), 0.40, 0.0)
MAT_IRIS = pmat("Hunter_IrisMat", (0.06, 0.14, 0.40), 0.25, 0.0,
                emission=(0.28, 0.48, 1.0), estr=0.12)

# ── eyes ────────────────────────────────────────────────────────────────────
eye_objs = []
for sx, tag in ((-1, "L"), (1, "R")):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=12, radius=eye_r,
        location=(sx * eye_x, eye_y, eye_z))
    eye = bpy.context.active_object
    eye.name = f"Hunter_Eye_{tag}"
    eye.rotation_euler = (math.radians(90), 0, 0)   # pole faces -Y (forward)
    # iris+pupil: assign front-cap faces to the iris material by angle
    eye.data.materials.append(MAT_SCLERA)
    eye.data.materials.append(MAT_IRIS)
    bm = bmesh.new(); bm.from_mesh(eye.data)
    fwd = Vector((0, 0, 1))    # pre-rotation local pole; rotation happens on object
    for f in bm.faces:
        if f.normal.dot(fwd) > 0.80:      # ~37 deg cap -> iris
            f.material_index = 1
    bm.to_mesh(eye.data); bm.free()
    bpy.ops.object.shade_smooth()
    eye_objs.append(eye)
print("[HUNTER] eyes placed")

# ── hair: faceted shell grown from the scalp group ──────────────────────────
# The scalp faces are duplicated into a new object, pushed outward along their
# normals with a combed-back bias, solidified, then left flat-shaded: a sharp,
# geometric, obsidian hair mass that matches the System's faceted aesthetic.
scalp_idx = {i for i, _ in scalp}
bm = bmesh.new()
bm.from_mesh(evm)
bm.verts.ensure_lookup_table()
hair_bm = bmesh.new()
vmap = {}
rng = random.Random(7)
for f in bm.faces:
    if all(v.index in scalp_idx for v in f.verts):
        nv = []
        for v in f.verts:
            if v.index not in vmap:
                co = v.co.copy(); n = v.normal.copy()
                # growth: more on top/back, shaved tight at the sides
                rel_z = (co.z - (scalp_c.z - 0.06 * unit)) / (0.14 * unit)
                rel_z = max(0.0, min(1.0, rel_z))
                sideness = min(1.0, abs(co.x) / (0.075 * unit))
                grow = unit * (0.004 + 0.044 * rel_z * (1.0 - 0.75 * sideness ** 2))
                comb = Vector((0, 1, 0.35)) * unit * 0.028 * rel_z ** 1.6  # swept back
                if co.y < scalp_c.y:      # front half: stay seated on the hairline
                    comb *= 0.25
                w = co + n * grow + comb
                # facet noise
                w += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1),
                             rng.uniform(-1, 1))) * unit * 0.004 * rel_z
                vmap[v.index] = hair_bm.verts.new(w)
            nv.append(vmap[v.index])
        try: hair_bm.faces.new(nv)
        except ValueError: pass
# back-spike clumps for silhouette (male); female gets a ponytail instead
if not FEMALE:
    hair_bm.verts.ensure_lookup_table()
    back = sorted(hair_bm.verts, key=lambda v: -(v.co.y + v.co.z * 0.8))[:60]
    for v in back:
        v.co += Vector((0, 0.010, 0.008)) * unit
hair_mesh = bpy.data.meshes.new("Hunter_HairMesh")
hair_bm.to_mesh(hair_mesh); hair_bm.free()
hair = bpy.data.objects.new("Hunter_Hair", hair_mesh)
bpy.context.collection.objects.link(hair)
hair.data.materials.append(MAT_HAIR)
sol = hair.modifiers.new("Solid", 'SOLIDIFY')
sol.thickness = 0.010 * unit; sol.offset = -1.0
bpy.context.view_layer.objects.active = hair
bpy.ops.object.modifier_apply(modifier=sol.name)

if FEMALE:
    # ponytail: a tapered, faceted curve falling from the back of the head
    cu = bpy.data.curves.new("Ponytail", 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
    base = Vector((0, scalp_c.y + 0.07 * unit, scalp_c.z + 0.035 * unit))
    pts = [base,
           base + Vector((0.01, 0.055, -0.02)) * unit,
           base + Vector((-0.008, 0.075, -0.16)) * unit,
           base + Vector((0.004, 0.055, -0.34)) * unit]
    radii = [0.030, 0.034, 0.020, 0.004]
    for p, co, r in zip(sp.bezier_points, pts, radii):
        p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'
        p.radius = r / 0.030
    cu.bevel_depth = 0.030 * unit; cu.bevel_resolution = 2
    tail = bpy.data.objects.new("Hunter_Ponytail", cu)
    bpy.context.collection.objects.link(tail)
    bpy.context.view_layer.objects.active = tail
    bpy.ops.object.convert(target='MESH')
    tail = bpy.context.active_object
    tail.data.materials.append(MAT_HAIR)
    # merge into hair object
    bpy.ops.object.select_all(action='DESELECT')
    tail.select_set(True); hair.select_set(True)
    bpy.context.view_layer.objects.active = hair
    bpy.ops.object.join()

bpy.context.view_layer.objects.active = hair
bpy.ops.object.shade_flat()               # deliberate: faceted, geometric
print(f"[HUNTER] hair built: {len(hair.data.polygons)} faces")
ev.to_mesh_clear()

# ── export prep on the body ─────────────────────────────────────────────────
bpy.ops.object.select_all(action='DESELECT')
basemesh.select_set(True)
bpy.context.view_layer.objects.active = basemesh

for m in list(basemesh.modifiers):
    if m.type == 'MASK':
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            print("[HUNTER] mask apply failed:", e)

helper_groups = [g.name for g in basemesh.vertex_groups
                 if 'helper' in g.name.lower() or g.name.lower().startswith('joint')]
if helper_groups:
    idx = {basemesh.vertex_groups[g].index for g in helper_groups}
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in basemesh.data.vertices:
        v.select = any(ge.group in idx for ge in v.groups)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"[HUNTER] helpers removed; verts now {len(basemesh.data.vertices)}")

try:
    TargetService.bake_targets(basemesh)
except Exception:
    if basemesh.data.shape_keys:
        basemesh.shape_key_add(name="Baked", from_mix=True)
        for k in [k for k in basemesh.data.shape_keys.key_blocks if k.name != "Baked"]:
            basemesh.shape_key_remove(k)
        basemesh.shape_key_remove(basemesh.data.shape_keys.key_blocks["Baked"])

# Weighted decimation: the body loses density, the head keeps it. The face is
# the one place the old uniform decimate visibly hurt.
vg = basemesh.vertex_groups.new(name="DecimZone")
neck_z = lips_z - 0.10 * unit
body_verts = [v.index for v in basemesh.data.vertices if v.co.z < neck_z]
vg.add(body_verts, 1.0, 'REPLACE')
before = len(basemesh.data.vertices)
dec = basemesh.modifiers.new("Decimate", 'DECIMATE')
dec.ratio = 0.58
dec.vertex_group = "DecimZone"
dec.vertex_group_factor = 10.0
bpy.ops.object.modifier_apply(modifier=dec.name)
print(f"[HUNTER] decimated {before} -> {len(basemesh.data.vertices)} verts")
bpy.ops.object.shade_smooth()

mat = pmat("HunterShell", (0.030, 0.042, 0.068), 0.46, 0.12)
basemesh.data.materials.clear()
basemesh.data.materials.append(mat)

# ── rig + idle breath (same contract as the previous exports) ───────────────
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "HunterRig"
for ob in (basemesh, hair, *eye_objs):
    ob.parent = arm
amod = basemesh.modifiers.new("Armature", 'ARMATURE')
amod.object = arm

scn.frame_start, scn.frame_end = 1, 96
scn.render.fps = 24
for f, sx, sy in ((1, 1.000, 1.000), (48, 1.010, 1.014), (96, 1.000, 1.000)):
    scn.frame_set(f)
    basemesh.scale = (sx, sy, 1.0)
    basemesh.keyframe_insert(data_path="scale", frame=f)

def iter_fcurves(action):
    if hasattr(action, "fcurves"):
        yield from action.fcurves; return
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves

if basemesh.animation_data and basemesh.animation_data.action:
    for fc in iter_fcurves(basemesh.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
scn.frame_set(1)

# ── equipment attachment points (empties -> glTF nodes) ─────────────────────
# Positions from the styled geometry; the future equipment phase parents
# createItemMesh() output to these named nodes.
mnv = [v.co for v in basemesh.data.vertices]
xr = max(c.x for c in mnv)
ATTACH = {
    "attach_hand_R": ( xr, 0.02, height * 0.44),
    "attach_hand_L": (-xr, 0.02, height * 0.44),
    "attach_chest":  (0.0, front_y + 0.05 * unit, height * 0.74),
    "attach_shoulder_R": ( 0.115 * unit * 1.55, 0.0, height * 0.845),
    "attach_shoulder_L": (-0.115 * unit * 1.55, 0.0, height * 0.845),
    "attach_head":   (0.0, 0.0, height * 1.005),
    "attach_feet":   (0.0, 0.0, 0.01),
    "attach_orbit":  (0.0, 0.0, height * 0.60),
}
attach_objs = []
for name, loc in ATTACH.items():
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.02
    e.location = loc
    e.parent = arm
    bpy.context.collection.objects.link(e)
    attach_objs.append(e)

# ── export ──────────────────────────────────────────────────────────────────
if EXPORT:
    bpy.ops.object.select_all(action='DESELECT')
    for ob in (basemesh, hair, *eye_objs, arm, *attach_objs):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = basemesh
    bpy.ops.export_scene.gltf(filepath=EXPORT, export_format='GLB',
                              use_selection=True, export_animations=True,
                              export_yup=True, export_apply=False)
    print("[HUNTER] exported ->", EXPORT, os.path.getsize(EXPORT), "bytes")

blend_out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         f"hunter-{VARIANT}.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_out)
print("[HUNTER] saved ->", blend_out)
