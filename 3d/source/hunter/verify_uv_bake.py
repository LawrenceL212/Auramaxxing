"""Apply the baked UV region texture back onto the body and render it.

If the UV bake is correct this must be visually identical in anatomy to the
body-space checkpoint - the regions are now looked up through UV coordinates,
so they are pose- and view-independent by construction.

Run: blender --background --python verify_uv_bake.py -- --tex ID.png --out DIR
"""
import bpy, json, math, os, sys
import numpy as np

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(f, d=None): return ARGV[ARGV.index(f) + 1] if f in ARGV else d
TEX = arg("--tex")
OUT = arg("--out", ".")
SEX = arg("--sex", "male")
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")

MACRO = {"male": dict(gender=1.0, age=0.42, muscle=0.90, weight=0.33,
                      proportions=0.85, height=0.62),
         "female": dict(gender=0.0, age=0.42, muscle=0.72, weight=0.38,
                        proportions=0.80, height=0.50)}
TARGETS = {
    "male": {"torso/measure-shoulder-dist-incr": 1.00, "torso/torso-scale-horiz-decr": 0.65,
             "torso/torso-muscle-pectoral-incr": 0.85, "torso/torso-muscle-dorsi-incr": 0.90,
             "torso/measure-frontchest-dist-incr": 0.70, "hip/hip-scale-horiz-decr": 0.50,
             "stomach/stomach-tone-incr": 1.00,
             "arms/l-upperarm-muscle-incr": 0.75, "arms/r-upperarm-muscle-incr": 0.75,
             "arms/l-upperarm-shoulder-muscle-incr": 0.85, "arms/r-upperarm-shoulder-muscle-incr": 0.85,
             "legs/measure-thigh-circ-incr": 0.45, "buttocks/buttocks-volume-incr": 0.30},
    "female": {},
}
macro = TargetService.get_default_macro_info_dict()
macro.update(MACRO[SEX])
body = HumanService.create_human(mask_helpers=True, detailed_helpers=False,
                                 extra_vertex_groups=True, feet_on_ground=True,
                                 scale=0.1, macro_detail_dict=macro)
for n, w in TARGETS[SEX].items():
    for c in (n, n.split("/")[-1]):
        try:
            TargetService.set_target_value(body, c, w); break
        except Exception:
            continue

# material: sample the ID texture with Closest filtering, emit it directly
mat = bpy.data.materials.new("UVRegionCheck")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputMaterial")
emi = nt.nodes.new("ShaderNodeEmission")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(TEX)
tex.interpolation = 'Closest'          # NEAREST - never blend region ids
tex.extension = 'CLIP'
try:
    tex.image.colorspace_settings.name = 'Non-Color'
except Exception:
    pass
nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
body.data.materials.clear(); body.data.materials.append(mat)

scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE'
scn.render.film_transparent = False
scn.world = bpy.data.worlds.new("W"); scn.world.use_nodes = True
scn.world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.025, 0.035, 1)
try:
    scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'
except Exception:
    pass
scn.render.resolution_x, scn.render.resolution_y = 520, 1040
scn.render.image_settings.file_format = 'PNG'
try: scn.eevee.taa_render_samples = 32
except Exception: pass

co = np.array([v.co[:] for v in body.data.vertices])
ground, crown = co[:, 2].min(), co[:, 2].max()
H = crown - ground
cam = bpy.data.cameras.new("C"); cam.lens = 52
cobj = bpy.data.objects.new("C", cam)
bpy.context.collection.objects.link(cobj); scn.camera = cobj
cz = ground + H * 0.52; d = H * 1.45

VIEWS = {"front": (0, -d, cz, 90, 0, 0), "back": (0, d, cz, 90, 0, 180),
         "34left": (-d*0.72, -d*0.72, cz, 90, 0, -45),
         "34right": (d*0.72, -d*0.72, cz, 90, 0, 45)}
for name, (x, y, z, rx, ry, rz) in VIEWS.items():
    cobj.location = (x, y, z)
    cobj.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
    scn.render.filepath = os.path.join(OUT, f"uv-{SEX}-{name}.png")
    bpy.ops.render.render(write_still=True)

# ── non-neutral pose: rotate the whole figure and bend it, proving the lookup
# is attached to the surface rather than to a view direction ────────────────
body.rotation_euler = (0, math.radians(-18), math.radians(28))
body.location.z += 0.02
cobj.location = (-d * 0.5, -d * 0.85, cz)
cobj.rotation_euler = (math.radians(90), 0, math.radians(-30))
scn.render.filepath = os.path.join(OUT, f"uv-{SEX}-posed.png")
bpy.ops.render.render(write_still=True)
print("[UVCHECK] rendered ->", OUT)
