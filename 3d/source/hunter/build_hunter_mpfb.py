"""Auramaxxing Hunter - MPFB2-generated athletic base, styled for the System.

Run headless:
  blender --background --python build_hunter_mpfb.py -- --variant v4 [--render OUT.png] [--export OUT.glb]

MPFB2 supplies anatomically correct topology, UVs and a rig. The physique is
driven parametrically: macro sliders for the broad build, then individual body
targets for the shoulder-to-waist ratio that defines the Hunter silhouette.

Nothing here is imported by the app. The runtime consumes the exported GLB only.
"""
import bpy, inspect, math, os, sys

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(flag, default=None):
    return ARGV[ARGV.index(flag) + 1] if flag in ARGV else default

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

# ── variants ────────────────────────────────────────────────────────────────
# macro: gender 1.0 = male. muscle/weight/proportions/height are 0..1.
# targets: name -> weight, applied after the macro pass.
VARIANTS = {
    # 1. neutral athletic - the honest baseline, no styling
    "v1": dict(macro=dict(gender=1.0, age=0.5, muscle=0.62, weight=0.46,
                          proportions=0.5, height=0.55),
               targets={}),

    # 2. wider shoulders / stronger V-taper
    "v2": dict(macro=dict(gender=1.0, age=0.5, muscle=0.66, weight=0.44,
                          proportions=0.6, height=0.58),
               targets={
                   "torso/measure-shoulder-dist-incr": 0.75,
                   "torso/torso-scale-horiz-decr": 0.35,
                   "hip/hip-scale-horiz-decr": 0.30,
                   "stomach/stomach-tone-incr": 0.55,
               }),

    # 3. more muscular upper body
    "v3": dict(macro=dict(gender=1.0, age=0.5, muscle=0.88, weight=0.52,
                          proportions=0.55, height=0.55),
               targets={
                   "torso/torso-muscle-pectoral-incr": 0.80,
                   "torso/torso-muscle-dorsi-incr": 0.80,
                   "torso/measure-shoulder-dist-incr": 0.55,
                   "arms/l-upperarm-muscle-incr": 0.70,
                   "arms/r-upperarm-muscle-incr": 0.70,
                   "arms/l-upperarm-shoulder-muscle-incr": 0.65,
                   "arms/r-upperarm-shoulder-muscle-incr": 0.65,
               }),

    # 4. balanced aesthetic athletic - the intended Hunter
    "v4": dict(macro=dict(gender=1.0, age=0.45, muscle=0.74, weight=0.44,
                          proportions=0.68, height=0.58),
               targets={
                   "torso/measure-shoulder-dist-incr": 0.70,
                   "torso/torso-muscle-pectoral-incr": 0.62,
                   "torso/torso-muscle-dorsi-incr": 0.70,
                   "torso/torso-scale-horiz-decr": 0.40,
                   "torso/measure-frontchest-dist-incr": 0.45,
                   "hip/hip-scale-horiz-decr": 0.28,
                   "stomach/stomach-tone-incr": 0.70,
                   "arms/l-upperarm-muscle-incr": 0.55,
                   "arms/r-upperarm-muscle-incr": 0.55,
                   "arms/l-upperarm-shoulder-muscle-incr": 0.60,
                   "arms/r-upperarm-shoulder-muscle-incr": 0.60,
                   "legs/measure-thigh-circ-incr": 0.35,
                   "buttocks/buttocks-volume-incr": 0.25,
               }),

    # 5. THE HUNTER - high muscle with low body fat is what produces definition;
    #    v3 showed that muscle alone just adds bulk. Shoulders and waist are
    #    pushed hard because the V-taper is the silhouette that reads at 390px.
    # Female Hunter body. Independently parameterised - matches the macro and
    # target set used for the female region bake in bake_uv_regions.py, so the
    # body and its atlas describe the same geometry. Not a scaled male.
    "f1": dict(macro=dict(gender=0.0, age=0.42, muscle=0.72, weight=0.38,
                          proportions=0.80, height=0.50),
               targets={
                   "torso/measure-shoulder-dist-incr": 0.55,
                   "torso/torso-scale-horiz-decr": 0.55,
                   "torso/torso-muscle-dorsi-incr": 0.55,
                   "stomach/stomach-tone-incr": 0.85,
                   "arms/l-upperarm-muscle-incr": 0.45,
                   "arms/r-upperarm-muscle-incr": 0.45,
                   "arms/l-upperarm-shoulder-muscle-incr": 0.50,
                   "arms/r-upperarm-shoulder-muscle-incr": 0.50,
                   "legs/measure-thigh-circ-incr": 0.35,
                   "buttocks/buttocks-volume-incr": 0.40,
               }),

    "v5": dict(macro=dict(gender=1.0, age=0.42, muscle=0.90, weight=0.33,
                          proportions=0.85, height=0.62),
               targets={
                   "torso/measure-shoulder-dist-incr": 1.00,
                   "torso/torso-scale-horiz-decr": 0.65,
                   "torso/torso-muscle-pectoral-incr": 0.85,
                   "torso/torso-muscle-dorsi-incr": 0.90,
                   "torso/measure-frontchest-dist-incr": 0.70,
                   "hip/hip-scale-horiz-decr": 0.50,
                   "stomach/stomach-tone-incr": 1.00,
                   "arms/l-upperarm-muscle-incr": 0.75,
                   "arms/r-upperarm-muscle-incr": 0.75,
                   "arms/l-upperarm-shoulder-muscle-incr": 0.85,
                   "arms/r-upperarm-shoulder-muscle-incr": 0.85,
                   "legs/measure-thigh-circ-incr": 0.45,
                   "buttocks/buttocks-volume-incr": 0.30,
               }),
}

VARIANT = arg("--variant", "v4")
spec = VARIANTS[VARIANT]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE'
scn.render.film_transparent = True

macro = TargetService.get_default_macro_info_dict()
macro.update(spec["macro"])
basemesh = HumanService.create_human(mask_helpers=True, detailed_helpers=False,
                                     extra_vertex_groups=True, feet_on_ground=True,
                                     scale=0.1, macro_detail_dict=macro)
print(f"[MPFB] {VARIANT}: base verts={len(basemesh.data.vertices)}")

# ── body targets ────────────────────────────────────────────────────────────
sig = inspect.signature(TargetService.set_target_value)
print("[MPFB] set_target_value:", sig)
applied = 0
for name, weight in spec["targets"].items():
    ok = False
    for candidate in (name, name.split("/")[-1]):
        try:
            TargetService.set_target_value(basemesh, candidate, weight)
            ok = True
            break
        except Exception:
            continue
    if not ok:
        try:
            TargetService.load_target(basemesh, name, weight=weight)
            ok = True
        except Exception as e:
            print(f"   !! target failed: {name} ({e})")
    applied += 1 if ok else 0
print(f"[MPFB] targets applied: {applied}/{len(spec['targets'])}")

try:
    TargetService.reapply_macro_details(basemesh)
except Exception:
    pass

bpy.context.view_layer.objects.active = basemesh
basemesh.select_set(True)

# ── Auramaxxing material: dark shell, controlled specular, rim-friendly ──────
mat = bpy.data.materials.new("HunterShell")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.030, 0.042, 0.068, 1.0)
bsdf.inputs["Roughness"].default_value = 0.46
bsdf.inputs["Metallic"].default_value = 0.18
if "Specular IOR Level" in bsdf.inputs:
    bsdf.inputs["Specular IOR Level"].default_value = 0.62
basemesh.data.materials.clear()
basemesh.data.materials.append(mat)

dims = basemesh.dimensions
print(f"[MPFB] dimensions: {dims.x:.3f} x {dims.y:.3f} x {dims.z:.3f}")

# ── render turntable views for judgement ────────────────────────────────────
render_path = arg("--render")
if render_path:
    key = bpy.data.lights.new("Key", 'AREA'); key.energy = 260; key.size = 1.4
    ko = bpy.data.objects.new("Key", key); ko.location = (1.7, -2.1, 2.2)
    ko.rotation_euler = (math.radians(56), 0, math.radians(38))
    bpy.context.collection.objects.link(ko)
    rim = bpy.data.lights.new("Rim", 'AREA'); rim.energy = 1400; rim.size = 2.4
    rim.color = (0.34, 0.64, 1.0)
    ro = bpy.data.objects.new("Rim", rim); ro.location = (-2.1, 2.4, 2.0)
    ro.rotation_euler = (math.radians(66), 0, math.radians(-133))
    bpy.context.collection.objects.link(ro)
    fill = bpy.data.lights.new("Fill", 'AREA'); fill.energy = 60; fill.size = 3.0
    fill.color = (0.45, 0.58, 1.0)
    fo = bpy.data.objects.new("Fill", fill); fo.location = (-1.4, -1.8, 1.0)
    fo.rotation_euler = (math.radians(82), 0, math.radians(-50))
    bpy.context.collection.objects.link(fo)

    cam = bpy.data.cameras.new("Cam"); cam.lens = 50
    co = bpy.data.objects.new("Cam", cam)
    bpy.context.collection.objects.link(co); scn.camera = co
    scn.render.resolution_x, scn.render.resolution_y = 460, 1000
    scn.render.image_settings.file_format = 'PNG'
    try: scn.eevee.taa_render_samples = 48
    except Exception: pass

    h = dims.z
    d = h * 1.55                       # pull back so the whole figure is framed
    views = {"front": (0.0, -d, h * 0.50, 90, 0, 0),
             "back":  (0.0,  d, h * 0.50, 90, 0, 180),
             "34":    (-d * 0.68, -d * 0.78, h * 0.54, 88, 0, -41)}
    stem, ext = os.path.splitext(render_path)
    for vname, (x, y, z, rx, ry, rz) in views.items():
        co.location = (x, y, z)
        co.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        scn.render.filepath = f"{stem}-{vname}{ext}"
        bpy.ops.render.render(write_still=True)
    print("[MPFB] rendered ->", stem + "-{front,back,34}" + ext)

# ── runtime export: decimate for mobile, rig, idle breath, GLB ──────────────
export_path = arg("--export")
if export_path:
    bpy.ops.object.select_all(action='DESELECT')
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = basemesh

    # MPFB carries helper geometry for clothes fitting, hidden behind a Mask
    # modifier. Exporting without applying that mask ships the helpers, which
    # render as a solid skirt around the hips. Apply/remove masks first.
    print("[MPFB] modifiers before export:", [(m.name, m.type) for m in basemesh.modifiers])
    for m in list(basemesh.modifiers):
        if m.type == 'MASK':
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
                print("[MPFB] applied mask modifier:", m.name)
            except Exception as e:
                print("[MPFB] mask apply failed, removing helpers by group:", e)

    # Belt and braces: drop any vertex still in a helper group.
    helper_groups = [g.name for g in basemesh.vertex_groups
                     if 'helper' in g.name.lower() or g.name.lower().startswith('joint')]
    if helper_groups:
        import bmesh
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        idx = {basemesh.vertex_groups[g].index for g in helper_groups}
        for v in basemesh.data.vertices:
            if any(ge.group in idx for ge in v.groups):
                v.select = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.delete(type='VERT')
        bpy.ops.object.mode_set(mode='OBJECT')
        print(f"[MPFB] removed helper geometry from {len(helper_groups)} group(s); "
              f"verts now {len(basemesh.data.vertices)}")

    # Targets are shape keys, and a modifier cannot be applied over them, so
    # bake the current shape into the mesh first.
    try:
        TargetService.bake_targets(basemesh)
        print("[MPFB] targets baked")
    except Exception as e:
        print("[MPFB] bake_targets unavailable, collapsing shape keys manually:", e)
        if basemesh.data.shape_keys:
            basemesh.shape_key_add(name="Baked", from_mix=True)
            for k in [k for k in basemesh.data.shape_keys.key_blocks if k.name != "Baked"]:
                basemesh.shape_key_remove(k)
            basemesh.shape_key_remove(basemesh.data.shape_keys.key_blocks["Baked"])

    # MPFB ships ~19k verts, far more than a phone needs for a character seen at
    # this scale. Collapse-decimate preserves the silhouette that matters.
    before = len(basemesh.data.vertices)
    dec = basemesh.modifiers.new("Decimate", 'DECIMATE')
    dec.ratio = 0.34
    bpy.ops.object.modifier_apply(modifier=dec.name)
    print(f"[MPFB] decimated {before} -> {len(basemesh.data.vertices)} verts, "
          f"{len(basemesh.data.polygons)} faces")
    bpy.ops.object.shade_smooth()

    # Simple root armature. MPFB can add a full rig, but the runtime only needs
    # a skeleton to carry the idle clip; a real rig can be swapped in later
    # without touching the shader or the atlas.
    bpy.ops.object.armature_add(location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = "HunterRig"
    basemesh.parent = arm
    amod = basemesh.modifiers.new("Armature", 'ARMATURE')
    amod.object = arm

    # Idle breath - shallow, slow, scale-only so it survives a mesh swap.
    scn.frame_start, scn.frame_end = 1, 96
    scn.render.fps = 24
    for f, sx, sy in ((1, 1.000, 1.000), (48, 1.010, 1.014), (96, 1.000, 1.000)):
        scn.frame_set(f)
        basemesh.scale = (sx, sy, 1.0)
        basemesh.keyframe_insert(data_path="scale", frame=f)

    def iter_fcurves(action):
        """Blender 4.x exposed action.fcurves; 5.x moved them into layered slots."""
        if hasattr(action, "fcurves"):
            yield from action.fcurves
            return
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves

    if basemesh.animation_data and basemesh.animation_data.action:
        for fc in iter_fcurves(basemesh.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'BEZIER'

    scn.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    basemesh.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = basemesh
    bpy.ops.export_scene.gltf(filepath=export_path, export_format='GLB',
                              use_selection=True, export_animations=True,
                              export_yup=True, export_apply=False)
    print("[MPFB] exported ->", export_path, os.path.getsize(export_path), "bytes")

blend_out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"hunter-{VARIANT}.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_out)
print("[MPFB] saved ->", blend_out)
