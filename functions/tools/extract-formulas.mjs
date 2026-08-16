#!/usr/bin/env node
/**
 * Extracts the AP-relevant progression formulas VERBATIM out of index.html and
 * writes functions/src/formulas.generated.js.
 *
 * The formulas are deliberately NOT rewritten for the server. Shadow mode exists
 * to prove the server agrees with the client, and hand-copying the formulas
 * would quietly destroy that proof the first time one side was edited. So the
 * server's copy is generated from the client's source, byte for byte, and this
 * script doubles as the drift detector:
 *
 *   node tools/extract-formulas.mjs           regenerate
 *   node tools/extract-formulas.mjs --check   fail if the generated file is stale
 *
 * The extracted bodies reference globals that only exist in the browser
 * (EXERCISES_ALL and the sibling helpers), so they are emitted inside a factory
 * that takes those as injected dependencies. The function bodies themselves are
 * untouched.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, '../../index.html');
const OUT = resolve(HERE, '../src/formulas.generated.js');

/** Declarations to lift, in emit order. Order matters: hoisting is not relied on. */
const WANTED = [
  { kind: 'const', name: 'TIER_XP' },
  { kind: 'const', name: 'FLAT_PR_XP' },
  { kind: 'const', name: 'STAT_BONUS_XP' },
  { kind: 'const', name: 'HUNTER_RANK_TIERS' },
  { kind: 'fn', name: 'isRunExercise' },
  { kind: 'fn', name: 'resistanceIntensityMult' },
  { kind: 'fn', name: 'timedIntensityMult' },
  { kind: 'fn', name: 'intensityMult' },
  { kind: 'fn', name: 'repsMult' },
  { kind: 'fn', name: 'getSetIntensity' },
  { kind: 'fn', name: 'computeWorkoutXP' },
  { kind: 'fn', name: 'xpForLevel' },
  { kind: 'fn', name: 'levelFromTotalXP' },
  { kind: 'fn', name: 'apForLevel' },
  { kind: 'fn', name: 'epley1RM' },
];

/** Globals the lifted bodies close over that the caller must supply. */
const INJECTED = ['EXERCISES_ALL'];

// index.html is CRLF; normalise so the emitted mirror is LF and the terminator
// checks below compare against a bare brace rather than one trailing a \r.
const src = readFileSync(CLIENT, 'utf8').replace(/\r\n/g, '\n');
const lines = src.split('\n');

function findFunction(name) {
  const start = lines.findIndex((l) => l.startsWith(`function ${name}(`));
  if (start === -1) throw new Error(`function ${name} not found at column 0 of index.html`);
  // Bodies of interest are all top-level, so the terminator is a column-0 brace.
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '}') return lines.slice(start, i + 1).join('\n');
  }
  throw new Error(`unterminated function ${name}`);
}

function findConst(name) {
  const start = lines.findIndex((l) => l.startsWith(`const ${name} `) || l.startsWith(`const ${name}=`));
  if (start === -1) throw new Error(`const ${name} not found at column 0 of index.html`);
  // Balance brackets so multi-line literals (HUNTER_RANK_TIERS) come across whole.
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
    }
    // Strip a trailing line comment before testing for the terminator: several
    // of these constants are one-liners documented in place, e.g.
    //   const FLAT_PR_XP = 10; // for exercises without world standards
    // None of the targeted declarations contain "//" inside a string literal.
    const code = lines[i].replace(/\/\/.*$/, '').trimEnd();
    if (code.endsWith(';') && depth === 0) {
      return lines.slice(start, i + 1).join('\n');
    }
  }
  throw new Error(`unterminated const ${name}`);
}

const blocks = WANTED.map((w) => ({
  ...w,
  source: w.kind === 'fn' ? findFunction(w.name) : findConst(w.name),
}));

const exported = blocks.map((b) => b.name);

const banner = `/* ─────────────────────────────────────────────────────────────────────────
   GENERATED FILE — DO NOT EDIT BY HAND.

   Produced by functions/tools/extract-formulas.mjs from index.html.
   Every body below is a byte-for-byte copy of the client's own implementation.
   The server does not reimplement progression maths; it runs the same code the
   client runs, which is what makes shadow-mode agreement meaningful.

   Regenerate:  node tools/extract-formulas.mjs
   Check drift: node tools/extract-formulas.mjs --check

   Extracted:   ${exported.join(', ')}
   Injected:    ${INJECTED.join(', ')}
   ───────────────────────────────────────────────────────────────────────── */

/**
 * @param {{ EXERCISES_ALL: Record<string, any> }} deps
 *        EXERCISES_ALL must be BASE_EXERCISES merged with the user's
 *        customExercises, exactly as rebuildExercisesAll() assembles it.
 */
export function createFormulas(deps) {
  const { ${INJECTED.join(', ')} } = deps;

`;

const body = blocks
  .map((b) => b.source.split('\n').map((l) => (l ? '  ' + l : l)).join('\n'))
  .join('\n\n');

const footer = `

  return { ${exported.join(', ')} };
}
`;

const out = banner + body + footer;

/* exercises.js is already a standalone ES module and is the sole definition of
   BASE_EXERCISES. The server needs it at runtime but deploys from functions/,
   so it is mirrored here rather than duplicated by hand — same drift guarantee
   as the formulas. */
const EX_SRC = resolve(HERE, '../../exercises.js');
const EX_OUT = resolve(HERE, '../src/base-exercises.js');
const exBanner = `/* GENERATED — verbatim mirror of /exercises.js, produced by
   functions/tools/extract-formulas.mjs. Do not edit by hand. */
`;
const exOut = exBanner + readFileSync(EX_SRC, 'utf8').replace(/\r\n/g, '\n');

if (process.argv.includes('--check')) {
  let failed = false;
  for (const [label, path, expected] of [
    ['formulas.generated.js', OUT, out],
    ['base-exercises.js', EX_OUT, exOut],
  ]) {
    if (!existsSync(path)) {
      console.error(`FAIL ${label} is missing — run the extractor`);
      failed = true; continue;
    }
    // Compare line-ending agnostically: git may check these out as CRLF on
    // Windows, and a spurious drift failure would train people to ignore the
    // one guard that keeps shadow comparisons meaningful.
    const norm = (t) => t.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
    if (norm(readFileSync(path, 'utf8')) !== norm(expected)) {
      console.error(`FAIL ${label} is STALE.`);
      console.error('     The client source changed without regenerating the server mirror.');
      console.error('     Shadow comparisons would be meaningless. Run:');
      console.error('       node tools/extract-formulas.mjs');
      failed = true; continue;
    }
    console.log(`OK   ${label} matches its client source`);
  }
  process.exit(failed ? 1 : 0);
}

writeFileSync(OUT, out, 'utf8');
writeFileSync(EX_OUT, exOut, 'utf8');
console.log(`wrote ${OUT}`);
console.log(`wrote ${EX_OUT}`);
for (const b of blocks) {
  console.log(`  ${b.kind === 'fn' ? 'function' : 'const   '} ${b.name.padEnd(26)} ${b.source.split('\n').length} lines`);
}
