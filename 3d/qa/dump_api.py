import bpy, inspect, os
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
print("== TargetService ==")
for n, f in inspect.getmembers(TargetService, inspect.isfunction):
    if not n.startswith("_"): print(" ", n, str(inspect.signature(f))[:120])
print("== HumanService ==")
for n, f in inspect.getmembers(HumanService, inspect.isfunction):
    if not n.startswith("_"): print(" ", n, str(inspect.signature(f))[:120])
for sub in ("mesh_assets", "eyes", "hair", "proxymeshes"):
    try:
        p = LocationService.get_mpfb_data(sub)
        print("DATA", sub, os.path.exists(p), p)
        if os.path.exists(p):
            for d in os.listdir(p)[:30]: print("   ", d)
    except Exception as e:
        print("DATA", sub, "ERR", e)
