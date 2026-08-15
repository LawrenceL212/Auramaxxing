"""Rasterise per-triangle region IDs into the body's own UV space.

Produces an exact-integer region-ID texture:
    R channel: 0 = unassigned, 1..21 = canonical region

Flat-fills each UV triangle with its region id - no interpolation, no filtering,
no colour management. Followed by a bounded nearest-neighbour pad so that
rasterisation seams between adjacent triangles do not leave hairline gaps.

Run: python rasterize_uv.py --in regions-male.npz --out hunter-male-regions.png
"""
import argparse, json, pathlib
import numpy as np
from PIL import Image

REGION_NAMES = [
    "Upper Chest", "Middle Chest", "Lower Chest",
    "Front Shoulders", "Lateral Shoulders", "Rear Shoulders",
    "Traps", "Lats", "Upper Back", "Lower Back",
    "Biceps", "Triceps", "Forearms",
    "Upper Abs", "Middle Abs", "Lower Abs", "Obliques",
    "Glutes", "Hamstrings", "Quads", "Calves",
]


def raster(uv, rid, size):
    """Flat-fill UV triangles with their integer region id."""
    img = np.zeros((size, size), dtype=np.uint8)
    # UV origin is bottom-left; image origin is top-left.
    P = np.empty_like(uv)
    P[..., 0] = uv[..., 0] * (size - 1)
    P[..., 1] = (1.0 - uv[..., 1]) * (size - 1)

    for tri, r in zip(P, rid):
        if r == 0:
            continue
        x0 = max(int(np.floor(tri[:, 0].min())), 0)
        x1 = min(int(np.ceil(tri[:, 0].max())), size - 1)
        y0 = max(int(np.floor(tri[:, 1].min())), 0)
        y1 = min(int(np.ceil(tri[:, 1].max())), size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs = np.arange(x0, x1 + 1)
        ys = np.arange(y0, y1 + 1)
        gx, gy = np.meshgrid(xs + 0.5, ys + 0.5)
        ax, ay = tri[0]; bx, by = tri[1]; cx, cy = tri[2]
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        w2 = 1.0 - w0 - w1
        # small negative tolerance: conservative coverage, avoids seam pinholes
        m = (w0 >= -0.004) & (w1 >= -0.004) & (w2 >= -0.004)
        if m.any():
            sub = img[y0:y1 + 1, x0:x1 + 1]
            sub[m & (sub == 0)] = r
    return img


def pad(img, iters):
    """Nearest-neighbour dilation into unassigned pixels, bounded.

    Standard UV padding: closes hairline seams left by rasterisation without
    inventing region area far from the islands.
    """
    out = img.copy()
    for _ in range(iters):
        empty = out == 0
        if not empty.any():
            break
        filled = np.zeros_like(out)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = np.roll(np.roll(out, dy, axis=0), dx, axis=1)
            take = empty & (filled == 0) & (n > 0)
            filled[take] = n[take]
        out[filled > 0] = filled[filled > 0]
    return out


def components(mask):
    """Count 4-connected components without scipy."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    n = 0
    idx = np.argwhere(mask)
    lookup = set(map(tuple, idx))
    for start in map(tuple, idx):
        if seen[start]:
            continue
        n += 1
        stack = [start]
        seen[start] = True
        while stack:
            y, x = stack.pop()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p = (y + dy, x + dx)
                if p in lookup and not seen[p]:
                    seen[p] = True
                    stack.append(p)
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--padpx", type=int, default=3)
    a = ap.parse_args()

    d = np.load(a.src)
    uv, rid = d["uv"], d["rid"]
    print(f"[UV] {len(rid)} triangles carrying a region")

    raw = raster(uv, rid, a.size)
    img = pad(raw, a.padpx)

    Image.fromarray(img, mode="L").save(a.dst)
    print(f"[UV] wrote {a.dst} ({a.size}x{a.size})")

    vals = sorted(int(v) for v in np.unique(img))
    bad = [v for v in vals if v and (v < 1 or v > 21)]
    print(f"[UV] distinct values: {vals}")
    print(f"[UV] out-of-range (interpolation artefacts): {bad or 'NONE'}")

    report = {"size": a.size, "pad": a.padpx, "regions": {}}
    total = int((img > 0).sum())
    for i, name in enumerate(REGION_NAMES, start=1):
        m = img == i
        px = int(m.sum())
        entry = {"id": i, "pixels": px,
                 "pctOfAssigned": round(100.0 * px / max(total, 1), 2)}
        if px:
            ys, xs = np.nonzero(m)
            entry["bbox"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
            if px < 40000:
                entry["components"] = components(m)
        report["regions"][name] = entry
        flag = "" if px else "   <-- EMPTY"
        print(f"[UV] {i:2} {name:19} {px:7} px  "
              f"{entry.get('components', '-'):>4} comp{flag}")
    report["assignedPixels"] = total
    report["coveragePct"] = round(100.0 * total / (a.size * a.size), 2)
    pathlib.Path(a.dst).with_suffix(".json").write_text(json.dumps(report, indent=1))
    print(f"[UV] assigned {total} px ({report['coveragePct']}% of the sheet)")
