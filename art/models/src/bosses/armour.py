# armour.py: the pieces every boss in Antares's style shares (see antares.py, the reference).
# A carved athletic body; one armour plate per muscle, cut along the creases where muscles meet so
# mail shows between them; ringed horns; the standard material set (blackened steel, chipped paint,
# mail, leather, bone, horn, cloth); which bones carry each plate; the triangle budget per part.
# The weekly bosses import it:  from armour import *
from kit import *

# (push off the body, thickness, rolled rim, bead, rivet spacing, fairing) per muscle
MPLATE = {'pec': (0.016, 0.015, 0.014, True, 0.07, 2), 'frontdelt': (0.036, 0.014, 0.01, True, 0.0, 2),
          'sidedelt': (0.034, 0.016, 0.012, True, 0.06, 2), 'reardelt': (0.032, 0.014, 0.01, True, 0.0, 2),
          'uppertrap': (0.024, 0.013, 0.009, True, 0.0, 2), 'midtrap': (0.022, 0.012, 0.008, False, 0.0, 2),
          'lat': (0.024, 0.014, 0.012, True, 0.08, 2), 'erector': (0.02, 0.012, 0.008, False, 0.0, 2),
          'oblique': (0.022, 0.012, 0.008, False, 0.0, 2), 'scm': (0.016, 0.01, 0.0, False, 0.0, 1),
          'biceps': (0.022, 0.013, 0.008, True, 0.0, 2), 'tricepslong': (0.022, 0.013, 0.008, True, 0.0, 2),
          'tricepslat': (0.024, 0.013, 0.008, False, 0.0, 2), 'brachiorad': (0.022, 0.012, 0.008, True, 0.0, 2),
          'flexors': (0.02, 0.012, 0.0, False, 0.0, 2), 'extensors': (0.02, 0.012, 0.008, False, 0.0, 2),
          'vastuslat': (0.026, 0.014, 0.012, True, 0.08, 2), 'rectusfem': (0.028, 0.014, 0.01, True, 0.0, 2),
          'vastusmed': (0.026, 0.014, 0.01, True, 0.0, 2), 'hamstrings': (0.024, 0.013, 0.01, False, 0.0, 2),
          'adductors': (0.02, 0.012, 0.0, False, 0.0, 2), 'gastroout': (0.024, 0.013, 0.01, True, 0.0, 2),
          'gastroin': (0.024, 0.013, 0.01, True, 0.0, 2), 'tibialis': (0.022, 0.012, 0.008, False, 0.0, 2),
          'glute': (0.026, 0.014, 0.012, True, 0.0, 2)}
for _i in range(3): MPLATE[f'serratus{_i}'] = (0.018, 0.01, 0.0, False, 0.0, 1)
for _i in range(4): MPLATE[f'ab{_i}'] = (0.022, 0.013, 0.008, False, 0.0, 1)

# the plate groups, to leave a region bare (a robed boss keeps only its arms and shoulders, say)
TORSO = ('pec', 'uppertrap', 'midtrap', 'lat', 'erector', 'oblique', 'scm', 'serratus', 'ab')
SHOULDERS = ('frontdelt', 'sidedelt', 'reardelt')
ARMS = ('biceps', 'tricepslong', 'tricepslat', 'brachiorad', 'flexors', 'extensors')
LEGS = ('vastuslat', 'rectusfem', 'vastusmed', 'hamstrings', 'adductors', 'gastroout', 'gastroin', 'tibialis', 'glute')

def armoured_body(J, mass=1.0, waist=0.88, cut=1, hands='claw', extra=None, voxel=0.01, chisel_amt=(3, 32, 0.3)):
    """The carved body and what the plates are cut from. extra(obs) may append muscles of its own
    (wing roots, a hunch) before the remesh. Returns body, hands, src (the rounded body the plates
    are lifted from), fields (each muscle's ownership of src's vertices) and shell (a smoothed copy
    for the plates that span several muscles: couters, knee cops, belts)."""
    obs, hd = athlete(J, mass=mass, hands=hands, cut=cut, waist=waist)
    if extra: extra(obs)
    musc = muscle_copies(obs)
    body = remesh(obs, 'body_high', voxel=voxel, smooth=2, factor=0.6)
    define(body, 1.8, 3)
    sm = body.modifiers.new('sm', 'SMOOTH'); sm.iterations = 2; sm.factor = 0.5; apply_mods(body)
    src = body.copy(); src.data = body.data.copy(); src.name = 'muscle_src'; link(src)
    if chisel_amt: chisel(body, *chisel_amt)
    fields, _ = muscle_fields(src, musc)
    for o in musc.values(): bpy.data.objects.remove(o)
    shell = body.copy(); shell.data = body.data.copy(); shell.name = 'armour_shell'; link(shell)
    lp = shell.modifiers.new('lap', 'LAPLACIANSMOOTH'); lp.iterations = 45; lp.lambda_factor = 2.0; lp.use_normalized = True
    apply_mods(shell)
    return body, hd, src, fields, shell

def muscle_plates(P, src, fields, only=None, skip=(), scale=1.0, gap=0.018, table=None):
    """A plate per muscle into P as 'm.<muscle>.<side>'. only/skip: muscle-name prefixes to keep or
    leave bare. scale multiplies push and thickness (a heavier armour)."""
    table = table or MPLATE
    for key, f in fields.items():
        lbl = key.split('.')[0]
        if lbl not in table or (f > gap).sum() < 12: continue
        if only is not None and not lbl.startswith(tuple(only)): continue
        if skip and lbl.startswith(tuple(skip)): continue
        push, thick, rim, bead, rv, sm = table[lbl]
        # big plates are forged in flat planes meeting at hard ridges, not blown round like the muscle
        ob = plate(src, 'm.' + key, lambda p: True, push=push * scale, thick=thick * scale, smooth=sm,
                   facets=0.06 if rim >= 0.01 else 0.0, bevel=0.003, rim=rim, rivets=rv, bead=bead, field=f, gap=gap)
        if ob is not None and len(ob.data.vertices) > 8:
            P['m.' + key] = ob
    return P

def cleanup(*obs):
    for o in obs:
        if o is not None and o.name in bpy.data.objects: bpy.data.objects.remove(o)

def ribbed(name, pts, radii, n=60, ribs=14, depth=0.09, flat=1.2):
    """A horn: the path smoothed (Catmull-Rom), tapering, ringed with growth ridges and finer uneven
    rings between them; carries the 'hv' attribute mat_horn2(along='hv') reads."""
    pts = [V(p) for p in pts]
    def cr(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); u = f - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    def rad(t):
        f = t * (len(radii) - 1); i = min(int(f), len(radii) - 2); u = f - i
        return radii[i] * (1 - u) + radii[i + 1] * u
    t = Tree(); prev = None
    for k in range(n):
        u = k / (n - 1)
        rr = random.Random(k * 7 + len(name))
        r = rad(u) * (1 + depth * math.sin(u * ribs * math.tau) * (1 - u) ** 0.5 + 0.02 * math.sin(u * ribs * 3.7 * math.tau) * (1 - u)
                      + rr.uniform(-0.012, 0.012))
        prev = t.add(cr(u), (max(r, 0.002), max(r, 0.002) * flat), prev)
    ob = t.build(name, 1)
    return along(ob, [cr(k / 199) for k in range(200)])

# which bones carry each muscle plate: torso plates bend with the spine, limb plates ride their bone
MBONES = {
    'pec': ('smooth', ('spine', 'chest')), 'serratus': ('smooth', ('spine', 'chest')), 'oblique': ('smooth', ('hips', 'spine')),
    'lat': ('smooth', ('spine', 'chest')), 'midtrap': ('smooth', ('spine', 'chest')), 'erector': ('smooth', ('hips', 'spine')),
    'ab': ('smooth', ('hips', 'spine')), 'uppertrap': ('smooth', ('chest', 'neck')), 'scm': ('smooth', ('chest', 'neck')),
    'frontdelt': ('smooth', ('chest', 'upperarm')), 'sidedelt': ('smooth', ('chest', 'upperarm')), 'reardelt': ('smooth', ('chest', 'upperarm')),
    'biceps': ('rigid', 'upperarm'), 'tricepslong': ('rigid', 'upperarm'), 'tricepslat': ('rigid', 'upperarm'),
    'brachiorad': ('rigid', 'forearm'), 'flexors': ('rigid', 'forearm'), 'extensors': ('rigid', 'forearm'),
    'vastuslat': ('rigid', 'thigh'), 'rectusfem': ('rigid', 'thigh'), 'vastusmed': ('rigid', 'thigh'), 'hamstrings': ('rigid', 'thigh'),
    'adductors': ('rigid', 'thigh'), 'glute': ('smooth', ('hips', 'thigh')),
    'gastroout': ('rigid', 'shin'), 'gastroin': ('rigid', 'shin'), 'tibialis': ('rigid', 'shin'),
}

def side_of(name):
    return next((x for x in name.split('.') if x in ('L', 'R')), None)

def muscle_bones(name):
    """The skinning rule for a plate named 'm.<muscle>.<side>'."""
    label, side = name.split('.')[1], side_of(name)
    key = next(k for k in sorted(MBONES, key=len, reverse=True) if label.startswith(k))
    kind, b = MBONES[key]
    sided = lambda x: x + '.' + side if x in ('upperarm', 'forearm', 'thigh', 'shin') else x
    return (kind, sided(b)) if kind == 'rigid' else (kind, {sided(x) for x in b})

def plate_tris(name, big=700, small=380):
    """Triangle target for a muscle plate: the big readable ones get more."""
    return big if name.startswith(('m.pec', 'm.sidedelt', 'm.frontdelt', 'm.reardelt', 'm.uppertrap', 'm.lat', 'm.glute', 'm.vastuslat')) else small

def plate_uv(name):
    return 2.0 if name.startswith(('m.pec', 'm.sidedelt', 'm.frontdelt', 'm.reardelt', 'm.uppertrap', 'm.scm')) else 1.3

def knight_mats(accent=(0.6, 0.04, 0.01), steel=(0.026, 0.025, 0.028), paint=(0.05, 0.006, 0.005), cloth=None, leather=(0.03, 0.018, 0.012),
                bone=(0.17, 0.14, 0.1), horn=((0.01, 0.008, 0.008), (0.16, 0.06, 0.04)), engrave=None):
    """The standard set, keyed: steel, paint, helm, mail, leather, bone, horn, cloth, banner.
    accent: the glow colour the helm's etching smoulders in. cloth: three colour stops, hem to top."""
    eng = engrave or tuple(c * 0.4 + 0.004 for c in paint)
    cl = cloth or [(0.0, tuple(c * 2.0 for c in paint)), (0.3, tuple(c * 0.6 + 0.01 for c in paint)), (1.0, (0.012, 0.01, 0.012))]
    mats = {
        'steel': mat_steel('steel', base=steel, rough=0.44, engrave=eng),
        'paint': mat_steel('paint', base=steel, rough=0.44, paint=(paint, 0.42)),
        'helm': mat_steel('helm', base=steel, rough=0.4, engrave=eng, glow=accent),
        'mail': mat_mail('mail'),
        'leather': mat_leather('leather', col=leather),
        'bone': mat_bone('bone', col=bone),
        'horn': mat_horn2('horn', root=horn[0], tip=horn[1], rough=0.42, bands=16.0, along='hv'),
        'cloth': mat_fabric('cloth', 0.0, 2.0, cl),
        'banner': mat_fabric('banner', 0.0, 4.0, [(0.0, tuple(c * 0.6 for c in paint)), (0.35, tuple(c * 2.0 for c in paint)), (1.0, tuple(c * 1.7 for c in paint))], sheen=0.5),
    }
    pc = tuple(min(1.0, c * 4) for c in paint)
    flat = {'mail': (0.04, 0.04, 0.04, 0.5, 1), 'helm': (0.04, 0.04, 0.045, 0.35, 1), 'steel': (0.04, 0.04, 0.045, 0.35, 1),
            'paint': (*pc, 0.5, 0), 'leather': (0.04, 0.025, 0.015, 0.65, 0), 'bone': (0.3, 0.25, 0.19, 0.55, 0),
            'horn': (0.04, 0.025, 0.02, 0.4, 0), 'cloth': (*tuple(min(1, c * 2) for c in cl[0][1]), 0.9, 0), 'banner': (*pc, 0.85, 0)}
    return mats, flat

def posed(base, **adds):
    """base pose dict plus rotations added per bone: posed(p, spine=(0.1, 0, 0))."""
    p = dict(base)
    for k, (x, y, z) in adds.items():
        k = k.replace('_L', '.L').replace('_R', '.R')
        q = p.get(k, (0, 0, 0)); p[k] = (q[0] + x, q[1] + y, q[2] + z)
    return p

def fade_idle(p, k):
    """Scale an idle pose down by k (1 = full idle), keeping the private keys (_hips_loc, _a, _b)."""
    return {key: tuple(v * k for v in val) if isinstance(val, tuple) and not key.startswith('_') else val for key, val in p.items()}
