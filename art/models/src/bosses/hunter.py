# The Hunter: the player's body, seen from behind in the opening. A bare athletic build, V-tapered,
# in a long torn cloak, so the silhouette carries the player's muscle. HUNTER_MASS picks the build
# (lean 0.8, athletic 1.0, heavy 1.2); HUNTER_WAIST the core.
# Its clip: a walk toward the gate.
#   HUNTER_MASS=1.0 python3.11 hunter.py [--bake] [--tex 1024] [--out ../../hunter.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *

reset(81)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'hunter.glb'))
MASS = float(os.environ.get('HUNTER_MASS', '1.0'))
WAIST = float(os.environ.get('HUNTER_WAIST', '0.9'))

J = {'pelvis': V((0, 0.01, 1.0)), 'waist': V((0, 0.015, 1.15)), 'chest': V((0, 0.0, 1.35)), 'upchest': V((0, 0.01, 1.48)),
     'neck': V((0, -0.02, 1.58)), 'head': V((0, -0.03, 1.67)), 'crown': V((0, -0.03, 1.78))}
mirrored(J, {'shoulder': (0.25, 0.015, 1.48), 'elbow': (0.33, 0.04, 1.17), 'wrist': (0.36, 0.0, 0.9), 'knuckle': (0.37, -0.01, 0.8),
             'hip': (0.1, 0.01, 0.98), 'knee': (0.12, -0.03, 0.54), 'ankle': (0.13, 0.03, 0.08), 'toe': (0.14, -0.13, 0.02)})
H = J['head']
BONES = human_bones()

body, hands, src, FIELDS, shell = armoured_body(J, mass=MASS, waist=WAIST, hands='human')

def build_gear():
    P = {'hands': hands}
    # no cloak: the back is bare so the build reads from behind
    # a bare head: skull, jaw and a short crop of hair, so the head reads from behind
    sk = blob(H + V((0, 0.005, 0.015)), (0.078, 0.092, 0.095), seg=(24, 16))
    jw = blob(H + V((0, -0.035, -0.045)), (0.058, 0.06, 0.05), seg=(20, 12))
    hair = blob(H + V((0, 0.02, 0.04)), (0.083, 0.092, 0.083), seg=(24, 16))
    P['head'] = join([sk, jw, hair], 'head'); smooth_shade(P['head'])
    P['collar'] = cloth('collar', 24, 6, lambda u, t: (u * (0.1 + t * 0.14), J['neck'].y + 0.03 + t * 0.04, J['neck'].z + 0.02 - t * 0.08), thick=0.012)
    P['belt'] = plate(shell, 'belt', lambda p: 1.0 < p.z < 1.06 and abs(p.x) < 0.25, push=0.02, thick=0.016, smooth=3, facets=0.1, rim=0.008, rivets=0.0)
    return P

gear = build_gear()
cleanup(src, shell)

def part_info(name):
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'leather', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name == 'head': return 'mail', ('rigid', 'head')
    if name == 'collar': return 'cloth', ('smooth', {'neck', 'chest', 'spine'})
    if name == 'belt': return 'leather', ('rigid', 'hips')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name == 'hands': return 2000
    if name == 'head': return 900
    return min(tris, 500)

MATS, FLAT = knight_mats(accent=(0.2, 0.5, 1.0), paint=(0.02, 0.02, 0.03),
                         cloth=[(0.0, (0.012, 0.012, 0.018)), (0.5, (0.008, 0.009, 0.013)), (1.0, (0.006, 0.006, 0.01))])

def idle(t):
    return idle_pose(t, T=4.0, k=0.5)

def walk(t):
    s = math.sin(TAU * t); c = math.cos(TAU * t)
    p = fade_idle(idle(t), 0.4)
    p = posed(p, thigh_L=(0.55 * s, 0, 0), thigh_R=(-0.55 * s, 0, 0), shin_L=(0.7 * max(0, -s), 0, 0), shin_R=(0.7 * max(0, s), 0, 0),
              upperarm_L=(-0.4 * s, 0, 0), upperarm_R=(0.4 * s, 0, 0), spine=(0.03, 0, 0.05 * s), chest=(0, 0.06 * s, 0))
    p['_hips_loc'] = (0, 0.03 * abs(c), 0)
    return p

parts = {'body_high': body, **gear}
finish('Hunter', OUT, J, BONES, parts, {}, part_info, MATS, FLAT, tri_target, (0.2, 0.5, 1.0),
       idle=idle, roar=idle, clips=[('Walk', 30, walk)], mid=0.06, emit_strength=0.0, uv_weight=lambda n: 1.0)
