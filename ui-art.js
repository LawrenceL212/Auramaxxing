/* =========================================================================
   UI ART — painted-art slots with code-made stand-ins, plus the small SVG
   generators the shared look uses (ui-system.css).

   API
     uiArt(name, opts?)        -> HTMLElement. A <span class="ui-art"> holding a
                                  code stand-in right away. If art/ui/<name>.webp
                                  exists it is swapped for a lazy <img> (the
                                  existence check runs once per name and is
                                  cached). opts: { alt, className, style }.
     uiArtHtml(name, opts?)    -> string for innerHTML templates; call
                                  uiArtHydrate(root) afterwards to upgrade it.
     uiArtHydrate(root?)       -> swaps every [data-ui-art] stand-in under root
                                  for the real image when the file exists.
     uiArtExists(name)         -> Promise<boolean> (cached).
     UI_ART_NAMES              -> the names in art-list.md.
     uiSigil({ size, still })  -> SVG string: broken sigil + blade rays.
     uiRing({ size, r, stroke, frac, id }) -> SVG string: gold progress ring.
     uiIcon(kind)              -> 14px SVG string for an equipment kind.
     equipmentKind(name, def)  -> 'barbell' | 'dumbbell' | 'cable' | 'machine' |
                                  'bodyweight' | 'band' | 'kettlebell' | 'cardio' | 'other'
     muscleTint(muscles)       -> CSS colour var for the exercise's main muscle group.

   No image files are committed: art/ui/ is the drop folder and every name
   resolves to a stand-in until a file lands there.
   ========================================================================= */

export const UI_ART_DIR = 'art/ui/';

export const UI_ART_NAMES = [
  'gate-card-bg', 'gate-entry', 'hunter-rank-bg', 'gate-complete', 'rank-up-aura', 'reward-crystal',
  'icon-gold', 'icon-xp', 'icon-ap', 'icon-streak',
  'muscle-chest', 'muscle-back', 'muscle-shoulders', 'muscle-arms', 'muscle-legs',
  'muscle-core', 'muscle-glutes', 'muscle-calves', 'muscle-cardio', 'muscle-fullbody',
  'hunt-map-bg', 'hunt-backdrop',
];

const _exists = new Map();   // name -> Promise<boolean>

export function uiArtExists(name) {
  if (_exists.has(name)) return _exists.get(name);
  const p = new Promise(resolve => {
    if (typeof Image === 'undefined') return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = `${UI_ART_DIR}${name}.webp`;
  });
  _exists.set(name, p);
  return p;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── stand-ins ─────────────────────────────────────────────────────────── */
const GRAD = {
  'gate-card-bg':   'radial-gradient(70% 90% at 50% 30%,rgba(255,214,107,.18),rgba(255,107,53,.08) 45%,transparent 72%)',
  'gate-entry':     'radial-gradient(60% 40% at 50% 38%,rgba(91,168,255,.4),transparent 70%),linear-gradient(180deg,#0a1226,#05060a)',
  'hunter-rank-bg': 'radial-gradient(80% 50% at 50% 0%,rgba(255,214,107,.22),transparent 65%),linear-gradient(180deg,#141a2e,#05060a)',
  'gate-complete':  'radial-gradient(60% 45% at 50% 55%,rgba(161,127,255,.35),rgba(255,214,107,.14) 50%,transparent 75%),#07090e',
  'rank-up-aura':   'radial-gradient(55% 40% at 50% 40%,rgba(255,214,107,.4),transparent 70%),#07090e',
  'hunt-map-bg':    'linear-gradient(180deg,#0a1226,#05060a)',
};
const ICON_SVG = {
  'icon-gold':   '<circle cx="12" cy="12" r="8" fill="#FFD66B"/><circle cx="12" cy="12" r="5" fill="none" stroke="#a8741a" stroke-width="1.4"/>',
  'icon-xp':     '<path d="M12 2l2.6 6.4L21 9l-5 4.4L17.6 20 12 16.6 6.4 20 8 13.4 3 9l6.4-.6z" fill="#5BA8FF"/>',
  'icon-ap':     '<polygon points="12,2 22,12 12,22 2,12" fill="#A17FFF"/>',
  'icon-streak': '<path d="M12 2c1.4 5.4 6.6 7 6.6 13.2a6.6 6.6 0 0 1-13.2 0c0-2.6 1.3-4 2.6-5.2 0 2.6 1.3 2.6 2.6 2.6 0-4-1.3-6.6 1.4-10.6z" fill="#FF8A3D"/>',
  'reward-crystal': '<polygon points="12,1 20,9 12,23 4,9" fill="#5BA8FF"/><polygon points="12,1 20,9 12,11 4,9" fill="#9fd0ff"/><circle cx="19" cy="4" r="1.4" fill="#FFD66B"/>',
};

function standIn(name, opts = {}) {
  if (GRAD[name]) return `<span class="ui-art-bg" style="display:block;width:100%;height:100%;background:${GRAD[name]};"></span>`;
  if (ICON_SVG[name]) return `<svg viewBox="0 0 24 24" width="100%" height="100%" role="img" aria-label="${esc(opts.alt || name)}">${ICON_SVG[name]}</svg>`;
  if (name.startsWith('muscle-')) {
    return `<svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-label="${esc(opts.alt || name)}"><rect width="48" height="48" fill="#0a1226"/><circle cx="24" cy="12" r="5" fill="none" stroke="#5BA8FF" stroke-width="1.6"/><path d="M24 17v13M14 22h20M24 30l-6 12M24 30l6 12" stroke="#5BA8FF" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>`;
  }
  return `<span class="ui-art-bg" style="display:block;width:100%;height:100%;background:#0a1226;"></span>`;
}

function wrapperAttrs(name, opts) {
  const cls = ['ui-art', opts.className].filter(Boolean).join(' ');
  return `class="${esc(cls)}" data-ui-art="${esc(name)}" data-ui-alt="${esc(opts.alt || '')}"${opts.style ? ` style="${esc(opts.style)}"` : ''}`;
}

export function uiArtHtml(name, opts = {}) {
  return `<span ${wrapperAttrs(name, opts)}>${standIn(name, opts)}</span>`;
}

function upgrade(el) {
  const name = el.dataset.uiArt;
  if (!name || el.dataset.uiArtDone) return;
  el.dataset.uiArtDone = '1';
  uiArtExists(name).then(ok => {
    if (!ok) return;
    const img = new Image();
    img.src = `${UI_ART_DIR}${name}.webp`;
    img.alt = el.dataset.uiAlt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
    el.replaceChildren(img);
  });
}

export function uiArtHydrate(root = document) {
  root.querySelectorAll('[data-ui-art]').forEach(upgrade);
}

export function uiArt(name, opts = {}) {
  const el = document.createElement('span');
  el.className = ['ui-art', opts.className].filter(Boolean).join(' ');
  el.dataset.uiArt = name;
  el.dataset.uiAlt = opts.alt || '';
  if (opts.style) el.style.cssText = opts.style;
  el.innerHTML = standIn(name, opts);
  upgrade(el);
  return el;
}

/* ── sigil: broken ring, blade rays, four arrow heads ──────────────────── */
export function uiSigil({ size = 390, still = false } = {}) {
  const cx = size / 2, cy = size / 2;
  let rays = '';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    rays += `<path d="M${cx} ${cy} L${(cx + Math.cos(a) * size * 0.9).toFixed(1)} ${(cy + Math.sin(a) * size * 0.9).toFixed(1)}" stroke="#FFD66B" stroke-opacity=".14" stroke-width="1.5"/>`;
  }
  const r1 = size * 0.205, r2 = size * 0.267, a = size * 0.056;
  return `<svg class="ui-sigil${still ? ' still' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    ${rays}
    <g class="ui-sigil-spin" fill="none" stroke="#FFD66B" stroke-opacity=".5">
      <circle cx="${cx}" cy="${cy}" r="${r1.toFixed(1)}" stroke-dasharray="60 14 6 14"/>
      <circle cx="${cx}" cy="${cy}" r="${r2.toFixed(1)}" stroke-opacity=".25" stroke-dasharray="3 9"/>
    </g>
    <path d="M${cx} ${cy - r1 - a}l9 22h-18zM${cx} ${cy + r1 + a}l9-22h-18zM${cx - r1 - a} ${cy}l22 9v-18zM${cx + r1 + a} ${cy}l-22 9v-18z" fill="#FFD66B" fill-opacity=".5"/>
  </svg>`;
}

/* ── progress ring ─────────────────────────────────────────────────────── */
export function uiRing({ size = 84, r = 38, stroke = 4, frac = 0, id = 'uiRg' } = {}) {
  const c = size / 2, circ = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, Number(frac) || 0));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD66B"/><stop offset="1" stop-color="#FF8A3D"/></linearGradient></defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,214,107,.2)" stroke-width="${stroke}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(circ * f).toFixed(1)} ${(circ * 2).toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>
  </svg>`;
}

/* ── equipment icons (14px, stroke = currentColor) ─────────────────────── */
const P = (d, extra = '') => `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>${extra}</svg>`;
const ICONS = {
  barbell:    P('M1 7h12M3 3v8M11 3v8M5 5v4M9 5v4'),
  dumbbell:   P('M4 7h6M2.5 4.5v5M11.5 4.5v5M4.5 5.5v3M9.5 5.5v3'),
  cable:      P('M3 1.5v11M3 3c4 0 6 2 6 5.5', '<rect x="7.5" y="8.5" width="3" height="3.5" rx=".6" fill="currentColor"/>'),
  machine:    P('M3 2v10M3 2h8M3 12h8M11 2v4', '<rect x="8.5" y="6" width="5" height="3" rx=".6" fill="currentColor"/>'),
  bodyweight: P('M7 4.5v4M3 6.5h8M7 8.5l-2.5 4M7 8.5l2.5 4', '<circle cx="7" cy="2.6" r="1.6" fill="currentColor"/>'),
  band:       P('M2 4c3-3 7-3 10 0M2 10c3 3 7 3 10 0M2 4v6M12 4v6'),
  kettlebell: P('M5 5.5c0-2.5 4-2.5 4 0', '<circle cx="7" cy="9" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  cardio:     P('M1 7h2.5l1.5-4 2.5 8 1.5-4H13'),
  other:      P('M3 7h8M7 3v8'),
};
export function uiIcon(kind) { return ICONS[kind] || ICONS.other; }

/** Equipment kind for an exercise: the database field first, then name hints for kinds it has no value for. */
export function equipmentKind(name, def = {}) {
  const n = String(name || '');
  if (/kettlebell/i.test(n)) return 'kettlebell';
  if (/\bband\b|resistance band/i.test(n)) return 'band';
  const eq = String(def.equipment || '').toLowerCase();
  if (eq === 'barbell' || eq === 'dumbbell' || eq === 'cable' || eq === 'machine') return eq;
  if (def.intent === 'endurance' || /run|cycl|bike|row(ing)? machine|swim|jog|treadmill|elliptical|skip|jump rope|sprint|stair/i.test(n)) return 'cardio';
  if (eq === 'bodyweight') return 'bodyweight';
  return 'other';
}

/** Muscle-group tint: pushing = blue, pulling = violet, legs = green, core = teal, otherwise blue. */
const GROUPS = [
  ['var(--violet)',      /Back|Lats|Traps|Biceps|Forearms|Rear Shoulders/],
  ['var(--growing)',     /Quads|Hamstrings|Glutes|Calves|Hip Flexors/],
  ['var(--maintaining)', /Abs|Obliques/],
  ['var(--brass)',       /Chest|Shoulders|Triceps/],
];
export function muscleTint(muscles) {
  let best = null, bestW = -1;
  for (const [m, w] of Object.entries(muscles || {})) {
    if ((Number(w) || 0) > bestW) { best = m; bestW = Number(w) || 0; }
  }
  if (!best) return 'var(--brass)';
  for (const [colour, re] of GROUPS) if (re.test(best)) return colour;
  return 'var(--brass)';
}
