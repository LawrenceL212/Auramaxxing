"""QA renderer - imports a runtime GLB and renders it with a light rig that
mimics the Three.js scene in index.html (cool key, strong blue rim, dim fill),
plus a neutral grey rig so modelling errors can't hide behind mood lighting.

  blender --background --python render_glb.py -- --glb PATH --out STEM [--neutral]

Views: front, back, 34 (three-quarter), face (close-up).
"""
import bpy, math, os, sys

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(flag, default=None):
    return ARGV[ARGV.index(flag) + 1] if flag in ARGV else default

GLB = arg("--glb"); STEM = arg("--out")
NEUTRAL = "--neutral" in ARGV

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE'
scn.render.film_transparent = False
scn.world = bpy.data.worlds.new("W")
scn.world.use_nodes = True
bg = scn.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.010, 0.013, 0.024, 1.0)
bg.inputs[1].default_value = 1.0

bpy.ops.import_scene.gltf(filepath=GLB)

# bounds of all mesh objects
import mathutils
mn = mathutils.Vector((1e9,)*3); mx = mathutils.Vector((-1e9,)*3)
for ob in bpy.data.objects:
    if ob.type != 'MESH': continue
    for c in ob.bound_box:
        w = ob.matrix_world @ mathutils.Vector(c)
        mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
h = mx.z - mn.z; cz = (mn.z + mx.z) / 2

def light(name, kind, energy, size, color, loc, rot):
    l = bpy.data.lights.new(name, kind); l.energy = energy
    if kind == 'AREA': l.size = size
    l.color = color
    o = bpy.data.objects.new(name, l); o.location = loc
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    bpy.context.collection.objects.link(o)

if NEUTRAL:
    light("Key", 'AREA', 320, 2.0, (1, 1, 1), (1.8, -2.2, cz + h*0.45), (60, 0, 40))
    light("Fill", 'AREA', 120, 3.0, (1, 1, 1), (-1.8, -2.0, cz), (78, 0, -42))
    light("Rim", 'AREA', 300, 2.0, (1, 1, 1), (-1.6, 2.4, cz + h*0.4), (66, 0, -145))
else:
    light("Key", 'AREA', 300, 1.6, (0.74, 0.83, 1.0), (1.9, -2.3, cz + h*0.5), (58, 0, 40))
    light("Rim", 'AREA', 1500, 2.2, (0.36, 0.66, 1.0), (-2.0, 2.4, cz + h*0.35), (66, 0, -140))
    light("Fill", 'AREA', 55, 3.0, (0.30, 0.42, 0.75), (-1.5, -1.9, cz - h*0.1), (82, 0, -48))

cam = bpy.data.cameras.new("Cam"); cam.lens = 55
co = bpy.data.objects.new("Cam", cam)
bpy.context.collection.objects.link(co); scn.camera = co
scn.render.image_settings.file_format = 'PNG'
try: scn.eevee.taa_render_samples = 48
except Exception: pass

d = h * 1.5
views = {
    "front": (0.0, -d, cz, 90, 0, 0, 460, 1000),
    "back":  (0.0,  d, cz, 90, 0, 180, 460, 1000),
    "34":    (-d*0.68, -d*0.78, cz + h*0.04, 88, 0, -41, 460, 1000),
    "face":  (-h*0.28, -h*0.55, mn.z + h*0.90, 86, 0, -27, 700, 700),
}
for vname, (x, y, z, rx, ry, rz, w, hh) in views.items():
    co.location = (x, y, z)
    co.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
    scn.render.resolution_x, scn.render.resolution_y = w, hh
    scn.render.filepath = f"{STEM}-{vname}.png"
    bpy.ops.render.render(write_still=True)
print("[QA] rendered ->", STEM)
