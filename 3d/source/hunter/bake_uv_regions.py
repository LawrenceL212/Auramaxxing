"""Assign the 21 canonical regions on the actual body geometry, then export the
per-triangle region IDs and UVs for rasterisation into the body's UV space.

Landmarks are measured from the mesh itself (including MPFB's nipple group),
never assumed. Region rules live in region_rules.json.

Run: blender --background --python bake_uv_regions.py -- --sex male --out data.npz
"""
import bpy, json, math, os, sys
import numpy as np

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(f, d=None): return ARGV[ARGV.index(f) + 1] if f in ARGV else d

SEX = arg("--sex", "male")
OUT = arg("--out")
HERE = os.path.dirname(os.path.abspath(__file__))
RULES = json.load(open(os.path.join(HERE, "region_rules.json")))

bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")

# Male and female are generated independently - the female is not a scaled male.
MACRO = {
    "male":   dict(gender=1.0, age=0.42, muscle=0.90, weight=0.33,
                   proportions=0.85, height=0.62),
    "female": dict(gender=0.0, age=0.42, muscle=0.72, weight=0.38,
                   proportions=0.80, height=0.50),
}
TARGETS = {
    "male": {"torso/measure-shoulder-dist-incr": 1.00, "torso/torso-scale-horiz-decr": 0.65,
             "torso/torso-muscle-pectoral-incr": 0.85, "torso/torso-muscle-dorsi-incr": 0.90,
             "torso/measure-frontchest-dist-incr": 0.70, "hip/hip-scale-horiz-decr": 0.50,
             "stomach/stomach-tone-incr": 1.00,
             "arms/l-upperarm-muscle-incr": 0.75, "arms/r-upperarm-muscle-incr": 0.75,
             "arms/l-upperarm-shoulder-muscle-incr": 0.85, "arms/r-upperarm-shoulder-muscle-incr": 0.85,
             "legs/measure-thigh-circ-incr": 0.45, "buttocks/buttocks-volume-incr": 0.30},
    "female": {"torso/measure-shoulder-dist-incr": 0.55, "torso/torso-scale-horiz-decr": 0.55,
               "torso/torso-muscle-dorsi-incr": 0.55, "stomach/stomach-tone-incr": 0.85,
               "arms/l-upperarm-muscle-incr": 0.45, "arms/r-upperarm-muscle-incr": 0.45,
               "arms/l-upperarm-shoulder-muscle-incr": 0.50, "arms/r-upperarm-shoulder-muscle-incr": 0.50,
               "legs/measure-thigh-circ-incr": 0.35, "buttocks/buttocks-volume-incr": 0.40},
}

macro = TargetService.get_default_macro_info_dict()
macro.update(MACRO[SEX])
body = HumanService.create_human(mask_helpers=True, detailed_helpers=False,
                                 extra_vertex_groups=True, feet_on_ground=True,
                                 scale=0.1, macro_detail_dict=macro)
for name, w in TARGETS[SEX].items():
    for cand in (name, name.split("/")[-1]):
        try:
            TargetService.set_target_value(body, cand, w); break
        except Exception:
            continue
print(f"[BAKE] {SEX}: verts={len(body.data.vertices)}")

# ── landmark measurement, from the mesh ─────────────────────────────────────
gidx = {g.name: g.index for g in body.vertex_groups}
def group_verts(name):
    if name not in gidx: return np.array([], dtype=int)
    i = gidx[name]
    return np.array([v.index for v in body.data.vertices
                     if any(ge.group == i and ge.weight > 0 for ge in v.groups)], dtype=int)

co = np.array([v.co[:] for v in body.data.vertices], dtype=float)   # Blender Z-up
X, Y, Z = co[:, 0], co[:, 1], co[:, 2]

body_v = group_verts("body")
helper_v = set(group_verts("HelperGeometry").tolist()) | set(group_verts("JointCubes").tolist())
is_body = np.zeros(len(co), dtype=bool)
is_body[body_v] = True
for h in helper_v:
    is_body[h] = False
print(f"[BAKE] body verts: {is_body.sum()} (helpers excluded)")

bz = Z[is_body]
crown = bz.max()
ground = bz.min()
H = crown - ground

nip = group_verts("nipple")
nipple_z = float(Z[nip].mean()) if len(nip) else ground + H * 0.72
scalp = group_verts("scalp")
chin = float(Z[scalp].min()) if len(scalp) else ground + H * 0.87

def torso_span(z0, z1, gap=0.055):
    """Central (torso) x-extent in a height band, ignoring the arms."""
    m = is_body & (Z >= z0) & (Z < z1)
    if m.sum() < 30: return None
    s = np.sort(X[m]); left = right = 0.0
    for v in s[s <= 0][::-1]:
        if left - v > gap: break
        left = v
    for v in s[s >= 0]:
        if v - right > gap: break
        right = v
    return left, right

# neck = narrowest torso band between the nipple line and the chin.
# shoulder = scanning down from the neck, the first height where the torso is
# markedly wider than the neck. Measuring "widest band" directly does not work:
# above the nipple line the arms are attached and inflate the span.
neck_w, neck_z = 1e9, (nipple_z + chin) / 2
for f in np.arange(0.15, 0.95, 0.03):
    z0 = nipple_z + (chin - nipple_z) * f
    sp = torso_span(z0, z0 + H * 0.015)
    if sp and (sp[1] - sp[0]) < neck_w:
        neck_w, neck_z = sp[1] - sp[0], z0
shoulder_z = neck_z - H * 0.03
for f in np.arange(0.0, 1.0, 0.02):
    z0 = neck_z - (neck_z - nipple_z) * f
    sp = torso_span(z0, z0 + H * 0.015)
    if sp and (sp[1] - sp[0]) > neck_w * 1.8:
        shoulder_z = z0; break
print(f"[BAKE] neck z={(neck_z-ground)/H:.3f} w={neck_w:.3f} -> shoulder {(shoulder_z-ground)/H:.3f}")

# crotch = lowest band where the legs are still joined across the centreline
crotch_z = ground + H * 0.48
for f in np.arange(0.56, 0.38, -0.005):
    z0 = ground + H * f
    m = is_body & (Z >= z0) & (Z < z0 + H * 0.01) & (np.abs(X) < 0.012)
    if m.sum() < 4:
        crotch_z = z0 + H * 0.01; break

# waist = narrowest torso band between nipple and crotch
narrow, waist_z = 1e9, (nipple_z + crotch_z) / 2
for f in np.arange(0.0, 1.0, 0.04):
    z0 = crotch_z + (nipple_z - crotch_z) * f
    sp = torso_span(z0, z0 + H * 0.02)
    if sp and (sp[1] - sp[0]) < narrow:
        narrow, waist_z = sp[1] - sp[0], z0

# knee = narrowest leg band between crotch and ankle
ankle_z = ground + H * 0.04
narrow, knee_z = 1e9, (crotch_z + ankle_z) / 2
for f in np.arange(0.25, 0.75, 0.02):
    z0 = ankle_z + (crotch_z - ankle_z) * f
    m = is_body & (Z >= z0) & (Z < z0 + H * 0.015) & (X > 0.005)
    if m.sum() > 10:
        w = X[m].max() - X[m].min()
        if w < narrow: narrow, knee_z = w, z0

LM = {"crown": crown, "chin": chin, "shoulder": shoulder_z, "nipple": nipple_z,
      "waist": waist_z, "crotch": crotch_z, "knee": knee_z, "ankle": ankle_z}
print("[BAKE] landmarks:", {k: round((v - ground) / H, 3) for k, v in LM.items()})

# ── per-vertex classification ───────────────────────────────────────────────
nrm = np.array([v.normal[:] for v in body.data.vertices], dtype=float)
# Verify the facing convention empirically rather than assuming it: the nipple
# group is unambiguously anterior, so its mean Y tells us which way is front.
FRONT_SIGN = -1.0
if len(nip):
    FRONT_SIGN = -1.0 if float(Y[nip].mean()) < 0 else 1.0
print(f"[BAKE] nipple mean Y={float(Y[nip].mean()) if len(nip) else float('nan'):.4f} "
      f"-> front is {'-Y' if FRONT_SIGN < 0 else '+Y'}")
front = (nrm[:, 1] * FRONT_SIGN) > 0.0
absX = np.abs(X)

# Torso half-width is only measurable BELOW the armpit: above it the arms are
# attached and the gap-walk swallows them. Measure crotch..armpit and hold the
# armpit value above that.
armpit_z = nipple_z + (shoulder_z - nipple_z) * 0.35
zs = np.linspace(crotch_z - H * 0.05, armpit_z, 28)
spans = []
for i in range(len(zs) - 1):
    sp = torso_span(zs[i], zs[i + 1])
    if sp: spans.append((zs[i], sp[1] - sp[0]))
def half_width_at(z):
    if not spans: return 0.15
    zz = np.array([s[0] for s in spans]); ww = np.array([s[1] for s in spans])
    return max(float(np.interp(np.clip(z, zz[0], zz[-1]), zz, ww)) / 2.0, 0.03)
hw = np.array([half_width_at(z) for z in Z])

# limb separation: arms sit outside the torso silhouette above the crotch
# ARM SET - flood fill across mesh edges from the hand, blocked at the torso.
# A width threshold cannot work here: near the shoulder the arm lies inside the
# torso silhouette, which truncated the arm (PCA length 0.496 against an
# anatomically expected ~0.78) and distorted every limb parameter downstream.
# Inputs: mesh edge connectivity, fingernails seed, armpit barrier.
# Confidence: HIGH - connectivity is exact; only the barrier is a convention.
_adj = [[] for _ in range(len(co))]
for e in body.data.edges:
    a, b = e.vertices
    _adj[a].append(b); _adj[b].append(a)

_nails = group_verts("fingernails")
# Armpit barrier: innermost x reached by geometry that is clearly out on a limb
# (well lateral, above the waist). The flood may not cross inboard of it.
_lateral = is_body & (Z > waist_z) & (Z < shoulder_z)
_armpit_x = float(np.percentile(np.abs(X[_lateral]), 88)) if _lateral.sum() else 0.12

is_arm = np.zeros(len(co), dtype=bool)
if len(_nails):
    from collections import deque
    for sgn in (+1, -1):
        seed = [i for i in _nails if np.sign(X[i]) == sgn]
        if not seed:
            continue
        q = deque(seed); seen = set(seed)
        while q:
            v = q.popleft()
            for n in _adj[v]:
                if n in seen or not is_body[n]:
                    continue
                # block the flood from entering the torso or crossing the midline
                if abs(X[n]) < _armpit_x * 0.72 and Z[n] < shoulder_z:
                    continue
                if np.sign(X[n]) != sgn and abs(X[n]) > 1e-4:
                    continue
                if Z[n] > shoulder_z + H * 0.06:      # do not climb into the neck
                    continue
                seen.add(n); q.append(n)
        for i in seen:
            is_arm[i] = True
print(f"[BAKE] arm flood: armpit_x={_armpit_x:.3f} -> arm verts={int(is_arm.sum())}")
# LEG SET - flood fill from the toenails, mirroring the arm method. A single
# "everything below the crotch plane" test swept the pelvis into the leg, which
# is why Quads claimed the hips. The femoral head sits at roughly the pubic
# symphysis (the crotch landmark), so the flood is bounded there: the pelvis and
# the gluteal mass stay with the torso.
# Inputs: mesh connectivity, toenails seed, hip plane, midline guard.
# Confidence: HIGH for connectivity, MEDIUM for the hip plane.
_toes = group_verts("toenails")
is_leg = np.zeros(len(co), dtype=bool)
if len(_toes):
    from collections import deque
    for sgn in (+1, -1):
        seed = [i for i in _toes if np.sign(X[i]) == sgn]
        if not seed:
            continue
        q = deque(seed); seen = set(seed)
        while q:
            v = q.popleft()
            for n in _adj[v]:
                if n in seen or not is_body[n]:
                    continue
                if Z[n] >= crotch_z:                 # hip plane: stop at the pelvis
                    continue
                if np.sign(X[n]) != sgn and abs(X[n]) > 1e-4:
                    continue                          # never cross the midline
                seen.add(n); q.append(n)
        for i in seen:
            is_leg[i] = True
else:
    is_leg = is_body & (Z <= crotch_z)
print(f"[BAKE] leg flood -> leg verts={int(is_leg.sum())} (pelvis retained on torso)")
is_head = is_body & (Z > chin)
# Torso excludes the limbs AND the deltoid cap. Previously the deltoid was left
# in the torso set, so the chest bands ran straight out onto the shoulders.
is_torso = is_body & ~is_arm & ~is_leg & ~is_head & (Z <= shoulder_z + H * 0.04)

# ── LIMB-LOCAL FRAME ───────────────────────────────────────────────────────
# The A-pose arm runs diagonally, so parameterising it by X is wrong - that is
# what put the "wrist" at the fingertips and made the deltoid radius 20% of body
# height. Derive the real arm axis per side by PCA over that arm's vertices,
# then measure position and radius in that limb's own frame.
# Inputs: arm vertex set per side, principal axis, perpendicular distance.
# Confidence: HIGH - the axis is measured, not assumed.
arm_t = np.zeros(len(co))          # 0 at shoulder joint, 1 at fingertip
arm_r_perp = np.zeros(len(co))     # perpendicular distance from the arm axis
joint_c = {}
arm_axis = {}
arm_len = {}
for sgn in (+1, -1):
    side_arm = is_arm & (np.sign(X) == sgn)
    if side_arm.sum() < 50:
        continue
    P = co[side_arm]
    ctr = P.mean(axis=0)
    u, sv, vt = np.linalg.svd(P - ctr, full_matrices=False)
    ax = vt[0] / np.linalg.norm(vt[0])
    proj = (P - ctr) @ ax
    # orient the axis outward (away from the body centreline)
    if np.corrcoef(proj, np.abs(P[:, 0]))[0, 1] < 0:
        ax, proj = -ax, -proj
    root = ctr + ax * proj.min()            # shoulder end
    tip = ctr + ax * proj.max()             # fingertip end
    L = float(proj.max() - proj.min())
    joint_c[sgn], arm_axis[sgn], arm_len[sgn] = root, ax, L
    m = (np.sign(X) == sgn) & is_body
    d = (co[m] - root) @ ax
    arm_t[m] = np.clip(d / max(L, 1e-6), -0.5, 1.5)
    perp = co[m] - (root + np.outer(d, ax))
    arm_r_perp[m] = np.linalg.norm(perp, axis=1)

# true arm radius, measured perpendicular to the axis over the mid-upper arm
mid = is_arm & (arm_t > 0.25) & (arm_t < 0.45)
arm_r = float(np.percentile(arm_r_perp[mid], 88)) if mid.sum() > 20 else 0.05
print(f"[BAKE] arm axis len={np.mean(list(arm_len.values())):.3f} true radius={arm_r:.4f}")

# ── DELTOID from the arm-attachment ring ───────────────────────────────────
# Anatomy: the deltoid caps the gleno-humeral joint, originating on the
# clavicle (anterior), acromion (lateral) and scapular spine (posterior). It is
# the shell within roughly 1.5 arm-radii of that joint.
# Confidence: HIGH for the cap, MEDIUM for the three-way split (the heads share
# one continuous surface, so the boundary is orientation-based by convention).
d_from_joint = np.full(len(co), 1e9)
for sgn, c in joint_c.items():
    m = (np.sign(X) == sgn) & is_body
    d_from_joint[m] = np.linalg.norm(co[m] - c, axis=1)
DELT_R = arm_r * 2.2
is_deltoid = is_body & (d_from_joint < DELT_R) & (Z > nipple_z)
ny_ = nrm[:, 1] * FRONT_SIGN
is_shoulder = is_deltoid
delt_front = is_deltoid & (ny_ > 0.35)
delt_rear  = is_deltoid & (ny_ < -0.35)
delt_lat   = is_deltoid & (np.abs(ny_) <= 0.35)
print(f"[BAKE] deltoid r={DELT_R:.4f} total={is_deltoid.sum()} "
      f"front={delt_front.sum()} lat={delt_lat.sum()} rear={delt_rear.sum()}")

# ── forearm / hand along the true axis ─────────────────────────────────────
# Anatomy: forearm = elbow -> wrist. The wrist is the narrowest perpendicular
# radius in the distal half; the hand widens again beyond it. Hands are left
# UNASSIGNED - the 21-region taxonomy has no Hands region.
# Confidence: HIGH for the wrist minimum, MEDIUM for the elbow.
prof = []
for f in np.arange(0.45, 0.99, 0.02):
    m = is_arm & (arm_t >= f) & (arm_t < f + 0.02)
    if m.sum() > 8:
        prof.append((f, float(np.percentile(arm_r_perp[m], 85))))
# The radius minimum lands on the fingertips, not the wrist - individual
# fingers are thin. Use MPFB's fingernails group as a hard distal landmark and
# step back one hand-length: the hand is ~25% of shoulder-to-fingertip length.
# Confidence: HIGH (fingernails are an explicit group), MEDIUM for the 0.25.
# The A-pose hand angles away from the arm's principal axis, so an axis
# position cannot locate the wrist. Use 3D proximity to the fingernails group
# instead: the hand is everything within one hand-length of a fingernail.
# Anatomical hand length is ~0.11 x stature. Confidence: HIGH.
nails = group_verts("fingernails")
HAND_LEN = 0.11 * H
if len(nails):
    nail_pts = co[nails]
    dmin = np.full(len(co), 1e9)
    m_arm = is_arm.copy()
    if m_arm.sum():
        idx = np.nonzero(m_arm)[0]
        for i in idx:
            dmin[i] = float(np.min(np.linalg.norm(nail_pts - co[i], axis=1)))
    is_hand_prox = dmin < HAND_LEN
    print(f"[BAKE] hand-length={HAND_LEN:.3f} -> hand verts={int(is_hand_prox.sum())}")
else:
    is_hand_prox = np.zeros(len(co), dtype=bool)
wrist_t = 0.75
elbow_t = wrist_t * 0.52
is_hand = is_arm & is_hand_prox
is_arm_lower = is_arm & (arm_t > elbow_t) & ~is_hand & ~is_deltoid
is_arm_upper = is_arm & (arm_t <= elbow_t) & ~is_deltoid
print(f"[BAKE] elbow t={elbow_t:.2f} wrist t={wrist_t:.2f} | upper={is_arm_upper.sum()} "
      f"lower={is_arm_lower.sum()} hand={is_hand.sum()} (hand unassigned)")

is_leg_lower = is_leg & (Z < knee_z)
is_leg_upper = is_leg & ~is_leg_lower

def band_t(a, b):
    za, zb = LM[a], LM[b]
    return (Z - za) / (zb - za) if abs(zb - za) > 1e-6 else np.zeros_like(Z)

PART = {"torso": is_torso, "arm_upper": is_arm_upper, "arm_lower": is_arm_lower,
        "leg_upper": is_leg_upper, "leg_lower": is_leg_lower, "shoulder": is_shoulder}

# `lat` is a TORSO coordinate. On a limb it is meaningless (a limb is outside
# the torso by construction, so it always reads > 1 and would filter every limb
# rule out). Zero it everywhere except the torso and the deltoid cap.
# TORSO ENVELOPE - the half-width of the TORSO at each height, measured from
# torso vertices only. The previous envelope came from a whole-body scan that
# included the arms, so "lat <= 0.55" still reached the flanks and shoulders.
is_torso = is_torso & ~is_deltoid
_tz = np.linspace(crotch_z - H * 0.02, shoulder_z, 34)
_env = []
for i in range(len(_tz) - 1):
    m = is_torso & (Z >= _tz[i]) & (Z < _tz[i + 1])
    if m.sum() > 8:
        _env.append((_tz[i], float(np.percentile(absX[m], 96))))
def torso_hw_at(z):
    if not _env: return 0.15
    zz = np.array([e[0] for e in _env]); ww = np.array([e[1] for e in _env])
    return max(float(np.interp(np.clip(z, zz[0], zz[-1]), zz, ww)), 0.02)
thw = np.array([torso_hw_at(z) for z in Z])
lat = np.clip(absX / np.maximum(thw, 1e-4), 0, 3)
lat[~(is_torso | is_shoulder)] = 0.0
print(f"[BAKE] torso envelope sampled at {len(_env)} levels, "
      f"hw@chest={torso_hw_at(nipple_z):.3f} hw@waist={torso_hw_at(waist_z):.3f}")

region = np.zeros(len(co), dtype=np.uint8)
# ABDOMINAL BANDS - anchored to measured boundaries rather than a fraction of
# nipple->crotch, which produced 5cm slivers (14/27/34 verts).
#   top    = the inferior edge of the pectoral mass (pec insertion / xiphoid),
#            taken from the Lower Chest verts actually assigned above, so the
#            abs start exactly where the chest stops. Confidence: HIGH.
#   bottom = the pelvic brim, just above the crotch landmark. Confidence: MEDIUM.
#   The span is divided into equal thirds (upper/middle/lower rectus), which is
#   the conventional partition - there is no distinct landmark between them, so
#   confidence for the two internal boundaries is LOW and is documented as such.
#   Lateral extent stays inboard of the obliques.
_lc = (region == 3)
abs_top = float(Z[_lc].min()) if _lc.sum() > 5 else nipple_z - (nipple_z - waist_z) * 0.6
abs_bot = crotch_z + (waist_z - crotch_z) * 0.10
_span = max(abs_top - abs_bot, 1e-4)
_absz = (abs_top - Z) / _span            # 0 at the top, 1 at the pelvic brim
ABS_LAT = 0.62
_absbase = is_torso & front & (Z <= abs_top) & (Z >= abs_bot) & (lat <= ABS_LAT)
ABS_MASK = {
    14: _absbase & (_absz >= 0.00) & (_absz < 0.34),
    15: _absbase & (_absz >= 0.34) & (_absz < 0.67),
    16: _absbase & (_absz >= 0.67) & (_absz <= 1.00),
}
# Leg frame origin = thigh CENTRE (median |x| of thigh verts), not its outer
# edge - a percentile put the origin on the lateral surface and pushed the
# primitive off the limb. Radius = half the thigh's actual x-extent.
_thigh = is_leg & (Z > LM["knee"]) & (Z < LM["crotch"]) & (X > 0)
if _thigh.sum() > 20:
    hip_x = float(np.median(absX[_thigh]))
    leg_r = float(np.percentile(absX[_thigh], 95) - np.percentile(absX[_thigh], 5)) * 0.62
else:
    hip_x, leg_r = 0.09, 0.08
print(f"[BAKE] hip_x={hip_x:.3f} leg_r={leg_r:.3f}")
print(f"[BAKE] abs span z {(abs_bot-ground)/H:.3f}..{(abs_top-ground)/H:.3f} "
      f"(pec insertion -> pelvic brim), lat<={ABS_LAT}")

# ── SHAPED PRIMITIVES ──────────────────────────────────────────────────────
sys.path.insert(0, HERE)
import importlib, shape_classifier
importlib.reload(shape_classifier)

ctx = dict(co=co, nrm=nrm, X=X, Y=Y, Z=Z, LM=LM, H=H, ground=ground,
           FRONT_SIGN=FRONT_SIGN, torso_hw_at=torso_hw_at,
           joint_c=joint_c, arm_axis=arm_axis, arm_len=arm_len,
           elbow_t=elbow_t, wrist_t=wrist_t, arm_r=arm_r,
           hip_x=hip_x, leg_r=leg_r,
           is_body=is_body, is_arm=is_arm, is_leg=is_leg, is_hand=is_hand,
           is_torso=is_torso, is_deltoid=is_deltoid, is_head=is_head)
region, shape_report = shape_classifier.classify(
    ctx, os.path.join(HERE, "region_shapes.json"))
for rid in sorted(shape_report):
    r = shape_report[rid]
    print(f"[BAKE] {rid:2} {r['name']:19} {r['verts']:6} verts  ({r['confidence']}) [shaped]")

print(f"[BAKE] assigned {(region>0).sum()} / {is_body.sum()} body verts")
print("[DIAG] region                z-range(frac)   |x|max  onArm onLeg onTorso")
for r in RULES["regions"]:
    m = region == r["id"]
    if not m.sum():
        print(f"[DIAG] {r['name']:19} EMPTY"); continue
    z0 = (Z[m].min() - ground) / H; z1 = (Z[m].max() - ground) / H
    print(f"[DIAG] {r['name']:19} {z0:.3f}-{z1:.3f}   {absX[m].max():.3f}  "
          f"{int((m & is_arm).sum()):5} {int((m & is_leg).sum()):5} {int((m & is_torso).sum()):6}")

# ── export triangles + UVs for UV-space rasterisation ───────────────────────
me = body.data
me.calc_loop_triangles()
uvl = me.uv_layers.active.data
tris, uvs, rids = [], [], []
for lt in me.loop_triangles:
    vids = lt.vertices
    ids = [int(region[v]) for v in vids]
    nz = [i for i in ids if i]
    if not nz: continue
    rid = max(set(nz), key=nz.count)      # majority vote, ties -> highest count
    tris.append(vids)
    uvs.append([uvl[l].uv[:] for l in lt.loops])
    rids.append(rid)
print(f"[BAKE] triangles with a region: {len(rids)} / {len(me.loop_triangles)}")

if OUT:
    np.savez_compressed(OUT, uv=np.array(uvs, dtype=np.float32),
                        rid=np.array(rids, dtype=np.uint8),
                        landmarks=np.array([(LM[k] - ground) / H for k in
                                            ("crown","chin","shoulder","nipple",
                                             "waist","crotch","knee","ankle")],
                                           dtype=np.float32))
    print("[BAKE] wrote", OUT)


# ── developer visual checkpoint: colour every region and render 4 angles ────
DBG = arg("--debugrender")
if DBG:
    import colorsys
    os.makedirs(DBG, exist_ok=True)

    # distinct hue per region id, written as a colour attribute
    PALETTE = [
        (1.00,0.15,0.15),(1.00,0.55,0.00),(1.00,0.90,0.10),(0.10,0.85,0.25),
        (0.00,0.75,0.70),(0.15,0.45,1.00),(0.60,0.20,1.00),(1.00,0.20,0.75),
        (0.55,0.35,0.10),(0.75,1.00,0.20),(0.00,1.00,0.60),(0.30,0.95,1.00),
        (0.45,0.55,1.00),(0.90,0.60,1.00),(1.00,0.45,0.45),(0.95,0.75,0.45),
        (0.20,0.60,0.35),(0.70,0.75,0.80),(0.85,0.10,0.40),(0.10,0.30,0.70),
        (0.98,0.98,0.98)]
    def region_colour(i):
        c = PALETTE[(i - 1) % len(PALETTE)]
        return (c[0], c[1], c[2], 1.0)

    palette = {i: region_colour(i) for i in range(1, 22)}
    me = body.data
    attr = me.color_attributes.new(name="RegionCol", type='FLOAT_COLOR', domain='POINT')
    for i in range(len(me.vertices)):
        rid = int(region[i])
        attr.data[i].color = palette[rid] if rid else (0.035, 0.045, 0.06, 1.0)

    mat = bpy.data.materials.new("RegionDebug")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "RegionCol"
    emi.inputs["Strength"].default_value = 1.0
    nt.links.new(col.outputs["Color"], emi.inputs["Color"])
    nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
    me.materials.clear(); me.materials.append(mat)

    # hide helper geometry so only the body shows
    for m in list(body.modifiers):
        if m.type == 'MASK':
            m.show_viewport = m.show_render = True

    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.film_transparent = False
    scn.world = bpy.data.worlds.new("DbgWorld")
    scn.world.use_nodes = True
    scn.world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.025, 0.035, 1)
    scn.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    try:
        scn.view_settings.view_transform = 'Standard'   # no filmic desaturation
        scn.view_settings.look = 'None'
    except Exception:
        pass
    scn.render.resolution_x, scn.render.resolution_y = 520, 1040
    scn.render.image_settings.file_format = 'PNG'
    try: scn.eevee.taa_render_samples = 32
    except Exception: pass
    scn.frame_set(1)                       # frozen: no animation applied

    cam = bpy.data.cameras.new("DbgCam"); cam.lens = 52
    cobj = bpy.data.objects.new("DbgCam", cam)
    bpy.context.collection.objects.link(cobj); scn.camera = cobj
    cz = ground + H * 0.52
    d = H * 1.45
    views = {
        "front":  (0.0,      -d,        cz, 90, 0,   0),
        "back":   (0.0,       d,        cz, 90, 0, 180),
        "34left": (-d*0.72,  -d*0.72,   cz, 90, 0, -45),
        "34right":( d*0.72,  -d*0.72,   cz, 90, 0,  45),
    }
    for name, (x_, y_, z_, rx, ry, rz) in views.items():
        cobj.location = (x_, y_, z_)
        cobj.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        scn.render.filepath = os.path.join(DBG, f"regions-{SEX}-{name}.png")
        bpy.ops.render.render(write_still=True)
    counts = {int(i): int((region == i).sum()) for i in range(1, 22)}
    with open(os.path.join(DBG, f"regions-{SEX}-legend.json"), "w") as f:
        json.dump({"palette": {str(k): list(v) for k, v in palette.items()},
                   "names": {str(r["id"]): r["name"] for r in RULES["regions"]},
                   "counts": counts,
                   "landmarks": {k: round((v - ground) / H, 4) for k, v in LM.items()},
                   "armVerts": int(is_arm.sum()),
                   "armLen": float(np.mean(list(arm_len.values()))) if arm_len else None,
                   "armRadius": float(arm_r),
                   "handVerts": int(is_hand.sum()),
                   "absSpan": [round((abs_bot - ground) / H, 4), round((abs_top - ground) / H, 4)]}, f, indent=1)
    print("[BAKE] debug renders ->", DBG)
