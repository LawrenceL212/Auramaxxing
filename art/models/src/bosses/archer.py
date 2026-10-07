# The Cursed Archer (weekly boss): a gaunt, lean archer in black war-plate, every plate the shape of
# the muscle under it. Read from its shadow alone: a tall pointed hood-helm swept back to a spike with
# a single narrow burning visor, a huge recurve war-bow of black horn and steel taller than a man, a
# quiver of barbed arrows standing up behind the right shoulder, and a torn half-cape off the left.
# Its attack: an arrow nocked, the bow raised and drawn to the jaw (back straining), loosed, recoil.
#   python3.11 archer.py [--bake] [--tex 1024] [--out ../../archer.glb]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour import *
from mathutils import Quaternion, Euler

reset(83)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'archer.glb'))
GLOW = (0.9, 0.7, 0.0)

# gaunt: long limbs, narrow shoulders, a pinched waist
J = {'pelvis': V((0, 0.02, 1.86)), 'waist': V((0, 0.03, 2.1)), 'chest': V((0, 0.0, 2.43)), 'upchest': V((0, 0.02, 2.64)),
     'neck': V((0, -0.03, 2.82)), 'head': V((0, -0.05, 2.99)), 'crown': V((0, -0.04, 3.18))}
mirrored(J, {'shoulder': (0.47, 0.03, 2.63), 'elbow': (0.68, 0.1, 2.1), 'wrist': (0.79, -0.06, 1.61), 'knuckle': (0.82, -0.12, 1.44),
             'hip': (0.17, 0.02, 1.82), 'knee': (0.23, -0.07, 1.0), 'ankle': (0.26, 0.08, 0.14), 'toe': (0.3, -0.27, 0.04)})
H = J['head']
HB = human_bones()

# ── the bow's frame, in rest coordinates. The left fist hangs at the side; the bow passes through it
# across the fist, so at rest it lies front to back: its top limb points forward (-y), the string is
# above the fist (+z, toward the shoulder) and a nocked arrow points down along the forearm. Raised in
# the attack (the arm forward), the same frame stands the bow upright and points the arrow forward.
G = J['wrist.L'].lerp(J['knuckle.L'], 0.5)
AX, BX, CX = V((0, -1, 0)), V((0, 0, 1)), V((1, 0, 0))   # along the bow (to the top tip), to the string, across
def bw(a, b, c=0.0):
    return G + AX * a + BX * b + CX * c
BRACE = 0.2                     # the string's distance behind the grip
SHELF = bw(0.02, -0.02, 0.035)  # where the arrow rests on the riser
MREST = bw(0.0, BRACE, 0.035)   # the nock point on the string at rest

# ── the pose helpers: the same rotation convention as finish(), on a throwaway armature, so the draw
# can be solved: the string is pulled exactly to wherever the right hand ends up ──
def local_q(R, ex, ey, ez):
    q = Matrix.Rotation(ez, 4, 'Z').to_quaternion() @ Matrix.Rotation(ey, 4, 'Y').to_quaternion() @ Matrix.Rotation(ex, 4, 'X').to_quaternion()
    return R.inverted() @ q @ R

class FK:
    """A throwaway armature with finish()'s rotation convention: pose it, read back each bone's
    posed and rest matrices. Kept alive through the clips, so the attack can solve its draw per frame."""
    def __init__(self, bones):
        self.arm = bpy.data.armatures.new('fk'); self.rig = link(bpy.data.objects.new('fk', self.arm))
        activate(self.rig); bpy.ops.object.mode_set(mode='EDIT')
        eb = {}
        for b, h, t, par in bones:
            e = self.arm.edit_bones.new(b); e.head = J[h]; e.tail = J[t]
            if par: e.parent = eb[par]; e.use_connect = False
            eb[b] = e
        bpy.ops.object.mode_set(mode='OBJECT')
        self.rig.hide_render = True
    def __call__(self, pose):
        for pb in self.rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = local_q(pb.bone.matrix_local.to_quaternion(), *pose.get(pb.name, (0, 0, 0)))
        self.rig.pose.bones['hips'].location = V(pose.get('_hips_loc', (0, 0, 0)))
        bpy.context.view_layer.update()
        return {pb.name: (pb.matrix.copy(), pb.bone.matrix_local.copy()) for pb in self.rig.pose.bones}

def to_rest(M, bone, p):
    """A posed world point p, in the rest coordinates of `bone` (undo its pose)."""
    pm, rm = M[bone]
    return rm @ pm.inverted() @ p

def from_rest(M, bone, p):
    pm, rm = M[bone]
    return pm @ rm.inverted() @ p

# ── the draw pose: bow arm straight at the target, the body turned side-on, the right hand at the jaw ──
def draw_pose(base, k, back=0.0):
    """k: how far the bow is raised and drawn (0..1); back: the shoulder-blade squeeze at full draw."""
    return posed(base, spine=(-0.03 * k, 0, -0.42 * k), chest=(-0.06 * k - 0.03 * back, 0.05 * k, -0.42 * k),
                 neck=(0.0, 0, 0.36 * k), head=(0.12 * k, -0.06 * k, 0.42 * k),
                 upperarm_L=(-1.381 * k, -0.661 * k, 0.172 * k), forearm_L=(-0.06 * k, 0, 0), hand_L=(0.002 * k, 0, 0.597 * k),
                 upperarm_R=(-1.97 * k, 1.651 * k, -0.47 * k), forearm_R=(-1.875 * k, 0.0, 0.138 * k),
                 hand_R=(0.2 * k, 0, -0.25 * k),
                 thigh_L=(-0.16 * k, -0.08 * k, 0), shin_L=(0.12 * k, 0, 0), thigh_R=(0.1 * k, 0.1 * k, 0), shin_R=(0.08 * k, 0, 0))

def idle_raw(t):
    T = 4.6
    s = math.sin(TAU * t / T)
    p = idle_pose(t, T=T, k=0.7)
    # the bow carried low and upright at the left side, an arrow on the string; the right hand loose
    p = posed(p, upperarm_L=(-0.14, -0.08, 0.1), forearm_L=(-0.45, 0, 0.0), hand_L=(-0.95, 0.0, 0.25),
              upperarm_R=(0.06, 0.12, 0), forearm_R=(-0.3, 0, 0), spine=(0.02, 0, -0.05), head=(0.05, 0, 0.05))
    return p

FULL = draw_pose(fade_idle(idle_raw(0.0), 0.0), 1.0, 1.0)
fk = FK(HB)
M = fk(FULL)
HOOK = J['wrist.R'].lerp(J['knuckle.R'], 0.85) + V((0.0, -0.02, 0.0))   # where the fingers hook the string
MDRAW = to_rest(M, 'hand.L', from_rest(M, 'hand.R', HOOK))              # the nock at full draw, in the bow's rest frame
DRAW = (MDRAW - MREST).length
# the nock bone pivots far off, so its short arc runs straight back from the bow to the drawing hand
mid = MREST.lerp(MDRAW, 0.5)
dd = (MDRAW - MREST).normalized()
nrm = AX - dd * AX.dot(dd); nrm.normalize()
J['nockpiv'] = mid - nrm * 7.0
J['nockpt'] = MREST.copy()
Q_NOCK = (MREST - J['nockpiv']).rotation_difference(MDRAW - J['nockpiv'])
D0 = (SHELF - MREST).normalized()
D1 = (SHELF - MDRAW).normalized()
Q_ARROW = Q_NOCK.inverted() @ D0.rotation_difference(D1)   # turn the arrow (on the moved nock) to lie across the shelf
ARROW_L = 1.42
J['arrowtip'] = MREST + D0 * 0.3
J['flypiv'] = MREST + D0 * 0.7 - nrm * 90.0     # the arrow's flight: a long, flat arc out along its own line
FLY_ANGLE = 2 * math.asin(22.0 / 2 / 90.0)
J['flytip'] = MREST + D0 * 0.7
J['btop0'], J['btop1'] = bw(0.2, 0.0), bw(1.2, 0.08)
J['bbot0'], J['bbot1'] = bw(-0.2, 0.0), bw(-1.2, 0.08)
BONES = HB + [('bowtop', 'btop0', 'btop1', 'hand.L'), ('bowbot', 'bbot0', 'bbot1', 'hand.L'),
              ('nock', 'nockpiv', 'nockpt', 'hand.L'), ('arrow', 'nockpt', 'arrowtip', 'nock'), ('fly', 'flypiv', 'flytip', 'arrow')]
fw = from_rest(M, 'hand.L', SHELF) - from_rest(M, 'hand.L', MDRAW)
print('draw %.2f m; arrow at full draw points %s; hand at %s' % (DRAW, tuple(round(x, 2) for x in fw.normalized()), tuple(round(x, 2) for x in from_rest(M, 'hand.R', HOOK))), flush=True)

body, hands, src, FIELDS, shell = armoured_body(J, mass=0.9, waist=0.8)
Mh = lambda pts: [H + V(p) for p in pts]
both = lambda pts: [(x, y, z) for (x, y, z) in pts] + [(-x, y, z) for (x, y, z) in pts if x]

def weigh(ob, fn):
    """Custom skin weights: fn(co) -> {bone: weight}. The part's rule is then ('smooth', set()), which adds nothing."""
    groups = {}
    for v in ob.data.vertices:
        for b, w in fn(v.co).items():
            if w <= 0: continue
            if b not in groups: groups[b] = ob.vertex_groups.new(name=b)
            groups[b].add([v.index], w, 'REPLACE')
    return ob

def build_helm():
    # a narrow closed helm, its face a flat mask behind the hood's frame; the hood is plate, drawn up
    # into a tall spike swept back over the crown
    face = hull('helmshell', Mh(both([(0.0, 0.0, 0.15), (0.09, -0.02, 0.13), (0.1, -0.12, 0.05), (0.0, -0.165, 0.06), (0.1, -0.1, -0.1),
                                      (0.0, -0.16, -0.17), (0.08, 0.1, 0.04), (0.0, 0.13, 0.0), (0.08, 0.08, -0.12), (0.05, -0.13, -0.17),
                                      (0.03, -0.17, -0.06)])))
    hood = hull('hoodshell', Mh(both([(0.14, -0.08, 0.1), (0.155, -0.04, -0.04), (0.14, -0.06, -0.17), (0.12, 0.1, 0.13), (0.11, 0.15, -0.08),
                                      (0.0, 0.18, 0.02), (0.0, 0.16, -0.2), (0.07, 0.02, 0.24), (0.0, -0.06, 0.26), (0.04, 0.12, 0.3),
                                      (0.0, 0.25, 0.56), (0.012, 0.22, 0.5)])))
    # the brow: a sharp beak of plate over the visor, and cheek flaps standing proud of the mask, so the
    # face sits deep in shadow
    brow = hull('brow', Mh(both([(0.0, -0.205, 0.075), (0.11, -0.16, 0.085), (0.145, -0.1, 0.11), (0.0, -0.13, 0.17), (0.0, -0.17, 0.05),
                                  (0.09, -0.15, 0.06)])))
    parts = [face, hood, brow]
    for s, n in SIDES:
        parts.append(hull('cheek.' + n, Mh([(s * 0.13, -0.19, 0.05), (s * 0.16, -0.08, 0.08), (s * 0.15, -0.16, -0.12), (s * 0.165, -0.04, -0.16),
                                             (s * 0.11, -0.21, -0.02), (s * 0.1, -0.16, -0.2), (s * 0.12, -0.08, 0.06)])))
    keel = hull('keel', Mh(both([(0.01, -0.172, 0.02), (0.0, -0.18, -0.06), (0.01, -0.16, -0.17), (0.0, -0.172, 0.04)])))
    parts.append(keel)
    helm = join(parts, 'helm')
    rv = []
    for s in (1, -1):
        for k in range(6):
            p = H + V((s * 0.152, -0.12 + 0.03 * k, -0.06 - 0.016 * k))
            rv.append(orb('hrv', p + V((s * 0.01, 0, 0)), (0.008, 0.008, 0.008), seg=(8, 5)))
    helm['detail'] = join(rv, 'helm_rivets').name
    return helm

def build_crest():
    # a comb of short back-raked blades down the hood's spine, from the spike to the nape
    obs = []
    path = [H + V((0, 0.25, 0.53)), H + V((0, 0.2, 0.36)), H + V((0, 0.17, 0.18)), H + V((0, 0.17, 0.0)), H + V((0, 0.15, -0.16))]
    for k in range(8):
        u = k / 7
        f = u * (len(path) - 1); i = min(int(f), len(path) - 2)
        b = path[i].lerp(path[i + 1], f - i)
        obs.append(blade('comb', b + V((0, -0.02, 0)), b + V((0, 0.1 - 0.03 * u, 0.04 - 0.07 * u)), 0.024, thick=0.3, sub=0))
    return join(obs, 'crest')

def limb_path(sign):
    # the limb's line in the bow frame: out from the riser, curving back toward the string, the tip
    # recurved hard forward. sign +1 the top limb, -1 the bottom
    prof = [(0.18, 0.0), (0.42, 0.03), (0.68, 0.065), (0.9, 0.1), (1.04, 0.118), (1.13, 0.1), (1.19, 0.05), (1.22, -0.02)]
    return [bw(sign * a, b) for a, b in prof]

def build_bow():
    P = {}
    # the limbs: black horn, faceted, wide and flat at the riser, narrowing to the recurve
    limbs, edges, blades = [], [], []
    for sign, nm in ((1, 'top'), (-1, 'bot')):
        path = limb_path(sign)
        W = [0.05, 0.046, 0.04, 0.034, 0.028, 0.022, 0.016, 0.01]
        T = [0.036, 0.032, 0.028, 0.024, 0.02, 0.017, 0.013, 0.008]
        segs = []
        for i in range(len(path) - 1):
            pts = []
            for j in (i, i + 1):
                tg = (path[min(j + 1, len(path) - 1)] - path[max(j - 1, 0)]).normalized()
                nb = BX - tg * BX.dot(tg); nb.normalize()
                for c in (-1, 1):
                    for b in (-1, 1):
                        pts.append(path[j] + CX * c * W[j] + nb * b * T[j] * (0.6 if abs(c) else 1))
                    pts.append(path[j] + CX * c * W[j] * 0.6 + nb * T[j] * 1.25)   # a ridge down the belly
            segs.append(hull('limbseg', pts, bevel=0.002))
        limb = join(segs, 'limb.' + nm)
        along(limb, path)
        limbs.append(limb)
        # a steel spine of saw-teeth down the back of each limb (the target side) and a hooked blade
        # at the recurve, so the bow is a weapon at close quarters too
        for k in range(5):
            u = 0.25 + k * 0.14
            f = u * (len(path) - 1); i = min(int(f), len(path) - 2)
            b = path[i].lerp(path[i + 1], f - i)
            tg = (path[i + 1] - path[i]).normalized()
            nb = BX - tg * BX.dot(tg); nb.normalize()
            blades.append(blade('saw', b - nb * 0.015 - tg * 0.04, b - nb * (0.09 - 0.008 * k) + tg * 0.06, 0.028 - 0.003 * k, thick=0.3, sub=0))
        tip = path[-1]
        tg = (path[-1] - path[-2]).normalized()
        blades.append(blade('tipblade', path[-3], tip + tg * 0.2 - BX * 0.06, 0.04, curve=-BX * 0.03, thick=0.25))
        blades.append(blade('tiphook', path[-2], path[-2] + BX * 0.1 + tg * 0.05, 0.022, thick=0.35, sub=0))
        # a steel cap where the string loops on
        edges.append(hull('nockcap', [path[-3] + CX * c * 0.022 + BX * b + tg * z for c in (-1, 1) for b in (-0.01, 0.035) for z in (-0.03, 0.03)]))
    P['bowlimbs'] = join(limbs, 'bowlimbs')
    P['bowsteel'] = join(blades + edges, 'bowsteel')
    # the riser: a heavy steel grip-block with a blade swept forward off its back, and a spur below
    rz = [bw(a, b, c) for a in (-0.22, 0.22) for b in (-0.05, 0.03) for c in (-0.042, 0.042)]
    rz += [bw(a, -0.075, c) for a in (-0.1, 0.1) for c in (-0.03, 0.03)]
    riser = hull('riser', rz, bevel=0.004)
    fin = blade('riserfin', bw(0.12, -0.06), bw(0.3, -0.26), 0.05, curve=-AX * 0.02, thick=0.25)
    spur = blade('riserspur', bw(-0.12, -0.06), bw(-0.34, -0.22), 0.045, curve=AX * 0.02, thick=0.25)
    P['riser'] = join([riser, fin, spur], 'riser')
    wrap = [ring(f'wrap{i}', bw(-0.085 + i * 0.017, -0.012), 0.05, 0.007, rot=(math.pi / 2, 0, 0), seg=(16, 5), flat=1.0) for i in range(11)]
    for w in wrap:
        for v in w.data.vertices:   # squash the rings flat to the grip's section
            d = v.co - G; d.z = d.z * 0.85; d.x = d.x * 0.85; v.co = G + d
    P['bowgrip'] = join(wrap, 'bowgrip')
    # the string: tip to nock to tip, three straight runs
    tt, tb = limb_path(1)[-3] + BX * 0.03, limb_path(-1)[-3] + BX * 0.03
    pts = [tt.lerp(MREST, k / 8) for k in range(9)] + [MREST.lerp(tb, k / 8) for k in range(1, 9)]
    P['string'] = tube('string', pts, [0.0055] * len(pts), sub=0)
    # the nocked arrow: a black shaft, a barbed steel head, three bone fletchings
    a0 = MREST
    a1 = MREST + D0 * ARROW_L
    shaft = tube('ashaft', [a0, a0.lerp(a1, 0.5), a1], [0.011, 0.012, 0.011], sub=1)
    side = D0.cross(CX).normalized()
    head = hull('ahead', [a1 + D0 * 0.2, a1 + CX * 0.04, a1 - CX * 0.04, a1 + side * 0.012, a1 - side * 0.012, a1 - D0 * 0.03], bevel=0.002)
    barbs = [blade('abarb', a1 + CX * s * 0.03, a1 - D0 * 0.08 + CX * s * 0.065, 0.016, thick=0.3, sub=0) for s in (1, -1)]
    flet = []
    for k in range(3):
        a = k * math.tau / 3
        o = CX * math.cos(a) + side * math.sin(a)
        flet.append(hull('flet', [a0 + D0 * 0.04 + o * 0.01, a0 + D0 * 0.24 + o * 0.01, a0 + D0 * 0.07 + o * 0.045, a0 + D0 * 0.22 + o * 0.03,
                                   a0 + D0 * 0.04 + o * 0.012 + side.cross(o) * 0.002], bevel=0))
    P['arrow'] = join([shaft, head] + barbs, 'arrow')
    P['fletch'] = join(flet, 'fletch')
    return P

def bow_weights(co):
    a = (co - G).dot(AX)
    if a > 0.18:
        w = min(1.0, (a - 0.18) / 0.95) ** 0.85
        return {'bowtop': w, 'hand.L': 1 - w}
    if a < -0.18:
        w = min(1.0, (-a - 0.18) / 0.95) ** 0.85
        return {'bowbot': w, 'hand.L': 1 - w}
    return {'hand.L': 1.0}

def string_weights(co):
    a = (co - G).dot(AX)
    w = max(0.0, 1 - abs(a) / 1.02)   # 1 at the nock, 0 at the string's loops
    lim = 'bowtop' if a > 0 else 'bowbot'
    return {'nock': w, lim: 1 - w}

def build_gear():
    P = {'hands': hands, 'helm': build_helm(), 'crest': build_crest()}
    muscle_plates(P, src, FIELDS, scale=0.95)
    for s, n in SIDES:
        el, ke, an, to, wr = J['elbow.' + n], J['knee.' + n], J['ankle.' + n], J['toe.' + n], J['wrist.' + n]
        P['couter.' + n] = plate(shell, 'couter.' + n, lambda p, el=el: (p - el).length < 0.1 and p.y > el.y - 0.02, push=0.036, thick=0.015, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['cspike.' + n] = blade('cspike.' + n, el + V((s * 0.02, 0.05, 0.02)), el + V((s * 0.05, 0.24, -0.04)), 0.035, curve=V((0, 0, 0.04)), thick=0.4)
        P['kneecop.' + n] = plate(shell, 'kneecop.' + n, lambda p, ke=ke: (p - ke).length < 0.11 and p.y < ke.y, push=0.045, thick=0.016, smooth=4, facets=0.0, rim=0.012, rivets=0.05, bead=True)
        P['kspike.' + n] = blade('kspike.' + n, ke + V((0, -0.09, 0.03)), ke + V((s * 0.03, -0.22, 0.2)), 0.032, curve=V((0, 0, 0.04)), thick=0.45)
        P.update(lames(shell, 'sabaton.' + n + '.', lambda p, an=an: p.z < an.z + 0.07 and abs(p.x - an.x) < 0.14, an + V((0, 0.06, 0)), to, 3, -0.1, 1.0, push=0.02, step=0.008))
        P['strap.th.' + n] = strap(shell, 'strap.th.' + n, J['hip.' + n], ke, (0, 1, 0), t0=0.3, t1=0.92, width=0.03)
    # the bracer on the bow arm, a long flared guard of plate with a spine of short blades
    el, wr = J['elbow.L'], J['wrist.L']
    P['bracer'] = plate(shell, 'bracer', lambda p: 0.15 < seg_t(p, el, wr) < 0.95 and (p - el.lerp(wr, seg_t(p, el, wr))).length < 0.2,
                        push=0.05, thick=0.016, smooth=4, facets=0.08, rim=0.012, rivets=0.05, bead=True)
    P['bthorns'] = join([blade('bth', el.lerp(wr, u) + V((0.07, 0.03, 0)), el.lerp(wr, u) + V((0.15, 0.08, 0.1)), 0.026, thick=0.35, sub=0) for u in (0.3, 0.52, 0.74)], 'bthorns')
    # the draw arm's shoulder: a high flared guard standing up beside the neck (it shields the face
    # from the string), raked back into a blade
    shR = J['shoulder.R']
    P['highguard'] = hull('highguard', [shR + V(p) for p in ((0.1, -0.12, 0.12), (0.12, 0.14, 0.12), (0.02, -0.08, 0.34), (0.05, 0.06, 0.4),
                                                               (0.0, 0.16, 0.3), (-0.04, -0.1, 0.08), (-0.06, 0.12, 0.06), (0.09, 0.0, 0.2))], bevel=0.003)
    P['hgblade'] = blade('hgblade', shR + V((0.03, 0.06, 0.36)), shR + V((0.06, 0.26, 0.56)), 0.05, curve=V((0, 0.03, -0.04)), thick=0.3)
    # the belt, a short split skirt of leather front and back, slit at the sides for the stride
    P['belt'] = plate(shell, 'belt', lambda p: 1.84 < p.z < 1.95 and abs(p.x) < 0.4, push=0.045, thick=0.018, smooth=3, facets=0.1, rim=0.01, rivets=0.05)
    P['skirt'] = cloth('skirt', 14, 16, lambda u, t: (u * (0.2 + t * 0.06), -0.25 - t * 0.1 + u * u * 0.06, 1.88 - t * 0.62), thick=0.014, strips=(0.45, 0.1, 9))
    P['skirtb'] = cloth('skirtb', 14, 16, lambda u, t: (u * (0.21 + t * 0.06), 0.21 + t * 0.12 - u * u * 0.06, 1.88 - t * 0.6), thick=0.014, strips=(0.45, 0.1, 13))
    # the half-cape: off the left shoulder and down half the back, torn into strips below the waist
    def cape(u, t):
        a = (u + 1) / 2   # 0 at the spine, 1 at the front of the left shoulder
        top = V((0.02 + 0.5 * math.sin(a * 1.75), 0.2 - 0.36 * a * a, 2.8 - 0.03 * a - 0.08 * a * a))
        out = V((math.sin(a * 1.75) * 0.9 + 0.1, 0.2 + 0.6 * (1 - a), 0.0)).normalized()
        L = 1.35 - 0.75 * a
        fold = math.sin(u * 11 + 0.4) * 0.03 + math.sin(u * 23) * 0.01
        return top + V((0, 0, -t * L)) + out * (t * 0.16 + fold * t + 0.04 * t * t)
    P['cape'] = cloth('cape', 30, 24, cape, thick=0.014, strips=(0.42, 0.15, 21))
    # the quiver on the back, slung from the left hip to the right shoulder; barbed arrows stand in it
    q0, q1 = V((0.17, 0.27, 2.06)), V((-0.2, 0.33, 2.86))
    qd = (q1 - q0).normalized()
    P['quiver'] = sharp(tube('quiver', [q0, q0.lerp(q1, 0.5) + V((0, 0.02, 0)), q1], [0.075, 0.085, 0.092], sub=1), 50)
    bands = [ring(f'qb{i}', q0.lerp(q1, u), 0.08 + 0.014 * u, 0.012, rot=qd.to_track_quat('Z', 'Y').to_euler(), seg=(24, 5)) for i, u in enumerate((0.06, 0.5, 0.97))]
    P['qbands'] = join(bands, 'qbands')
    shafts, heads = [], []
    rq = random.Random(5)
    for k in range(7):
        a = k / 7 * math.tau
        side1 = qd.cross(V((1, 0, 0))).normalized(); side2 = qd.cross(side1)
        o = (side1 * math.cos(a) + side2 * math.sin(a)) * 0.05
        d = (qd + V((rq.uniform(-0.06, 0.06), rq.uniform(-0.04, 0.06), 0))).normalized()
        b0 = q1 + o - qd * 0.2
        b1 = b0 + d * (0.45 + rq.uniform(0, 0.12))
        shafts.append(tube('qs', [b0, b1], [0.009, 0.009], sub=0))
        for j in range(3):   # fletching: bone vanes fanned round the nock
            aa = j * math.tau / 3 + a
            vo = (side1 * math.cos(aa) + side2 * math.sin(aa))
            heads.append(hull('qf', [b1 - d * 0.02 + vo * 0.008, b1 - d * 0.2 + vo * 0.008, b1 - d * 0.05 + vo * 0.04, b1 - d * 0.18 + vo * 0.032,
                                     b1 - d * 0.03 + vo * 0.009 + vo.cross(d) * 0.002], bevel=0))
    P['qarrows'] = join(shafts, 'qarrows')
    P['qfletch'] = join(heads, 'qfletch')
    # the baldric the quiver hangs from, right shoulder to left hip across the chest
    bal0, bal1 = V((-0.3, 0, 2.67)), V((0.26, 0, 1.96))
    def on_baldric(p):
        d = bal1 - bal0; q = V((p.x, 0, p.z)); t = (q - bal0).dot(d) / d.length_squared
        return 0 <= t <= 1 and (q - bal0.lerp(bal1, t)).length < 0.04 and p.y < -0.04
    P['baldric'] = plate(shell, 'baldric', on_baldric, push=0.06, thick=0.01, smooth=1, facets=0.3, bevel=0.002, rivets=0.09)
    sh = J['shoulder.R']
    if 'm.sidedelt.R' in P:   # a short crop of thorns raking up off the draw arm's shoulder plate
        P['pthorns.R'] = thorns(P['m.sidedelt.R'], 'pthorns.R', lambda c: c.z > sh.z + 0.0 and c.x < sh.x + 0.04, 3, 0.26, 0.04, up=2.0, back=0.4, curve=0.3, seed=4, flat=0.5)
    P.update(build_bow())
    weigh(P['bowlimbs'], bow_weights); weigh(P['bowsteel'], bow_weights); weigh(P['string'], string_weights)
    return P

gear = build_gear()
cleanup(src, shell)

def build_glow():
    g = {}
    # the face: one narrow burning slit under the brow, and three thin breath-slits under it
    slit = [orb('visor', H + V((0, -0.17, 0.035)), (0.085, 0.012, 0.0085))]
    sit_on(slit[0], gear['helm'], gap=-0.004)
    for k in (-1, 0, 1):
        ob = orb('breath', H + V((k * 0.03, -0.17, -0.09)), (0.0045, 0.01, 0.03))
        sit_on(ob, gear['helm'], gap=-0.003); slit.append(ob)
    g['eyes'] = (join(slit, 'eyes'), 'head')
    # the arrow's barbed head burns
    a1 = MREST + D0 * ARROW_L
    g['arrowglow'] = (hull('arrowglow', [a1 + D0 * 0.23, a1 + D0 * 0.02 + CX * 0.022, a1 + D0 * 0.02 - CX * 0.022, a1 + D0 * 0.03 + D0.cross(CX) * 0.016,
                                         a1 + D0 * 0.03 - D0.cross(CX) * 0.016], bevel=0), 'fly')
    # a seam of fire down the riser
    g['riserglow'] = (hull('riserglow', [bw(a, -0.052, c) for a in (-0.15, 0.15) for c in (-0.008, 0.008)] + [bw(0, -0.06, 0)], bevel=0), 'hand.L')
    return g
glow = build_glow()

PAINTED = ('m.sidedelt', 'kneecop', 'couter', 'highguard')
BOWW = ('bowlimbs', 'bowsteel', 'string')

def part_info(name):
    side = side_of(name)
    steel = 'paint' if name.startswith(PAINTED) else 'steel'
    if name.startswith('m.'): return steel, muscle_bones(name)
    if name == 'body_high': return 'mail', ('smooth', None)
    if name == 'hands': return 'steel', ('smooth', {'forearm.L', 'hand.L', 'forearm.R', 'hand.R'})
    if name in ('helm', 'crest'): return 'helm', ('rigid', 'head')
    if name.startswith(('couter', 'cspike')): return steel, ('rigid', 'forearm.' + side)
    if name in ('bracer', 'bthorns'): return 'steel', ('rigid', 'forearm.L')
    if name.startswith(('kneecop', 'kspike')): return steel, ('rigid', 'shin.' + side)
    if name.startswith('sabaton'): return 'steel', ('rigid', 'foot.' + side)
    if name.startswith('strap.th'): return 'leather', ('rigid', 'thigh.' + side)
    if name in ('highguard', 'hgblade'): return steel, ('smooth', {'chest', 'upperarm.R'})
    if name.startswith('pthorns'): return steel, ('smooth', {'chest', 'upperarm.R'})
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name in ('skirt', 'skirtb'): return 'leather', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'cape': return 'cloth', ('smooth', {'chest', 'spine', 'upperarm.L', 'hips'})
    if name in ('quiver', 'qbands', 'qarrows'): return ('leather' if name == 'quiver' else 'steel'), ('rigid', 'chest')
    if name == 'qfletch': return 'bone', ('rigid', 'chest')
    if name == 'baldric': return 'leather', ('smooth', {'spine', 'chest', 'hips'})
    if name == 'bowlimbs': return 'horn', ('smooth', set())
    if name in ('bowsteel',): return 'steel', ('smooth', set())
    if name == 'string': return 'bone', ('smooth', set())
    if name == 'riser': return 'steel', ('rigid', 'hand.L')
    if name == 'bowgrip': return 'leather', ('rigid', 'hand.L')
    if name == 'arrow': return 'steel', ('rigid', 'fly')
    if name == 'fletch': return 'bone', ('rigid', 'fly')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 7000
    if name == 'hands': return 2400
    if name == 'helm': return 1600
    if name == 'crest': return 400
    if name.startswith('m.'): return plate_tris(name)
    if name == 'cape': return 2000
    if name.startswith('skirt'): return 700
    if name.startswith('pthorns'): return 500
    if name in ('bowlimbs',): return 2400
    if name in ('bowsteel', 'riser'): return 1200
    if name in ('bowgrip', 'qbands'): return 900
    if name in ('quiver',): return 700
    if name in ('qarrows', 'qfletch'): return 700
    if name.startswith(('couter', 'kneecop', 'sabaton', 'belt', 'bracer', 'highguard')): return 600
    if name in ('string', 'arrow', 'fletch'): return min(tris, 600)
    return min(tris, 300)

def uv_weight(name):
    if name in ('helm', 'crest', 'riser'): return 2.6
    if name.startswith(('bowlimbs', 'highguard')): return 2.0
    if name.startswith('m.'): return plate_uv(name)
    if name in ('cape', 'skirt', 'skirtb'): return 0.7
    if name == 'body_high': return 0.5
    return 1.0

MATS, FLAT = knight_mats(accent=GLOW, paint=(0.05, 0.034, 0.004), horn=((0.008, 0.007, 0.007), (0.06, 0.045, 0.03)),
                         cloth=[(0.0, (0.03, 0.022, 0.004)), (0.4, (0.014, 0.012, 0.01)), (1.0, (0.01, 0.009, 0.011))])

PIV = J['nockpiv']; R0 = MREST - PIV
_flyr = J['flytip'] - J['flypiv']
FLY_AXIS = _flyr.cross(D0).normalized()
if (Quaternion(FLY_AXIS, 0.01) @ _flyr - _flyr).dot(D0) < 0: FLY_AXIS = -FLY_AXIS
STATE = {'last': MREST.copy(), 'aim': Quaternion()}

def bow_extra(p, attach=0.0, release=0.0, fly=0.0, flex=0.0):
    """The bow's own bones. attach (0..1): how firmly the right hand has the string; the nock is then
    pulled to wherever that hand really is (solved on the FK armature), the arrow laid from the nock
    across the shelf, and the limbs flexed with the draw. release (0..1): the string snapping home
    after the loose, the arrow flying (fly 0..1 of its arc) on the line it left on."""
    if attach > 0:
        Mw = fk(p)
        target = MREST.lerp(to_rest(Mw, 'hand.L', from_rest(Mw, 'hand.R', HOOK)), attach)
        STATE['last'] = target
    elif release > 0:
        target = MREST.lerp(STATE['last'], 1 - release)
    else:
        target = MREST
    qn = R0.rotation_difference(target - PIV)
    pos = PIV + qn @ R0
    d = (pos - MREST).length / max(DRAW, 0.3)
    if fly > 0 or release > 0:
        aim = STATE['aim']
    else:
        aim = D0.rotation_difference((SHELF - pos).normalized())
        STATE['aim'] = aim
    qa = qn.inverted() @ aim
    p['nock'] = tuple(qn.to_euler('XYZ'))
    p['arrow'] = tuple(qa.to_euler('XYZ'))
    p['fly'] = tuple(Quaternion(FLY_AXIS, FLY_ANGLE * fly).to_euler('XYZ'))
    f = d + flex
    p['bowtop'] = (-0.12 * f, 0, 0); p['bowbot'] = (0.12 * f, 0, 0)
    return p

def idle(t):
    return bow_extra(idle_raw(t))

def roar(t):
    p = roar_pose(t, idle_raw)
    b = p['_b']
    base = idle_raw(t)
    for k in ('upperarm.L', 'forearm.L', 'hand.L'):   # the bow stays carried, lifted a little
        p[k] = base[k]
    p = posed(p, upperarm_L=(-0.25 * b, -0.2 * b, 0), forearm_L=(-0.3 * b, 0, 0))
    return bow_extra(p)

LOOSE = 1.55
def attack(t):
    # "Cursed Shot": the bow swung up, the right hand to the string, drawn to the jaw with the back
    # straining, a held breath, the arrow loosed with a snap of the string, the bow kicking up and the
    # archer thrown back off the shot, then the bow lowered
    k = ease(t / 0.5) * (1 - ease((t - 2.2) / 0.7))       # the bow raised, then lowered
    reach = ease((t - 0.15) / 0.3)                          # the right hand comes to the string
    draw = ease((t - 0.5) / 0.65)                           # and draws it
    hold = 1 - ease((t - LOOSE) / 0.07)                     # until it is loosed
    rec = ease((t - LOOSE) / 0.12) * (1 - ease((t - 2.0) / 0.6))
    back = draw * hold
    tremble = math.sin(t * 55) * 0.012 * ease((t - 1.1) / 0.2) * hold
    p = fade_idle(idle_raw(t), 1 - k)
    p = draw_pose(p, k, back)
    # undrawn, the right arm reaches forward across the body to the string at the bow
    u = (1 - draw) * k * hold
    p = posed(p, upperarm_R=(-1.212 * u, 0.181 * u, 0), forearm_R=(1.881 * u, 0, -1.3 * u), hand_R=(-0.106 * u, 0, 0.037 * u))
    # the loose: the right hand flies open and back past the ear, the bow arm kicks, the body recoils
    p = posed(p, upperarm_R=(-0.15 * rec, 0.2 * rec, 0.15 * rec), forearm_R=(0.6 * rec, 0, 0.2 * rec), hand_R=(0.4 * rec, 0, 0),
              chest=(tremble - 0.12 * rec, 0, 0.06 * rec), spine=(-0.08 * rec, 0, 0), head=(-0.1 * rec, 0, 0),
              upperarm_L=(-0.25 * rec, 0, 0), hand_L=(-0.3 * rec, 0, 0),
              thigh_L=(0.12 * rec, 0, 0), thigh_R=(-0.14 * rec, 0, 0), shin_R=(0.2 * rec, 0, 0))
    p['_hips_loc'] = (0, 0, 0.06 * rec)
    if t < LOOSE:
        return bow_extra(p, attach=reach * k)
    fly = ease((t - LOOSE) / 0.13) if t < 2.45 else 0.0   # a fresh arrow is on the string as the bow comes down
    ring_ = math.sin((t - LOOSE) * 70) * 0.35 * math.exp(-(t - LOOSE) * 7)   # the limbs ring after the snap
    return bow_extra(p, release=max(1 - hold, 1e-4) if t < 2.45 else 0.0, fly=fly, flex=ring_)

parts = {'body_high': body, **gear}
finish('Archer', OUT, J, BONES, parts, glow, part_info, MATS, FLAT, tri_target, GLOW,
       idle=idle, roar=roar, clips=[('Attack', 90, attack)], mid=0.06, emit_strength=4.0, uv_weight=uv_weight)
