import bpy, json, os
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
root = LocationService.get_mpfb_data("targets")
names = []
for dirpath, dirs, files in os.walk(root):
    for f in files:
        if f.endswith(".target.gz") or f.endswith(".target"):
            rel = os.path.relpath(os.path.join(dirpath, f), root).replace("\\", "/")
            names.append(rel.replace(".target.gz", "").replace(".target", ""))
out = "C:/Users/lawre/Downloads/Auramaxxing/3d/qa/targets.json"
json.dump(sorted(names), open(out, "w"), indent=0)
print("[DUMP]", len(names), "targets ->", out)
