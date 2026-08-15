"""Shaped-primitive region classifier.

Evaluates the superquadric definitions in region_shapes.json against measured
anchors and local frames. Bilateral rules are written once and mirrored.

Imported by bake_uv_regions.py after landmarks and part masks are computed.
"""
import json
import numpy as np


def build_frames(ctx):
    """Local coordinate frames and named anchors, all measured from the mesh."""
    X, Y, Z = ctx["X"], ctx["Y"], ctx["Z"]
    LM, H, ground = ctx["LM"], ctx["H"], ctx["ground"]
    FRONT = ctx["FRONT_SIGN"]
    thw = ctx["torso_hw_at"]

    def zf(frac):
        return ground + H * frac

    A = {}
    # torso anchors: (x_offset_in_TW, y_depth_sign, z_height)
    nip, sh, wa, cr = LM["nipple"], LM["shoulder"], LM["waist"], LM["crotch"]
    A["pec_upper"]  = (0.50, +1, nip + (sh - nip) * 0.62)
    A["pec_mid"]    = (0.54, +1, nip + (sh - nip) * 0.10)
    A["pec_low"]    = (0.50, +1, nip - (nip - wa) * 0.35)
    A["trap_c"]     = (0.26, -1, sh - (sh - nip) * 0.15)
    A["scapula_c"]  = (0.30, -1, nip + (sh - nip) * 0.40)
    A["lat_top"]    = (0.68, -1, nip + (sh - nip) * 0.06)
    A["erector_c"]  = (0.26, -1, wa - (wa - cr) * 0.30)
    # three ab blocks tiling pec-insertion -> pubis without gaps
    A["abs_1"]      = (0.00, +1, nip - (nip - cr) * 0.28)
    A["abs_2"]      = (0.00, +1, nip - (nip - cr) * 0.56)
    A["abs_3"]      = (0.00, +1, nip - (nip - cr) * 0.84)
    A["oblique_c"]  = (0.78, +1, nip - (nip - cr) * 0.55)
    A["glute_c"]    = (0.50, -1, cr + (wa - cr) * 0.30)

    frames = {"torso": {"anchors": A, "hw": thw}}

    # limb frames, per side, from the measured joints
    frames["arm"] = {}
    frames["leg"] = {}
    for sgn in (+1, -1):
        j = ctx["joint_c"].get(sgn)
        if j is None:
            continue
        ax = ctx["arm_axis"][sgn]
        L = ctx["arm_len"][sgn]
        # perpendicular basis: v anterior, w the remaining perpendicular
        v = np.array([0.0, -FRONT, 0.0])
        v = v - ax * float(v @ ax)
        v /= max(np.linalg.norm(v), 1e-9)
        w = np.cross(ax, v)
        frames["arm"][sgn] = {
            "o": {"shoulder_joint": j,
                  "elbow": j + ax * (L * ctx["elbow_t"]),
                  "wrist": j + ax * (L * ctx["wrist_t"])},
            "u": ax, "v": v, "w": w,
            "len": {"AL": L,
                    "AU": L * ctx["elbow_t"],
                    "AF": L * (ctx["wrist_t"] - ctx["elbow_t"]),
                    "AR": ctx["arm_r"] * 2.35},
        }
        hipx = ctx["hip_x"] * sgn
        hip = np.array([hipx, 0.0, LM["crotch"]])
        knee = np.array([hipx, 0.0, LM["knee"]])
        ankle = np.array([hipx, 0.0, LM["ankle"]])
        down = np.array([0.0, 0.0, -1.0])
        lv = np.array([0.0, -FRONT, 0.0])
        lw = np.cross(down, lv)
        frames["leg"][sgn] = {
            "o": {"hip_joint": hip, "knee": knee, "ankle": ankle},
            "u": down, "v": lv, "w": lw,
            "len": {"LU": float(LM["crotch"] - LM["knee"]),
                    "LL": float(LM["knee"] - LM["ankle"]),
                    "LR": ctx["leg_r"]},
        }
    return frames


def superquad(u, v, w, ru, rv, rw, p, taper, shear, u0, u1, mode):
    """Superquadric for SURFACE selection.

    A solid test is wrong here: a point on a limb's surface already sits at
    radius ~1 in both cross-section axes, so summing the longitudinal term with
    them leaves no budget and rejects almost everything. Longitudinal extent is
    therefore a gate, and the shape is an ellipse in the remaining two axes.

      mode 'surface' (torso) : gate none, ellipse in (u lateral, w vertical),
                               depth free - the normal test picks the face.
      mode 'segment' (limb)  : gate u along the bone, ellipse in (v, w).
    """
    t_ = np.clip((u - u0) / max(u1 - u0, 1e-9), 0.0, 1.0)
    s = taper + (1.0 - taper) * (1.0 - t_)
    if mode == "segment":
        gate = (u >= u0) & (u <= u1)
        b = np.abs(v - shear * (u - u0)) / np.maximum(rv * s, 1e-9)
        c = np.abs(w) / np.maximum(rw * s, 1e-9)
        return gate & (b ** p + c ** p <= 1.0)
    a = np.abs(u) / np.maximum(ru * s, 1e-9)
    c = np.abs(w - shear * u) / np.maximum(rw * s, 1e-9)
    return a ** p + c ** p <= 1.0


def classify(ctx, shapes_path):
    """Assign region ids by evaluating every shaped primitive in priority order."""
    defs = json.load(open(shapes_path))["regions"]
    defs.sort(key=lambda r: r["priority"])
    co, nrm = ctx["co"], ctx["nrm"]
    X, Y, Z = ctx["X"], ctx["Y"], ctx["Z"]
    FRONT = ctx["FRONT_SIGN"]
    frames = build_frames(ctx)
    region = np.zeros(len(co), dtype=np.uint8)

    EX = {"arm": ctx["is_arm"], "leg": ctx["is_leg"], "hand": ctx["is_hand"],
          "torso": ctx["is_torso"], "deltoid": ctx["is_deltoid"], "head": ctx["is_head"]}
    ny = nrm[:, 1] * FRONT
    nx = nrm[:, 0]
    side_masks = {
        "front": ny > 0.20, "back": ny < -0.20,
        "lateral": (np.abs(ny) <= 0.45) & (np.abs(nx) > 0.45),
        "any": np.ones(len(co), dtype=bool),
    }
    report = {}

    for r in defs:
        got = np.zeros(len(co), dtype=bool)
        for sgn in (+1, -1):
            if r["frame"] == "torso":
                A = frames["torso"]["anchors"][r["anchor"]]
                axf, depth, z = A
                axf = r.get("anchor_axf", axf)
                hw = frames["torso"]["hw"](z)
                cx = axf * hw * sgn
                u = (X - cx) * sgn                       # outward-positive
                # Depth is deliberately unconstrained on torso primitives: the
                # front/back normal test already picks the correct surface, and
                # constraining depth from the midline clipped the shape to a
                # slab that either swallowed everything or nothing.
                v = np.zeros_like(Z)
                w = Z - z
                ru, rv, rw = [s * hw for s in r["shape"]]
                rv = np.inf
                got |= superquad(u, v, w, ru, rv, rw, r["p"], r["taper"],
                                 r["shear"], -ru, ru, "surface") & (np.sign(X) == sgn)
            else:
                F = frames[r["frame"]].get(sgn)
                if F is None:
                    continue
                o = F["o"][r["anchor"]]
                L = F["len"][r["scale"]]
                d = co - o
                u = d @ F["u"]; v = d @ F["v"]; w = d @ F["w"]
                u0, u1 = r["u"][0] * L, r["u"][1] * L
                rad = F["len"].get("AR", L * 0.2) if r["frame"] == "arm" else F["len"]["LR"]
                ru, rv, rw = r["shape"][0] * L, r["shape"][1] * rad, r["shape"][2] * rad
                # generous cross-section: we are selecting the surface shell
                got |= superquad(u, v, w, ru, rv * 1.25, rw * 1.25, r["p"],
                                 r["taper"], r["shear"], u0, u1, "segment")                        & (np.sign(X) == sgn)

        got &= ctx["is_body"] & side_masks.get(r["side"], side_masks["any"])
        for ex in r.get("excludes", []):
            if ex in EX:
                got &= ~EX[ex]
        got &= (region == 0)                             # explicit precedence
        region[got] = r["id"]
        report[r["id"]] = {"name": r["name"], "verts": int(got.sum()),
                           "priority": r["priority"], "confidence": r["confidence"]}
    return region, report
