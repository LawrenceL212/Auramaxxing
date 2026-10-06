# Antares the Sovereign Beast (S-rank gate): a dragon king. A scaled, heavy-muscled body with a
# horned dragon's head under a gold crown, great wings, a spiked tail, gold war-plate and
# taloned hands and feet. ~3.6 m to the horns, the wings wider than it is tall.
#   python3.11 antares.py --bake --out ../../antares.glb
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset(53)
OUT = out_path(os.path.join(os.path.dirname(__file__), 'antares.glb'))

J = {'pelvis': V((0, 0.04, 1.22)), 'waist': V((0, 0.05, 1.48)), 'chest': V((0, 0.0, 1.86)), 'upchest': V((0, 0.04, 2.1)),
     'neck': V((0, -0.06, 2.34)), 'head': V((0, -0.16, 2.52)), 'crown': V((0, -0.12, 2.74))}
mirrored(J, {'shoulder': (0.58, 0.05, 2.12), 'elbow': (0.88, 0.12, 1.62), 'wrist': (1.0, -0.06, 1.15), 'knuckle': (1.04, -0.12, 0.96),
             'hip': (0.25, 0.03, 1.16), 'knee': (0.36, -0.12, 0.66), 'ankle': (0.38, 0.12, 0.2), 'toe': (0.42, -0.22, 0.05)})
BONES = human_bones()
H = J['head']

def build_body():
    t = Tree()
    pel = t.add(J['pelvis'], (0.3, 0.25))
    wai = t.add(J['waist'], (0.27, 0.22), pel)
    che = t.add(J['chest'], (0.44, 0.32), wai)
    up = t.add(J['upchest'], (0.5, 0.32), che)
    nk = t.add(J['neck'], (0.2, 0.2), up)
    hd = t.add(H, (0.17, 0.2), nk)
    # the dragon's head: a long snout and a heavy lower jaw, a little open
    sn = t.add(H + V((0, -0.24, -0.02)), (0.12, 0.1), hd)
    t.add(H + V((0, -0.48, -0.06)), (0.075, 0.065), sn)
    jw = t.add(H + V((0, -0.14, -0.12)), (0.12, 0.08), hd)
    t.add(H + V((0, -0.42, -0.2)), (0.06, 0.04), jw)
    for s, n in SIDES:
        sh = t.add(J['shoulder.' + n], 0.22, up)
        el = t.add(J['elbow.' + n], 0.15, sh)
        wr = t.add(J['wrist.' + n], 0.12, el)
        palm = t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.6), (0.11, 0.07), wr)
        d = (J['knuckle.' + n] - J['wrist.' + n]).normalized()
        for i in range(4):
            off = V((0, -0.075 + i * 0.05, 0))
            k1 = t.add(J['knuckle.' + n] + off, 0.032, palm)
            t.add(J['knuckle.' + n] + off + d * 0.1 + V((0, -0.03, 0)), 0.026, k1)
        t.add(J['wrist.' + n].lerp(J['knuckle.' + n], 0.35) + V((-s * 0.06, -0.09, 0)), 0.035, palm)
        hp = t.add(J['hip.' + n], 0.21, pel)
        kn = t.add(J['knee.' + n], 0.15, hp)
        an = t.add(J['ankle.' + n], 0.1, kn)
        ft = t.add(J['ankle.' + n].lerp(J['toe.' + n], 0.6), (0.11, 0.06), an)
        for i in range(3):
            t.add(J['toe.' + n] + V((s * (0.05 - i * 0.05), -0.06, 0.0)), 0.035, ft)
    B = [t.build('skin')]
    for s, n in SIDES:
        sh, el, wr = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n]
        hp, kn, an = J['hip.' + n], J['knee.' + n], J['ankle.' + n]
        B += [blob(sh + V((s * 0.04, 0.0, 0.03)), (0.27, 0.26, 0.23)), blob(V((s * 0.23, -0.21, 1.93)), (0.25, 0.13, 0.18), (0.25, 0, s * 0.2)),
              blob(V((s * 0.21, 0.19, 2.18)), (0.25, 0.13, 0.13), (0, 0, s * -0.4)), blob(V((s * 0.23, 0.17, 1.78)), (0.21, 0.15, 0.3), (0, s * 0.2, 0)),
              blob(sh.lerp(el, 0.5) + V((0, -0.05, 0)), (0.16, 0.16, 0.25), (0.1, s * -0.5, 0)), blob(el.lerp(wr, 0.3), (0.15, 0.15, 0.21), (0.3, s * -0.2, 0)),
              blob(hp.lerp(kn, 0.45) + V((s * 0.02, -0.04, 0)), (0.2, 0.2, 0.33)), blob(kn.lerp(an, 0.3) + V((0, 0.08, 0)), (0.13, 0.14, 0.2)),
              blob(H + V((s * 0.09, -0.12, 0.08)), (0.07, 0.1, 0.045), (0.3, 0, s * 0.3)),     # brow ridge over the eye
              blob(H + V((s * 0.1, 0.0, -0.06)), (0.07, 0.1, 0.08))]                            # jaw muscle
        for i in range(3):
            B.append(blob(V((s * 0.09, -0.21, 1.42 + i * 0.12)), (0.085, 0.06, 0.06)))
    body = remesh(B, 'body_high', voxel=0.013, smooth=6)
    return body

body = build_body()

def wing(s):
    # a bat-like dragon wing: an arm of bone from the upper back, four fingers fanning out, a membrane between
    root = V((s * 0.22, 0.28, 2.1))
    elbow = V((s * 0.75, 0.62, 2.62))
    wrist = V((s * 1.45, 0.75, 2.95))
    tips = [V((s * 2.25, 0.85, 3.1)), V((s * 2.3, 0.9, 2.35)), V((s * 2.05, 0.92, 1.55)), V((s * 1.55, 0.88, 0.95))]
    bones = [tube('warm', [root, elbow, wrist], [0.07, 0.055, 0.045])]
    fingers = []
    for i, tp in enumerate(tips):
        mid = wrist.lerp(tp, 0.5) + V((0, 0.05, 0.08 if i == 0 else 0.0))
        bones.append(tube(f'wf{i}', [wrist, mid, tp], [0.038, 0.026, 0.008]))
        fingers.append([wrist.lerp(mid, k / 3) if k < 3 else mid for k in range(4)] + [mid.lerp(tp, k / 3) for k in range(1, 4)])
    # the trailing edge runs from the last fingertip back to the hip
    body_edge = [root.lerp(V((s * 0.3, 0.4, 1.3)), k / 6) for k in range(7)]
    bm = bmesh.new()
    nseg = 8
    # membrane panels between each pair of neighbouring fingers (and the last finger and the body)
    panels = list(zip(fingers, fingers[1:])) + [(fingers[-1], body_edge)]
    for fa, fb in panels:
        rows = []
        for j in range(len(fa)):
            row = []
            for k in range(nseg + 1):
                u = k / nseg
                p = fa[j].lerp(fb[j], u)
                # scalloped: the membrane sags between fingers toward the outer edge
                sag = math.sin(u * math.pi) * (j / (len(fa) - 1)) * 0.22
                p = p + (wrist - p).normalized() * sag * (1 if j == len(fa) - 1 else 0.4) + V((0, 0.06 * math.sin(u * math.pi), 0))
                row.append(bm.verts.new(p))
            rows.append(row)
        for j in range(len(rows) - 1):
            for k in range(nseg):
                bm.faces.new((rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]))
    mem = mesh_from_bm('membrane', bm)
    so = mem.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.012; so.offset = 0
    sb = mem.modifiers.new('sub', 'SUBSURF'); sb.levels = 1
    apply_mods(mem); smooth_shade(mem)
    claw = spike('wclaw', wrist + V((0, -0.02, 0.04)), wrist + V((s * 0.05, -0.1, 0.25)), 0.035, curve=V((0, -0.05, 0)))
    return join(bones + [claw], 'wingbone'), mem

def build_gear():
    P = {}
    for s, n in SIDES:
        P['wingbone.' + n], P['membrane.' + n] = wing(s)
        P['wingbone.' + n].name = 'wingbone.' + n; P['membrane.' + n].name = 'membrane.' + n
        # horns: two great ones sweeping back from the brow, and a smaller pair beneath
        P['horn.' + n] = tube('horn.' + n, [H + V((s * 0.1, -0.06, 0.14)), H + V((s * 0.2, 0.08, 0.26)), H + V((s * 0.28, 0.3, 0.36)),
                                            H + V((s * 0.32, 0.55, 0.38)), H + V((s * 0.3, 0.78, 0.3)), H + V((s * 0.25, 0.94, 0.18))],
                              [0.075, 0.065, 0.05, 0.036, 0.02, 0.005], flat=1.2, sub=3)
        P['hornb.' + n] = spike('hornb.' + n, H + V((s * 0.14, 0.02, -0.02)), H + V((s * 0.32, 0.3, -0.06)), 0.04, curve=V((s * 0.04, 0, 0.04)))
        for i in range(3):   # cheek spines
            b = H + V((s * 0.12, -0.08 + i * 0.07, -0.1 + i * 0.02))
            P[f'cheek{i}.' + n] = spike(f'cheek{i}.' + n, b, b + V((s * 0.12, 0.12, -0.02)), 0.02)
        # teeth along both jaws
        for i in range(4):
            y = -0.44 + i * 0.07
            P[f'tooth{i}.' + n] = spike(f'tooth{i}.' + n, H + V((s * 0.05, y, -0.1)), H + V((s * 0.05, y, -0.15)), 0.012, n=4)
            P[f'ltooth{i}.' + n] = spike(f'ltooth{i}.' + n, H + V((s * 0.045, y + 0.03, -0.17 - i * 0.012)), H + V((s * 0.045, y + 0.03, -0.12 - i * 0.012)), 0.011, n=4)
        sh, el, wr, kn = J['shoulder.' + n], J['elbow.' + n], J['wrist.' + n], J['knuckle.' + n]
        # gold war-plate: a pauldron with a ridge of spikes, a bracer, a greave
        out = V((s * 0.64, 0.04, 2.2))
        for i, sc in enumerate((1.0, 0.9)):
            P[f'pauldron{i}.' + n] = shell(f'pauldron{i}.' + n, out + V((s * 0.07 * i, 0, -0.11 * i)), (0.31 * sc, 0.29 * sc, 0.18 * sc),
                                       rot=(0, s * (0.35 + 0.2 * i), 0), cut=lambda c: c.z > -0.2, thick=0.04)
        for k in range(3):
            P[f'pspike{k}.' + n] = spike(f'pspike{k}.' + n, out + V((s * 0.1, -0.12 + k * 0.12, 0.18)), out + V((s * 0.2, -0.14 + k * 0.16, 0.42 - k * 0.06)), 0.045)
        P['bracer.' + n] = extract(body, 'bracer.' + n, lambda p, el=el, wr=wr, s=s: s * p.x > 0.55 and near_seg(p, el, wr, 0.35, 0.95), push=0.04, thick=0.03)
        P['greave.' + n] = extract(body, 'greave.' + n, lambda p, kn=J['knee.' + n], an=J['ankle.' + n], s=s: s * p.x > 0.12 and near_seg(p, kn, an, 0.0, 0.85), push=0.04, thick=0.035)
        # talons: on the fingers and the toes
        d = (kn - wr).normalized()
        for i in range(4):
            off = V((0, -0.075 + i * 0.05, 0))
            b = kn + off + d * 0.1 + V((0, -0.03, 0))
            P[f'talon{i}.' + n] = spike(f'talon{i}.' + n, b, b + d * 0.12 + V((0, -0.08, -0.02)), 0.022, curve=V((0, -0.02, 0)))
        for i in range(3):
            b = J['toe.' + n] + V((s * (0.05 - i * 0.05), -0.08, 0.0))
            P[f'toeclaw{i}.' + n] = spike(f'toeclaw{i}.' + n, b, b + V((0, -0.12, -0.04)), 0.028, curve=V((0, 0, 0.02)))
    # the crown: a gold band round the brow with a ring of points
    P['crownband'] = ring('crownband', H + V((0, 0.0, 0.14)), 0.17, 0.025, rot=(0.25, 0, 0), flat=1.6)
    for i in range(9):
        a = (i - 4) * 0.36
        b = H + V((math.sin(a) * 0.17, -math.cos(a) * 0.17 * math.cos(0.25), 0.15 + math.cos(a) * 0.04))
        P[f'crown{i}'] = spike(f'crown{i}', b, b + V((math.sin(a) * 0.03, -math.cos(a) * 0.03, 0.14 + (0.08 if i == 4 else 0) - abs(i - 4) * 0.012)), 0.025, n=4)
    # gold collar over the chest and a belt, a dark red loincloth
    P['collar'] = extract(body, 'collar', lambda p: 2.04 < p.z < 2.22 and abs(p.x) < 0.42 and p.y < 0.05, push=0.04, thick=0.03, smooth=6)
    P['belt'] = extract(body, 'belt', lambda p: 1.2 < p.z < 1.38 and abs(p.x) < 0.5, push=0.07, thick=0.05)
    for tag, y0, sg in (('front', -0.28, -1), ('back', 0.3, 1)):
        P['loin.' + tag] = cloth('loin.' + tag, 8, 14, lambda u, t, y0=y0, sg=sg: (u * (0.2 + t * 0.06), y0 + sg * (t * 0.06 + u * u * 0.06), 1.3 - t * 0.85),
                                 thick=0.02, torn=hem(3.0 if tag == 'front' else 8.0, 0.1))
    # the tail: from the base of the spine back and down to the floor, curling, spined along its ridge
    path = [V((0, 0.24, 1.2)), V((0, 0.55, 0.95)), V((0.1, 0.9, 0.55)), V((0.3, 1.25, 0.22)), V((0.62, 1.45, 0.1)), V((0.98, 1.45, 0.08)), V((1.28, 1.25, 0.1))]
    P['tail'] = tube('tail', path, [0.2, 0.17, 0.13, 0.1, 0.07, 0.045, 0.012], flat=0.9)
    for i in range(1, 6):
        b = path[i] + V((0, 0, [0.17, 0.13, 0.1, 0.07, 0.045, 0.02][i - 1] * 0.8))
        d = (path[i + 1] - path[i]).normalized()
        P[f'tspike{i}'] = spike(f'tspike{i}', b, b + V((0, 0, 0.18 - i * 0.025)) + d * 0.06, 0.05 - i * 0.006)
    # spines down the back of the neck and the spine
    for i in range(6):
        b = V((0, 0.25 - (i < 2) * 0.12, 2.3 - i * 0.18))
        P[f'spine{i}'] = spike(f'spine{i}', b, b + V((0, 0.2 - i * 0.012, 0.1)), 0.05 - i * 0.004)
    return P

gear = build_gear()

def build_glow():
    g = {}
    for s, n in SIDES:
        ob = orb('eye.' + n, H + V((s * 0.1, -0.2, 0.05)), (0.05, 0.02, 0.022), rot=(0, s * -0.4, s * -0.3))
        sit_on(ob, body, gap=0.003)
        g['eye.' + n] = (ob, 'head')
    # the furnace in the chest: a crack of light between the pectorals
    pts = [V((0, 0, 2.06)), V((0.03, 0, 1.98)), V((-0.02, 0, 1.9)), V((0.025, 0, 1.8)), V((0.0, 0, 1.7))]
    t = Tree(); i = None
    for k, p in enumerate(pts):
        w = 0.04 * math.sin((k + 0.5) / len(pts) * math.pi) + 0.008
        i = t.add(p + V((0, -0.3, 0)), (w, 0.012), i)
    rift = t.build('rift', 1)
    sit_on(rift, body, gap=0.002)
    g['rift'] = (rift, 'chest')
    # and the throat glowing through the open jaws
    g['maw'] = (orb('maw', H + V((0, -0.3, -0.13)), (0.05, 0.12, 0.025)), 'head')
    return g
glow = build_glow()

def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'scales', ('smooth', None)
    if name.startswith(('wingbone', 'tspike', 'spine', 'horn', 'cheek', 'talon', 'toeclaw')):
        rule = {'wingbone': ('rigid', 'chest'), 'tspike': ('rigid', 'hips'), 'spine': ('rigid', 'chest'), 'talon': ('rigid', 'hand.' + str(side)),
                'toeclaw': ('rigid', 'foot.' + str(side))}
        key = next((k for k in rule if name.startswith(k)), None)
        return 'horn', rule.get(key, ('rigid', 'head'))
    if name.startswith('membrane'): return 'membrane', ('rigid', 'chest')
    if name.startswith(('tooth', 'ltooth')): return 'horn', ('rigid', 'head')
    if name.startswith(('pauldron', 'pspike')): return 'gold', ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('bracer'): return 'gold', ('rigid', 'forearm.' + side)
    if name.startswith('greave'): return 'gold', ('rigid', 'shin.' + side)
    if name.startswith(('crown',)): return 'gold', ('rigid', 'head')
    if name == 'collar': return 'gold', ('smooth', {'chest', 'neck'})
    if name == 'belt': return 'gold', ('rigid', 'hips')
    if name.startswith('loin'): return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'tail': return 'scales', ('rigid', 'hips')
    raise KeyError(name)

def tri_target(name, tris):
    if name == 'body_high': return 15000
    if name.startswith('membrane'): return 2600
    if name.startswith('wingbone'): return 1400
    if name == 'tail': return 2400
    if name.startswith('horn.'): return 1200
    if name in ('collar', 'belt'): return 1400
    if name.startswith(('pauldron', 'bracer', 'greave')): return 900
    if name.startswith('loin'): return 700
    return min(tris, 300)

MATS = {
    'scales': mat_hide('scales', [(0.3, (0.07, 0.025, 0.02)), (0.55, (0.18, 0.05, 0.035)), (0.8, (0.3, 0.1, 0.05))], fissure=(1.0, 0.7, 0.25), scale=32.0, big=8.0),
    'membrane': mat_skin('membrane', [(0.3, (0.12, 0.03, 0.03)), (0.7, (0.3, 0.08, 0.05))], pores=30.0, wrinkle=5.0, rough=0.6, sss=(0.4, 0.1, 0.05)),
    'horn': mat_horn('horn', 0.0, 3.4, [(0.0, (0.06, 0.04, 0.04)), (0.5, (0.18, 0.13, 0.1)), (1.0, (0.72, 0.64, 0.5))]),
    'gold': mat_metal('gold', (0.75, 0.5, 0.18), (1.0, 0.86, 0.55), rough=0.26, engrave=(0.3, 0.12, 0.05)),
    'cloth': mat_cloth('cloth', 0.4, 1.3, [(0.0, (0.03, 0.005, 0.005)), (0.5, (0.18, 0.02, 0.02)), (1.0, (0.3, 0.04, 0.03))]),
}
FLAT = {'scales': (0.2, 0.06, 0.04, 0.5, 0), 'membrane': (0.25, 0.07, 0.05, 0.6, 0), 'horn': (0.3, 0.24, 0.2, 0.45, 0),
        'gold': (0.8, 0.55, 0.22, 0.28, 1), 'cloth': (0.2, 0.03, 0.03, 0.85, 0)}

finish('Antares', OUT, J, BONES, {'body_high': body, **gear}, glow, part_info, MATS, FLAT, tri_target, (1.0, 0.84, 0.42))
