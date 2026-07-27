// routes/demand.js — POST /api/demand
//
// Generates one of the demand letters for a finding in the subject's own
// dossier. We DRAFT; the USER sends, as themself, under their own name (R7 —
// an anonymous DSAR is legally void, because the controller is required to
// verify the requester, and is indistinguishable from harassment).
//
// Every letter carries the R6 disclaimer block: self-help document, not legal
// advice, no representation, no promised outcome.
//
// R2 discipline: letters DEMAND, REQUEST, and DOCUMENT. They never claim that
// anyone will (or can) erase anything from the internet.
//
// TEMPLATES: the letter text lives in legal/templates/*.md — reviewed as legal
// text, and canonical. The Function App ships a generated module rather than
// reading repo files at runtime, so api/src/lib/templates.js is GENERATED from
// legal/ by `node api/scripts/build-templates.mjs`. Never edit that artifact;
// edit the markdown and regenerate. CI fails if the two drift
// (.github/workflows/invariants.yml).

import { HttpError, json, readJson, nowISO } from '../lib/http.js';
import { encryptPII, decryptPII, sha256Hex, uuid } from '../lib/crypto.js';
import { requireSession } from '../lib/auth.js';
import { config } from '../lib/config.js';
import { brokerById } from '../lib/brokers.js';
import { TEMPLATES } from '../lib/templates.js';
import * as repo from '../lib/repo.js';

const VALID_TYPES = ['rtk', 'disclosure', 'delete', 'provenance', 'gdpr'];

// Statutory clocks. Sources and pinpoint cites in legal/LEGAL-BASIS.md.
//   CCPA / US state laws — 45 calendar days to respond (Cal. Civ. Code
//     §1798.130(a)(2)); 10 business days to acknowledge (11 CCR §7021).
//   GDPR — one month (Art. 12(3)).
const DAYS_RESPONSE_US = 45;
const DAYS_RESPONSE_GDPR = 30;
const DAYS_ACK_US = 14; // 10 business days, stated conservatively in calendar days

// State-law identity for the {{STATE_LAW_*}} tokens. Only states whose citation
// and complaint route were verified (legal/LEGAL-BASIS.md, stamped 2026-07-27)
// appear here. Anything else falls through to a generic block rather than a
// guess — one wrong citation discredits the entire letter.
const STATE_LAW = {
  CA: ['California Consumer Privacy Act', 'Cal. Civ. Code §1798.100 et seq.', 'https://oag.ca.gov/contact/consumer-complaint-against-business-or-company', 'CALIFORNIA'],
  OR: ['Oregon Consumer Privacy Act', 'ORS 646A.570 et seq.', 'https://justice.oregon.gov/consumercomplaints/', 'OREGON'],
  MN: ['Minnesota Consumer Data Privacy Act', 'Minn. Stat. ch. 325M', 'https://www.ag.state.mn.us/office/complaint.asp', 'MINNESOTA'],
  CO: ['Colorado Privacy Act', 'C.R.S. §6-1-1301 et seq.', 'https://coag.gov/file-complaint/', 'COLORADO'],
  TX: ['Texas Data Privacy and Security Act', 'Tex. Bus. & Com. Code ch. 541', 'https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint', 'OTHER_STATE'],
  VA: ['Virginia Consumer Data Protection Act', 'Va. Code §59.1-575 et seq.', 'https://www.oag.state.va.us/consumer-protection/index.php/file-a-complaint', 'OTHER_STATE'],
  CT: ['Connecticut Data Privacy Act', 'Conn. Gen. Stat. §42-515 et seq.', 'https://portal.ct.gov/ag/common/complaint-form-landing-page', 'OTHER_STATE'],
};

/** Normalize a free-text state field to a 2-letter key, or '' if unrecognized. */
function stateKey(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (STATE_LAW[s]) return s;
  const NAMES = {
    CALIFORNIA: 'CA', OREGON: 'OR', MINNESOTA: 'MN', COLORADO: 'CO',
    TEXAS: 'TX', VIRGINIA: 'VA', CONNECTICUT: 'CT',
  };
  return NAMES[s] || '';
}

/**
 * Resolve <!-- IF:X --> / <!-- ENDIF:X --> blocks against the active flags.
 * Inactive blocks are removed entirely, markers included. A leftover marker
 * means the template is malformed — we throw rather than emit a half-letter
 * with visible HTML comments in it.
 */
function resolveConditionals(text, activeFlags) {
  const active = new Set(activeFlags);
  const re = /<!--\s*IF:([A-Z_]+)\s*-->([\s\S]*?)<!--\s*ENDIF:\1\s*-->\n?/g;
  const out = text.replace(re, (_m, flag, bodyText) => (active.has(flag) ? bodyText : ''));
  if (/<!--\s*(?:IF|ENDIF):[A-Z_]+\s*-->/.test(out)) {
    throw new HttpError(500, 'template_conditional_unbalanced');
  }
  return out;
}

/** Token interpolation. Every value is constructed server-side. */
function interpolate(template, tokens) {
  return template.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : m,
  );
}

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** Loud, unmistakable placeholder — never a plausible-looking guess. */
function unverified(what, where) {
  return `[${what} — UNVERIFIED, confirm before sending; see ${where}]`;
}

export async function postDemand(request) {
  const { subjectId } = await requireSession(request); // R3 gate
  const body = await readJson(request);

  const type = body.type;
  if (!VALID_TYPES.includes(type)) {
    throw new HttpError(400, `invalid_type: must be one of ${VALID_TYPES.join(', ')}`);
  }
  const findingId = typeof body.findingId === 'string' ? body.findingId : '';
  if (!findingId) throw new HttpError(400, 'invalid_findingId');

  // Ownership check: the finding must belong to THIS subject (R3 — you generate
  // demands about your own dossier only). The repo reads it from the caller's
  // own partition, so someone else's finding is simply absent → 404 rather
  // than 403, so finding ids can't be probed for existence.
  const finding = await repo.getOwnedFinding(findingId, subjectId);
  if (!finding) throw new HttpError(404, 'finding_not_found');

  const broker = brokerById(finding.brokerId);
  if (!broker) throw new HttpError(500, 'broker_no_longer_on_allowlist');

  const piiCiphertext = await repo.getSubjectPii(subjectId); // null once purged
  if (!piiCiphertext) throw new HttpError(404, 'subject_pii_unavailable');
  const pii = JSON.parse(await decryptPII(config, piiCiphertext));

  // ── Jurisdiction ─────────────────────────────────────────────────────────
  // Decides which IF: blocks survive. The templates require at least one active
  // flag; with none, we refuse to generate rather than send a letter that
  // asserts no legal basis at all.
  const sk = stateKey(pii.state);
  const [lawName, lawCite, agUrl, stateFlag] = STATE_LAW[sk] || [];
  const isGdpr = type === 'gdpr' || body.jurisdiction === 'GDPR';

  const flags = [];
  if (isGdpr) flags.push('GDPR');
  if (stateFlag) flags.push(stateFlag);
  if (!flags.length) {
    // Unrecognized state and no GDPR claim. Honest failure, with the reason.
    throw new HttpError(422, 'jurisdiction_undetermined: no verified privacy-law basis on file for that state');
  }

  const gdprOnly = isGdpr && !stateFlag;
  const demandId = uuid();

  const tokens = {
    FULL_NAME: pii.fullName,
    EMAIL: pii.email,
    PHONE: pii.phone || '(not provided)',
    // Intake deliberately collects city/state only, never a street address
    // (R5 — hold no more PII than the sweep needs). A DSAR reply needs a
    // mailing address, so the user supplies it before sending.
    POSTAL_ADDRESS: `[YOUR MAILING ADDRESS — fill in before sending]\n${pii.city}, ${pii.state}`,
    PRIOR_ADDRESSES: Array.isArray(pii.priorAddresses) && pii.priorAddresses.length
      ? pii.priorAddresses.join('; ')
      : '(none provided)',
    STATE_OF_RESIDENCE: pii.state || '(not provided)',

    COMPANY_LEGAL_NAME: broker.legalName || unverified('LEGAL ENTITY NAME', 'api/src/lib/brokers.js'),
    COMPANY_ADDRESS: broker.hqAddress || unverified('MAILING ADDRESS', 'api/src/lib/brokers.js'),

    REQUEST_DATE: new Date().toISOString().slice(0, 10),
    RESPONSE_DEADLINE: addDays(gdprOnly ? DAYS_RESPONSE_GDPR : DAYS_RESPONSE_US),
    ACKNOWLEDGMENT_DEADLINE: addDays(DAYS_ACK_US),
    REFERENCE_ID: `CA-${demandId.slice(0, 8).toUpperCase()}`,

    JURISDICTION: gdprOnly ? 'the European Union / United Kingdom' : (lawName ? pii.state : '(jurisdiction)'),
    STATE_LAW_NAME: lawName || '(state privacy law)',
    STATE_LAW_CITATION: lawCite || '(citation)',
    STATE_AG_COMPLAINT_URL: agUrl || 'https://www.usa.gov/state-consumer',
  };

  const letterMarkdown = interpolate(resolveConditionals(TEMPLATES[type], flags), tokens).trim() + '\n';
  const letterHash = await sha256Hex(letterMarkdown);

  // Stored encrypted (the letter carries the subject's name and contact —
  // R5, R7). The hash outlives the 90-day purge, so a copy the user kept stays
  // provably the document we generated.
  await repo.createDemand({
    id: demandId,
    subjectId,
    findingId,
    type,
    letterCiphertext: await encryptPII(config, letterMarkdown),
    letterHash,
    createdAt: nowISO(),
  });

  return json({ demandId, letterMarkdown });
}
