# finish.py: run by build.py with body, armour, cloak, glow in scope.
# Materials (procedural, then baked to an atlas), low-poly copies, the rig, the animations, the export.
import numpy as np

# ── which material and which bone each part takes ──
def part_info(name):
    side = name.split('.')[-1] if '.' in name else None
    if name == 'body_high': return 'hide', ('smooth', None)
    if name == 'tabard': return 'cloth', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'cloak': return 'cloth', ('smooth', {'chest', 'spine', 'hips'})
    if name == 'cuirass': return 'steel', ('smooth', {'chest', 'spine'})
    if name == 'belt': return 'leather', ('rigid', 'hips')
    if name.startswith('tasset'): return 'steel', ('smooth', {'hips', 'thigh.L', 'thigh.R'})
    if name == 'gorget': return 'steel', ('smooth', {'neck', 'chest'})
    if name == 'helm': return 'steel', ('rigid', 'head')
    if name.startswith('horn'): return 'horn', ('rigid', 'head')
    if name.startswith('cheek'): return 'steel', ('rigid', 'head')
    if name.startswith('crown'): return 'gold', ('rigid', 'head')
    if name.startswith('vambrace'): return 'steel', ('rigid', 'forearm.' + side)
    if name.startswith('espike'): return 'obsidian', ('rigid', 'forearm.' + side)
    if name.startswith('cuisse'): return 'steel', ('rigid', 'thigh.' + side)
    if name.startswith('greave'): return 'steel', ('rigid', 'shin.' + side)
    if name.startswith('kneecop'): return 'gold', ('rigid', 'shin.' + side)
    if name.startswith('kspike'): return 'obsidian', ('rigid', 'shin.' + side)
    if name.startswith('pauldron'): return ('gold' if name.startswith('pauldron0') else 'steel'), ('smooth', {'chest', 'upperarm.' + side})
    if name.startswith('pspike'): return 'obsidian', ('smooth', {'chest', 'upperarm.' + side})
    raise KeyError(name)

TRI_BUDGET = {'body_high': 18000, 'cloak': 3600, 'cuirass': 3200, 'helm': 2400, 'belt': 900, 'gorget': 700}
def tri_target(name, tris):
    if name in TRI_BUDGET: return TRI_BUDGET[name]
    if name.startswith('horn'): return 1400
    if name.startswith(('vambrace', 'cuisse', 'greave')): return 1300
    if name.startswith('pauldron'): return 1100
    return min(tris, 500)

def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

# ── procedural materials (Cycles nodes): what gets baked ──
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    P = nt.nodes['Principled BSDF']
    return m, nt, P

def nodes(nt):
    def n(kind, **kw):
        x = nt.nodes.new(kind)
        for k, v in kw.items():
            if k.startswith('i_'):
                x.inputs[k[2:].replace('_', ' ')].default_value = v
            else:
                setattr(x, k, v)
        return x
    return n

def L(nt, a, b):
    nt.links.new(a, b)

def ramp(n, nt, fac, stops):
    r = n('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
    el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = el.new(pos); e.color = (*col, 1)
    L(nt, fac, r.inputs['Fac'])
    return r

def mat_hide():
    m, nt, P = new_mat('hide'); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    # scales: voronoi cells, with deep creases between them
    vor = n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', i_Scale=26.0); L(nt, tc.outputs['Object'], vor.inputs['Vector'])
    vor2 = n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', i_Scale=7.0); L(nt, tc.outputs['Object'], vor2.inputs['Vector'])
    noi = n('ShaderNodeTexNoise', i_Scale=4.0, i_Detail=8.0, i_Roughness=0.6); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    col = ramp(n, nt, noi.outputs['Fac'], [(0.3, (0.07, 0.05, 0.09)), (0.55, (0.15, 0.11, 0.17)), (0.75, (0.24, 0.17, 0.25))])
    crease = ramp(n, nt, vor.outputs['Distance'], [(0.0, (0.25, 0.25, 0.25)), (0.12, (1, 1, 1))])
    mul = n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=1.0)
    L(nt, col.outputs['Color'], mul.inputs[6]); L(nt, crease.outputs['Color'], mul.inputs[7])
    L(nt, mul.outputs[2], P.inputs['Base Color'])
    # glowing fissures: the big cracks only, where the large voronoi edges are thin
    fis = ramp(n, nt, vor2.outputs['Distance'], [(0.0, (1.0, 0.32, 0.12)), (0.025, (0.0, 0.0, 0.0))])
    gate = ramp(n, nt, noi.outputs['Fac'], [(0.5, (0, 0, 0)), (0.62, (1, 1, 1))])
    fm = n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=1.0)
    L(nt, fis.outputs['Color'], fm.inputs[6]); L(nt, gate.outputs['Color'], fm.inputs[7])
    L(nt, fm.outputs[2], P.inputs['Emission Color']); P.inputs['Emission Strength'].default_value = 1.0
    rough = ramp(n, nt, vor.outputs['Distance'], [(0.0, (0.75, 0.75, 0.75)), (0.15, (0.45, 0.45, 0.45))])
    L(nt, rough.outputs['Color'], P.inputs['Roughness'])
    b1 = n('ShaderNodeBump', i_Strength=0.6, i_Distance=0.004); L(nt, vor.outputs['Distance'], b1.inputs['Height'])
    b2 = n('ShaderNodeBump', i_Strength=0.8, i_Distance=0.01); L(nt, vor2.outputs['Distance'], b2.inputs['Height']); L(nt, b1.outputs['Normal'], b2.inputs['Normal'])
    L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_metal(name, base, edge, rough=0.32, engrave=True):
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    geo = n('ShaderNodeNewGeometry')
    noi = n('ShaderNodeTexNoise', i_Scale=14.0, i_Detail=10.0); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    big = n('ShaderNodeTexNoise', i_Scale=2.5, i_Detail=4.0); L(nt, tc.outputs['Object'], big.inputs['Vector'])
    # worn bright edges where the surface turns sharply (pointiness), broken up by noise
    edge_m = ramp(n, nt, geo.outputs['Pointiness'], [(0.5, (0, 0, 0)), (0.56, (1, 1, 1))])
    grime = ramp(n, nt, big.outputs['Fac'], [(0.35, (0.55, 0.55, 0.55)), (0.65, (1, 1, 1))])
    basec = n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=1.0, i_A=(*base, 1))
    L(nt, grime.outputs['Color'], basec.inputs[7])
    ec = n('ShaderNodeMix', data_type='RGBA', i_B=(*edge, 1))
    L(nt, edge_m.outputs['Color'], ec.inputs['Factor']); L(nt, basec.outputs[2], ec.inputs[6])
    P.inputs['Metallic'].default_value = 1.0
    rr = ramp(n, nt, noi.outputs['Fac'], [(0.3, (rough - 0.1,) * 3), (0.7, (rough + 0.14,) * 3)])
    L(nt, rr.outputs['Color'], P.inputs['Roughness'])
    if engrave:
        # engraved filigree: thin ridged bands swirling over the plates
        wav = n('ShaderNodeTexWave', wave_type='RINGS', i_Scale=6.0, i_Distortion=7.0, i_Detail=3.0); L(nt, tc.outputs['Object'], wav.inputs['Vector'])
        lines = ramp(n, nt, wav.outputs['Fac'], [(0.0, (1, 1, 1)), (0.08, (0, 0, 0))])
        gate = ramp(n, nt, big.outputs['Fac'], [(0.45, (0, 0, 0)), (0.5, (1, 1, 1))])
        mm = n('ShaderNodeMath', operation='MULTIPLY'); L(nt, lines.outputs['Color'], mm.inputs[0]); L(nt, gate.outputs['Color'], mm.inputs[1])
        gold = n('ShaderNodeMix', data_type='RGBA', i_B=(0.95, 0.66, 0.28, 1))
        L(nt, mm.outputs[0], gold.inputs['Factor']); L(nt, ec.outputs[2], gold.inputs[6])
        L(nt, gold.outputs[2], P.inputs['Base Color'])
        b = n('ShaderNodeBump', i_Strength=0.5, i_Distance=0.003, invert=True); L(nt, mm.outputs[0], b.inputs['Height'])
        b2 = n('ShaderNodeBump', i_Strength=0.08, i_Distance=0.002); L(nt, noi.outputs['Fac'], b2.inputs['Height']); L(nt, b.outputs['Normal'], b2.inputs['Normal'])
        L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    else:
        L(nt, ec.outputs[2], P.inputs['Base Color'])
        b2 = n('ShaderNodeBump', i_Strength=0.12, i_Distance=0.002); L(nt, noi.outputs['Fac'], b2.inputs['Height'])
        L(nt, b2.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_horn():
    m, nt, P = new_mat('horn'); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    sep = n('ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sep.inputs['Vector'])
    mr = n('ShaderNodeMapRange', i_From_Min=2.85, i_From_Max=3.7); L(nt, sep.outputs['Z'], mr.inputs['Value'])
    col = ramp(n, nt, mr.outputs['Result'], [(0.0, (0.05, 0.04, 0.05)), (0.55, (0.2, 0.15, 0.12)), (1.0, (0.78, 0.72, 0.6))])
    wav = n('ShaderNodeTexWave', i_Scale=18.0, i_Distortion=2.0, wave_profile='SAW'); L(nt, tc.outputs['Object'], wav.inputs['Vector'])
    wav.bands_direction = 'Z'
    L(nt, col.outputs['Color'], P.inputs['Base Color'])
    P.inputs['Roughness'].default_value = 0.42
    b = n('ShaderNodeBump', i_Strength=0.5, i_Distance=0.006); L(nt, wav.outputs['Fac'], b.inputs['Height'])
    L(nt, b.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_cloth():
    m, nt, P = new_mat('cloth'); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    sep = n('ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sep.inputs['Vector'])
    mr = n('ShaderNodeMapRange', i_From_Min=0.1, i_From_Max=0.9); L(nt, sep.outputs['Z'], mr.inputs['Value'])
    noi = n('ShaderNodeTexNoise', i_Scale=6.0, i_Detail=6.0); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    weave = n('ShaderNodeTexWave', i_Scale=160.0, wave_profile='SIN'); L(nt, tc.outputs['Object'], weave.inputs['Vector'])
    # deep royal violet, scorched darker toward the torn hem
    col = ramp(n, nt, mr.outputs['Result'], [(0.0, (0.03, 0.015, 0.04)), (0.5, (0.13, 0.05, 0.2)), (1.0, (0.18, 0.07, 0.27))])
    mul = n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', i_Factor=0.45)
    L(nt, col.outputs['Color'], mul.inputs[6]); L(nt, noi.outputs['Color'], mul.inputs[7])
    L(nt, mul.outputs[2], P.inputs['Base Color'])
    P.inputs['Roughness'].default_value = 0.85
    P.inputs['Sheen Weight'].default_value = 0.4
    b = n('ShaderNodeBump', i_Strength=0.15, i_Distance=0.002); L(nt, weave.outputs['Fac'], b.inputs['Height'])
    L(nt, b.outputs['Normal'], P.inputs['Normal'])
    return m

def mat_plain(name, col, rough, metal=0.0):
    m, nt, P = new_mat(name); n = nodes(nt)
    tc = n('ShaderNodeTexCoord')
    noi = n('ShaderNodeTexNoise', i_Scale=30.0, i_Detail=8.0); L(nt, tc.outputs['Object'], noi.inputs['Vector'])
    P.inputs['Base Color'].default_value = (*col, 1)
    P.inputs['Metallic'].default_value = metal
    rr = ramp(n, nt, noi.outputs['Fac'], [(0.3, (rough - 0.08,) * 3), (0.7, (rough + 0.1,) * 3)])
    L(nt, rr.outputs['Color'], P.inputs['Roughness'])
    b = n('ShaderNodeBump', i_Strength=0.2, i_Distance=0.003); L(nt, noi.outputs['Fac'], b.inputs['Height'])
    L(nt, b.outputs['Normal'], P.inputs['Normal'])
    return m

MATS = {
    'hide': mat_hide(),
    'steel': mat_metal('steel', (0.2, 0.21, 0.25), (0.62, 0.64, 0.7)),
    'gold': mat_metal('gold', (0.75, 0.5, 0.2), (1.0, 0.85, 0.55), rough=0.28, engrave=False),
    'obsidian': mat_plain('obsidian', (0.04, 0.035, 0.05), 0.2, 0.0),
    'leather': mat_plain('leather', (0.1, 0.06, 0.045), 0.6),
    'horn': mat_horn(),
    'cloth': mat_cloth(),
}
GROUPS = list(MATS)

# ── weights: distance to bone segments, restricted to the bones a part may follow ──
def bone_segs():
    return {b: (J[h], J[t]) for b, h, t, _ in BONES}
SEGS = bone_segs()

def seg_dist(p, a, b):
    t = seg_t(p, a, b)
    return (p - a.lerp(b, t)).length

def smooth_weights(co, allowed):
    side = 'L' if co.x > 0 else 'R'
    cands = []
    for b, (a, t) in SEGS.items():
        if allowed is not None and b not in allowed: continue
        if allowed is None and b[-2:] in ('.L', '.R'):
            # limbs only take their own side, and only once clear of the torso's middle
            if b[-1] != side or abs(co.x) < 0.08: continue
        d = max(seg_dist(co, a, t), 0.02)
        cands.append((1.0 / d ** 5, b))
    cands.sort(reverse=True)
    cands = cands[:3]
    s = sum(w for w, _ in cands)
    return [(b, w / s) for w, b in cands if w / s > 0.02]

def assign_weights(ob, rule):
    kind, arg = rule
    groups = {}
    def vg(name):
        if name not in groups: groups[name] = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        return groups[name]
    if kind == 'rigid':
        vg(arg).add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')
        return
    for v in ob.data.vertices:
        for b, w in smooth_weights(v.co, arg):
            vg(b).add([v.index], w, 'REPLACE')

# ── high (detail, for baking) and low (what ships) for every part ──
parts = {'body_high': body, 'cloak': cloak, **armour}
highs, lows = {}, []
for name, hi in parts.items():
    key, rule = part_info(name)
    hi.data.materials.clear(); hi.data.materials.append(MATS[key])
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = name + '_low'; link(lo)
    tris = tri_count(hi)
    tgt = tri_target(name, tris)
    if tris > tgt:
        d = lo.modifiers.new('dec', 'DECIMATE'); d.ratio = tgt / tris
        apply_mods(lo)
    lo.data.materials.clear()
    for g in GROUPS:
        lo.data.materials.append(bpy.data.materials.get('slot_' + g) or bpy.data.materials.new('slot_' + g))
    gi = GROUPS.index(key)
    for p in lo.data.polygons: p.material_index = gi
    assign_weights(lo, rule)
    highs.setdefault(key, []).append(hi)
    lows.append(lo)

boss = join(lows, 'boss')
print('triangles (body mesh):', tri_count(boss))

# one UV atlas for the whole figure
activate(boss)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
bpy.ops.object.mode_set(mode='OBJECT')

def make_img(name, size, data=True):
    im = bpy.data.images.new(name, size, size, alpha=False)
    if data: im.colorspace_settings.name = 'Non-Color'
    return im

if BAKE:
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    scene.render.bake.margin = 6
    IM = {
        'base': make_img('boss_base', TEX, data=False), 'normal': make_img('boss_normal', TEX), 'rough': make_img('boss_rough', TEX),
        'metal': make_img('boss_metal', TEX), 'emit': make_img('boss_emit', TEX // 2, data=False), 'ao': make_img('boss_ao', TEX),
    }
    IM['normal'].generated_color = (0.5, 0.5, 1, 1)
    # split the low mesh by group so each bakes only from its own high parts
    activate(boss)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    pieces = [o for o in bpy.context.selected_objects]
    bake_mat = bpy.data.materials.new('bake'); bake_mat.use_nodes = True
    img_node = bake_mat.node_tree.nodes.new('ShaderNodeTexImage')
    bake_mat.node_tree.nodes.active = img_node

    def route(m, sock):
        nt = m.node_tree; P = nt.nodes['Principled BSDF']; O = nt.nodes['Material Output']
        E = nt.nodes.new('ShaderNodeEmission'); E.name = '_route'
        src = P.inputs[sock]
        if src.is_linked:
            nt.links.new(src.links[0].from_socket, E.inputs['Color'])
        elif sock == 'Emission Color' and P.inputs['Emission Strength'].default_value == 0:
            E.inputs['Color'].default_value = (0, 0, 0, 1)   # unlit: the default colour is white, but strength 0
        else:
            v = src.default_value
            E.inputs['Color'].default_value = tuple(v) if hasattr(v, '__len__') else (v, v, v, 1)
        nt.links.new(E.outputs['Emission'], O.inputs['Surface'])
    def unroute(m):
        nt = m.node_tree; P = nt.nodes['Principled BSDF']; O = nt.nodes['Material Output']
        nt.nodes.remove(nt.nodes['_route'])
        nt.links.new(P.outputs['BSDF'], O.inputs['Surface'])

    CH = [('base', 'Base Color'), ('rough', 'Roughness'), ('metal', 'Metallic'), ('emit', 'Emission Color'), ('normal', None)]
    for piece in pieces:
        key = piece.data.materials[piece.data.polygons[0].material_index].name[len('slot_'):]
        piece.data.materials.clear(); piece.data.materials.append(bake_mat)
        src = highs[key]
        for ch, sock in CH:
            img_node.image = IM[ch]
            activate(piece)
            for h in src: h.select_set(True)
            if sock:
                route(MATS[key], sock)
                bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, use_clear=False, margin=6)
                unroute(MATS[key])
            else:
                bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, use_clear=False, margin=6)
            print('baked', key, ch, flush=True)
    boss = join(pieces, 'boss')
    # ambient occlusion from the low figure itself, so armour shadows the body beneath it
    for hs in highs.values():
        for h in hs: h.hide_render = True
    scene.cycles.samples = 48
    img_node.image = IM['ao']
    activate(boss)
    bpy.ops.object.bake(type='AO', use_clear=True, margin=6)
    print('baked ao', flush=True)

    # pack occlusion, roughness, metalness into one ORM map; darken the colour a touch in the crevices
    def px(im): a = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(a); return a.reshape(-1, 4)
    ao, ro, me = px(IM['ao']), px(IM['rough']), px(IM['metal'])
    orm = make_img('boss_orm', TEX)
    o = np.stack([ao[:, 0], ro[:, 0], me[:, 0], np.ones(len(ao))], 1).astype(np.float32)
    orm.pixels.foreach_set(o.ravel())
    base = px(IM['base'])
    base[:, :3] *= (0.55 + 0.45 * ao[:, :1])
    IM['base'].pixels.foreach_set(base.ravel())
    for k, im in (('base', IM['base']), ('normal', IM['normal']), ('orm', orm), ('emit', IM['emit'])):
        im.filepath_raw = os.path.join(os.path.dirname(OUT), f'boss_{k}.png'); im.file_format = 'PNG'; im.save()

    # the shipped material: textures only
    fm = bpy.data.materials.new('Monarch'); fm.use_nodes = True
    nt = fm.node_tree; P = nt.nodes['Principled BSDF']; n = nodes(nt)
    tb = n('ShaderNodeTexImage', image=IM['base']); L(nt, tb.outputs['Color'], P.inputs['Base Color'])
    tn = n('ShaderNodeTexImage', image=IM['normal']); nm = n('ShaderNodeNormalMap'); L(nt, tn.outputs['Color'], nm.inputs['Color']); L(nt, nm.outputs['Normal'], P.inputs['Normal'])
    to = n('ShaderNodeTexImage', image=orm); sp = n('ShaderNodeSeparateColor'); L(nt, to.outputs['Color'], sp.inputs['Color'])
    L(nt, sp.outputs['Green'], P.inputs['Roughness']); L(nt, sp.outputs['Blue'], P.inputs['Metallic'])
    te = n('ShaderNodeTexImage', image=IM['emit']); L(nt, te.outputs['Color'], P.inputs['Emission Color'])
    P.inputs['Emission Strength'].default_value = 3.0
    # glTF occlusion: the exporter reads a node group named "glTF Material Output"
    grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gn = nt.nodes.new('ShaderNodeGroup'); gn.node_tree = grp
    L(nt, sp.outputs['Red'], gn.inputs['Occlusion'])
    fm.use_backface_culling = True
    boss.data.materials.clear(); boss.data.materials.append(fm)
    for hs in highs.values():
        for h in hs: bpy.data.objects.remove(h)
else:
    # preview: flat colours per group, no bake
    flat = {'hide': (0.15, 0.11, 0.17, 0.6, 0), 'steel': (0.25, 0.26, 0.3, 0.35, 1), 'gold': (0.8, 0.55, 0.22, 0.3, 1),
            'obsidian': (0.05, 0.04, 0.06, 0.25, 0), 'leather': (0.12, 0.07, 0.05, 0.6, 0), 'horn': (0.3, 0.24, 0.2, 0.45, 0),
            'cloth': (0.14, 0.05, 0.2, 0.85, 0)}
    for i, g in enumerate(GROUPS):
        m = boss.data.materials[i]; m.use_nodes = True
        P = m.node_tree.nodes['Principled BSDF']; c = flat[g]
        P.inputs['Base Color'].default_value = (*c[:3], 1); P.inputs['Roughness'].default_value = c[3]; P.inputs['Metallic'].default_value = c[4]
    for hs in highs.values():
        for h in hs: bpy.data.objects.remove(h)

smooth_shade(boss)

# ── glow material: the eyes and the chest rift, tagged so the raid can recolour them ──
gm = bpy.data.materials.new('MonarchGlow'); gm.use_nodes = True; gm.use_backface_culling = True
P = gm.node_tree.nodes['Principled BSDF']
P.inputs['Base Color'].default_value = (1.0, 0.36, 0.42, 1)
P.inputs['Emission Color'].default_value = (1.0, 0.36, 0.42, 1)
P.inputs['Emission Strength'].default_value = 6.0
for ob in glow.values():
    ob.data.materials.clear(); ob.data.materials.append(gm)
    ob['eye'] = True

# ── the rig ──
arm = bpy.data.armatures.new('rig'); rig = link(bpy.data.objects.new('rig', arm))
activate(rig)
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for b, h, t, par in BONES:
    e = arm.edit_bones.new(b); e.head = J[h]; e.tail = J[t]
    if b in ('hips',): e.roll = 0
    if par: e.parent = eb[par]; e.use_connect = False
    eb[b] = e
bpy.ops.object.mode_set(mode='OBJECT')
boss.parent = rig
md = boss.modifiers.new('rig', 'ARMATURE'); md.object = rig
bpy.context.view_layer.update()
for name, ob in glow.items():
    bone = 'head' if name.startswith('eye') else 'chest'
    mw = ob.matrix_world.copy()
    ob.parent = rig; ob.parent_type = 'BONE'; ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = mw

# ── animation: rotations authored in figure space (X bends forward, Y tips sideways, Z turns) ──
FPS = 30
scene.render.fps = FPS
def local_q(pb, ex, ey, ez):
    R = pb.bone.matrix_local.to_quaternion()
    q = Matrix.Rotation(ez, 4, 'Z').to_quaternion() @ Matrix.Rotation(ey, 4, 'Y').to_quaternion() @ Matrix.Rotation(ex, 4, 'X').to_quaternion()
    return R.inverted() @ q @ R

def key_action(name, frames, pose_at):
    rig.animation_data_create()
    rig.animation_data.action = None
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
    for f in range(0, frames + 1, 2):
        t = f / FPS
        pose = pose_at(t)
        for pb in rig.pose.bones:
            e = pose.get(pb.name, (0, 0, 0))
            pb.rotation_quaternion = local_q(pb, *e)
            pb.keyframe_insert('rotation_quaternion', frame=f)
        hp = rig.pose.bones['hips']
        hp.location = V(pose.get('_hips_loc', (0, 0, 0)))
        hp.keyframe_insert('location', frame=f)
    act = rig.animation_data.action
    act.name = name; act.use_fake_user = True
    tr = rig.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 0, act)
    rig.animation_data.action = None
    return act

TAU = math.tau
def idle(t):
    T = 4.0; s = math.sin(TAU * t / T); c = math.cos(TAU * t / T); s2 = math.sin(2 * TAU * t / T)
    return {
        'spine': (0.03 + 0.02 * s, 0, 0.02 * c), 'chest': (0.04 * s, 0.01 * c, 0.02 * c), 'neck': (-0.02 * s, 0, 0),
        'head': (0.06 + 0.03 * s2, 0.02 * c, 0.1 * math.sin(TAU * t / T)),
        'upperarm.L': (0.05 * s, -0.06 - 0.04 * s, 0), 'upperarm.R': (0.05 * s, 0.06 + 0.04 * s, 0),
        'forearm.L': (-0.12 - 0.04 * s, 0, 0), 'forearm.R': (-0.12 - 0.04 * s, 0, 0),
        'hand.L': (-0.1, 0, 0), 'hand.R': (-0.1, 0, 0),
        'thigh.L': (-0.06, 0, 0), 'thigh.R': (-0.06, 0, 0), 'shin.L': (0.1, 0, 0), 'shin.R': (0.1, 0, 0), 'foot.L': (-0.04, 0, 0), 'foot.R': (-0.04, 0, 0),
        '_hips_loc': (0, 0, 0),
    }

def ease(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def roar(t):
    a = ease(t / 0.6) * (1 - ease((t - 0.6) / 0.35))      # gather: hunch, arms in
    b = ease((t - 0.6) / 0.35) * (1 - ease((t - 2.3) / 0.7))  # roar: rear back, arms flung wide
    tr = math.sin(t * 60) * 0.015 * b                      # the tremble at full voice
    base = idle(t)
    out = {}
    for k in set(base) | {'hand.L', 'hand.R'}:
        if k.startswith('_'): continue
        out[k] = tuple(v * (1 - max(a, b)) for v in base.get(k, (0, 0, 0)))
    def add(k, x=0, y=0, z=0):
        p = out.get(k, (0, 0, 0)); out[k] = (p[0] + x, p[1] + y, p[2] + z)
    add('spine', 0.2 * a - 0.18 * b + tr); add('chest', 0.18 * a - 0.24 * b); add('neck', 0.1 * a - 0.2 * b)
    add('head', 0.25 * a - 0.45 * b + tr)
    add('upperarm.L', 0.2 * a - 0.55 * b, 0.15 * a - 0.6 * b); add('upperarm.R', 0.2 * a - 0.55 * b, -0.15 * a + 0.6 * b)
    add('forearm.L', -0.5 * a - 0.7 * b, 0, 0.3 * b); add('forearm.R', -0.5 * a - 0.7 * b, 0, -0.3 * b)
    add('hand.L', -0.3 * a + 0.3 * b); add('hand.R', -0.3 * a + 0.3 * b)
    add('thigh.L', -0.25 * a - 0.08 * b); add('thigh.R', -0.25 * a - 0.08 * b); add('shin.L', 0.45 * a + 0.12 * b); add('shin.R', 0.45 * a + 0.12 * b)
    add('foot.L', -0.2 * a); add('foot.R', -0.2 * a)
    out['_hips_loc'] = (0, 0, 0)
    return out

key_action('Idle', 120, idle)
key_action('Roar', 90, roar)

# ── export ──
for o in list(bpy.data.objects):
    if o not in (rig, boss, *glow.values()):
        bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, export_extras=True,
    export_skins=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
    export_image_format='JPEG', export_jpeg_quality=86, export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6, export_materials='EXPORT')
print('exported', OUT, os.path.getsize(OUT), 'bytes; triangles', tri_count(boss) + sum(tri_count(o) for o in glow.values()))
