#!/usr/bin/env node
// build-templates.mjs — generate api/src/lib/templates.js from legal/
//
// WHY THIS EXISTS
// The deployed function bundle should not be reading and parsing markdown off
// disk on every cold start, but `legal/` must stay the single source of truth:
// those documents are reviewed as legal text, and a hand-copied duplicate
// inside api/src would silently drift the moment someone fixes a citation.
// So we generate.
//
//   legal/templates/*.md  +  legal/DISCLAIMER.md   ──▶   api/src/lib/templates.js
//
// api/src/lib/templates.js is a BUILD ARTIFACT. Never edit it directly — edit
// the markdown in legal/ and re-run:
//
//     node api/scripts/build-templates.mjs
//
// Run it before every deploy. CI enforces freshness (see
// .github/workflows/invariants.yml): if the committed artifact doesn't match
// what legal/ generates, the build fails.
//
// WHAT IT DOES
//  1. Strips each file's leading <!-- ... --> authoring header (guidance for human
//     drafters — merge-field lists, jurisdiction notes — never for the recipient).
//  2. Replaces the <!-- STAMP:DISCLAIMER ... --> marker with legal/DISCLAIMER.md,
//     so every generated letter carries the R6 block. A template without the
//     marker is a hard error: an unstamped letter must never reach a user.
//  3. Leaves <!-- IF:X --> / <!-- ENDIF:X --> markers intact. Jurisdiction is only
//     known at request time, so demand.js resolves them per letter.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const LEGAL = join(REPO, 'legal');
const OUT = join(REPO, 'api', 'src', 'lib', 'templates.js');

// Key ──▶ file. Keys are the `type` values accepted by POST /api/demand.
const SOURCES = {
  rtk: 'ccpa-right-to-know.md',
  disclosure: 'ccpa-disclosure-trail.md',
  delete: 'ccpa-deletion.md',
  provenance: 'consent-provenance-demand.md',
  gdpr: 'gdpr-article-15.md',
};

const STAMP = /^<!--\s*STAMP:DISCLAIMER[\s\S]*?-->\s*$/m;

/** Remove a leading HTML comment block used as an authoring header. */
function stripHeader(md) {
  const t = md.replace(/^﻿/, '').trimStart();
  if (!t.startsWith('<!--')) return t;
  const end = t.indexOf('-->');
  if (end === -1) return t;
  // Keep IF:/ENDIF: markers even if one happens to lead the file.
  if (/^<!--\s*(IF|ENDIF):/.test(t)) return t;
  return t.slice(end + 3).trimStart();
}

/** Escape for embedding in a JS template literal. */
function lit(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const disclaimer = stripHeader(readFileSync(join(LEGAL, 'DISCLAIMER.md'), 'utf8')).trim();
if (!disclaimer) throw new Error('legal/DISCLAIMER.md is empty — refusing to generate unstamped letters.');

const built = {};
const problems = [];

for (const [key, file] of Object.entries(SOURCES)) {
  let md;
  try {
    md = readFileSync(join(LEGAL, 'templates', file), 'utf8');
  } catch {
    problems.push(`missing template: legal/templates/${file}`);
    continue;
  }
  const body = stripHeader(md);
  if (!STAMP.test(body)) {
    // R6 is not negotiable: no disclaimer marker, no letter.
    problems.push(`legal/templates/${file} has no <!-- STAMP:DISCLAIMER --> marker`);
    continue;
  }
  built[key] = body.replace(STAMP, disclaimer).trimEnd() + '\n';
}

if (problems.length) {
  console.error('build-templates: FAILED\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

// Collect the union of merge tokens so demand.js can assert it supplies them all.
const tokens = new Set();
for (const body of Object.values(built)) {
  for (const m of body.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)) tokens.add(m[1]);
}

const out = `// GENERATED FILE — DO NOT EDIT.
//
// Source of truth: legal/templates/*.md and legal/DISCLAIMER.md.
// Regenerate:  node api/scripts/build-templates.mjs
//
// Editing this file directly will be overwritten on the next build and will
// desync the deployed letters from the reviewed legal text.
//
// Conditional markers <!-- IF:X --> / <!-- ENDIF:X --> survive into these strings
// and are resolved per-request by api/src/routes/demand.js, because the
// sender's jurisdiction is only known at request time.

/** Merge tokens appearing across all templates. demand.js must supply every one. */
export const TEMPLATE_TOKENS = ${JSON.stringify([...tokens].sort(), null, 2)};

/** Jurisdiction flags usable in IF:/ENDIF: blocks. */
export const JURISDICTION_FLAGS = ['GDPR', 'CALIFORNIA', 'OREGON', 'MINNESOTA', 'COLORADO', 'OTHER_STATE'];

export const DISCLAIMER = \`${lit(disclaimer)}\`;

export const TEMPLATES = {
${Object.entries(built).map(([k, v]) => `  ${k}: \`${lit(v)}\`,`).join('\n\n')}
};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');

console.log(`build-templates: wrote api/src/lib/templates.js`);
console.log(`  templates: ${Object.keys(built).join(', ')}`);
console.log(`  tokens:    ${[...tokens].sort().join(' ')}`);
