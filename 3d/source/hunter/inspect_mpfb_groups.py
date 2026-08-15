"""Gate check for the UV-space bake: what does MPFB actually give us to map from?

Inspects a freshly generated MPFB human (before any of our processing) for
vertex groups, UV layout and material slots, so the 21 canonical Auramaxxing
regions can be mapped from real source data rather than assumed.

Run: blender --background --python inspect_mpfb_groups.py
"""
import bpy, json, os, sys

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")

macro = TargetService.get_default_macro_info_dict()
macro.update(dict(gender=1.0, muscle=0.9, weight=0.33))
body = HumanService.create_human(mask_helpers=True, detailed_helpers=False,
                                 extra_vertex_groups=True, feet_on_ground=True,
                                 scale=0.1, macro_detail_dict=macro)

print("[GROUPS] mesh:", body.name, "verts:", len(body.data.vertices),
      "polys:", len(body.data.polygons))
print("[GROUPS] uv layers:", [uv.name for uv in body.data.uv_layers])
print("[GROUPS] materials:", [m.name if m else None for m in body.data.materials])

vgs = [g.name for g in body.vertex_groups]
print(f"[GROUPS] vertex groups: {len(vgs)}")
for n in sorted(vgs):
    print("   VG:", n)

# How many verts actually belong to each group - an empty group is useless.
counts = {g.name: 0 for g in body.vertex_groups}
idx_to_name = {g.index: g.name for g in body.vertex_groups}
for v in body.data.vertices:
    for ge in v.groups:
        n = idx_to_name.get(ge.group)
        if n is not None and ge.weight > 0.0:
            counts[n] += 1
print("[GROUPS] non-empty groups:", sum(1 for c in counts.values() if c > 0))
for n, c in sorted(counts.items(), key=lambda kv: -kv[1]):
    if c:
        print(f"   COUNT {c:6}  {n}")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mpfb_groups.json")
with open(out, "w") as f:
    json.dump({"verts": len(body.data.vertices),
               "uv_layers": [uv.name for uv in body.data.uv_layers],
               "groups": counts}, f, indent=1)
print("[GROUPS] wrote", out)
