"""Bake the 21 authoritative muscle regions from anatomy*.svg into region-ID maps.

The SVG remains the source of truth. This only produces a lookup texture:
  R channel = region index + 1   (0 = no region)
Front and back figures are baked to separate atlases, since the SVG already
contains a front view and a back view side by side - exactly the two planar
projections a 3D body needs.

Each region is rasterised on its own as white-on-black and composed in Pillow,
so the ID values are exact rather than whatever the browser's colour management
leaves behind.

Read-only with respect to the app. Outputs to 3d/exports/.
Run:  python bake_regions.py
"""
import json, pathlib
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

REPO = pathlib.Path(__file__).resolve().parents[3]
EXPORTS = REPO / "3d" / "exports"
EXPORTS.mkdir(parents=True, exist_ok=True)

# Canonical order is the contract with the shader: index+1 is the ID value.
REGIONS = [
    "Upper Chest", "Middle Chest", "Lower Chest",
    "Front Shoulders", "Lateral Shoulders", "Rear Shoulders",
    "Traps", "Lats", "Upper Back", "Lower Back",
    "Biceps", "Triceps", "Forearms",
    "Upper Abs", "Middle Abs", "Lower Abs", "Obliques",
    "Glutes", "Hamstrings", "Quads", "Calves",
]
SRC = 1080                 # SVG viewBox is 1080x1080
SPLIT = 540                # front figure left of this, back figure right
ATLAS_W, ATLAS_H = 512, 1024

# Isolate one region and paint every matching group white. querySelectorAll +
# merge is required: the male sheet has Obliques and Obliques_2, the female
# sheet repeats Obliques and Lower Back, and getElementById would silently
# return only the first of each.
ISOLATE = """(name)=>{
  // Hide every path rather than painting it black: a black path later in
  // document order would otherwise draw over the region being measured, which
  // silently produced an empty mask for female Lower Abs.
  document.querySelectorAll('svg path').forEach(p=>{
    p.style.display='none'; p.style.stroke='none'; p.style.opacity='1';
  });
  const groups=[...document.querySelectorAll('svg g')].filter(g=>{
    const id=g.id||''; return id===name || id.startsWith(name+'_');
  });
  let n=0;
  groups.forEach(g=>g.querySelectorAll('path').forEach(p=>{
    p.style.display='inline'; p.style.fill='#fff'; n++;
  }));
  return {groups:groups.length, paths:n};
}"""


def bake(svg_path: pathlib.Path, out_prefix: str):
    svg = svg_path.read_text(encoding="utf-8", errors="replace")
    html = f'<html><body style="margin:0;background:#000">{svg}</body></html>'

    front = np.zeros((SRC, SRC), dtype=np.uint8)
    back = np.zeros((SRC, SRC), dtype=np.uint8)
    meta = {}

    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": SRC, "height": SRC})
        pg.set_content(html)
        pg.wait_for_timeout(350)
        for i, name in enumerate(REGIONS):
            info = pg.evaluate(ISOLATE, name)
            shot = EXPORTS / f"__tmp_{i}.png"
            pg.screenshot(path=str(shot))
            m = np.array(Image.open(shot).convert("L"))
            shot.unlink()
            hit = m > 127
            if not hit.any():
                meta[name] = {"id": i + 1, "pixels": 0, "groups": info["groups"], "warn": "empty"}
                continue
            # Later regions must not silently erase earlier ones; paint only
            # where nothing has been claimed yet.
            fmask = hit.copy(); fmask[:, SPLIT:] = False
            bmask = hit.copy(); bmask[:, :SPLIT] = False
            front[np.logical_and(fmask, front == 0)] = i + 1
            back[np.logical_and(bmask, back == 0)] = i + 1
            meta[name] = {"id": i + 1, "groups": info["groups"], "paths": info["paths"],
                          "frontPx": int(fmask.sum()), "backPx": int(bmask.sum())}
        b.close()

    out = {}
    for side, arr, x0, x1 in (("front", front, 0, SPLIT), ("back", back, SPLIT, SRC)):
        sub = arr[:, x0:x1]
        ys, xs = np.nonzero(sub)
        if len(ys) == 0:
            continue
        # Crop to the figure so the atlas maps onto the body's own extents,
        # with a small margin so edge regions are not clipped.
        pad = 8
        y0, y1 = max(0, ys.min() - pad), min(sub.shape[0], ys.max() + pad + 1)
        cx0, cx1 = max(0, xs.min() - pad), min(sub.shape[1], xs.max() + pad + 1)
        crop = sub[y0:y1, cx0:cx1]
        # NEAREST throughout - any interpolation would invent region IDs that
        # do not exist between two real ones.
        img = Image.fromarray(crop, mode="L").resize((ATLAS_W, ATLAS_H), Image.NEAREST)
        path = EXPORTS / f"{out_prefix}-{side}-idmap.png"
        img.save(path)
        out[side] = {"file": path.name,
                     "cropInSvg": [int(x0 + cx0), int(y0), int(x0 + cx1), int(y1)],
                     "atlas": [ATLAS_W, ATLAS_H],
                     "idsPresent": sorted(int(v) for v in np.unique(np.array(img)) if v)}
    return meta, out


if __name__ == "__main__":
    manifest = {"regions": REGIONS, "encoding": "R channel = index+1, 0 = none",
                "filtering": "NEAREST required", "sheets": {}}
    for svg_name, prefix in (("anatomy.svg", "hunter-male"),
                             ("anatomy-female.svg", "hunter-female")):
        src = REPO / svg_name
        if not src.exists():
            print("missing", src); continue
        meta, out = bake(src, prefix)
        manifest["sheets"][prefix] = {"source": svg_name, "atlases": out, "regions": meta}
        got = sum(1 for r in REGIONS if meta.get(r, {}).get("frontPx", 0)
                  or meta.get(r, {}).get("backPx", 0))
        print(f"{svg_name:22} -> {got}/21 regions baked")
        for r in REGIONS:
            m = meta.get(r, {})
            if not (m.get("frontPx") or m.get("backPx")):
                print(f"    !! EMPTY: {r}")
    (EXPORTS / "hunter-regions.json").write_text(json.dumps(manifest, indent=1))
    print("manifest ->", EXPORTS / "hunter-regions.json")
