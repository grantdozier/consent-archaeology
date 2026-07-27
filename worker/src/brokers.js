// brokers.js — THE R4 ALLOWLIST. Firecrawl may target these origins and
// NOTHING else. No open-web crawl, no "search the whole internet for this
// person". assertAllowlistedUrl() below is the hard gate; every URL handed to
// Firecrawl passes through it first.
//
// A PR adding a broker MUST include the company's legal entity name, HQ
// mailing address, and CA data broker registry ID (DESIGN R4) — these go into
// legal demand letters, so accuracy is mandatory. Any field below marked
// `null // TODO(verify …)` was not confidently known at authoring time and
// must be verified before it appears in a letter. DO NOT guess. Sources:
//   * CA registry: https://cppa.ca.gov/data_broker_registry/
//   * Legal names / HQ: the broker's own privacy policy + state SoS filings.
//
// What Firecrawl is (and is not): an HTML→markdown scraper. It reads public
// broker listing pages. It does NOT trace IP addresses, and nothing in this
// codebase should imply network-level tracing of anyone (R2/R4).
//
// Entry shape:
//   id          stable key stored in D1 findings.broker_id
//   name        consumer-facing brand
//   legalName   registered entity for the letter head (null = TODO(verify))
//   hqAddress   full mailing address (null = TODO(verify) — letters render a
//               visible "[ADDRESS UNVERIFIED]" placeholder instead)
//   caRegistryId  CA Delete Act registry ID (null = TODO(verify))
//   optOutUrl   the broker's own suppression/opt-out flow
//   origin      the ONLY https origin the sweep may fetch for this broker
//   searchPath  null → not sweepable (no public people-search page, or the
//               URL pattern is unverified); otherwise a function
//               (normalizedSubject) => path string. Patterns are best-effort
//               and marked TODO(verify) — a wrong pattern degrades to "no
//               match", never to fetching a non-allowlisted origin, because
//               buildSearchUrl() re-validates the final URL.

// --- tiny formatting helpers for search paths --------------------------------
const tc = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); // "smith" → "Smith"
const tcSlug = (s) => s.trim().split(/\s+/).map(tc).join('-');          // "new york" → "New-York"
const lcSlug = (s) => s.trim().toLowerCase().split(/\s+/).join('-');    // "New York" → "new-york"

export const BROKERS = [
  // ── People-search sites (public listing pages; sweep candidates) ─────────
  {
    id: 'spokeo',
    name: 'Spokeo',
    legalName: 'Spokeo, Inc.',
    hqAddress: null, // TODO(verify) — HQ is Pasadena, CA; confirm full street address before use in letters
    caRegistryId: null, // TODO(verify) — look up at cppa.ca.gov/data_broker_registry
    optOutUrl: 'https://www.spokeo.com/optout',
    origin: 'https://www.spokeo.com',
    searchPath: (s) => `/${encodeURIComponent(tc(s.first))}-${encodeURIComponent(tc(s.last))}`, // TODO(verify) URL pattern
  },
  {
    id: 'whitepages',
    name: 'Whitepages',
    legalName: 'Whitepages, Inc.',
    hqAddress: null, // TODO(verify) — HQ is Seattle, WA; confirm full street address
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.whitepages.com/suppression-requests',
    origin: 'https://www.whitepages.com',
    searchPath: (s) =>
      `/name/${encodeURIComponent(tc(s.first))}-${encodeURIComponent(tc(s.last))}/` +
      `${encodeURIComponent(tcSlug(s.city))}-${encodeURIComponent(s.state.toUpperCase())}`, // TODO(verify) URL pattern
  },
  {
    id: 'truepeoplesearch',
    name: 'TruePeopleSearch',
    legalName: null, // TODO(verify) — operating entity is not clearly published on the site; check CA registry + domain records
    hqAddress: null, // TODO(verify)
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.truepeoplesearch.com/removal',
    origin: 'https://www.truepeoplesearch.com',
    searchPath: (s) =>
      `/results?name=${encodeURIComponent(s.fullName)}&citystatezip=${encodeURIComponent(`${s.city} ${s.state.toUpperCase()}`)}`, // TODO(verify) URL pattern
  },
  {
    id: 'fastpeoplesearch',
    name: 'FastPeopleSearch',
    legalName: null, // TODO(verify) — operating entity not clearly published
    hqAddress: null, // TODO(verify)
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.fastpeoplesearch.com/removal',
    origin: 'https://www.fastpeoplesearch.com',
    searchPath: (s) => `/name/${lcSlug(s.first)}-${lcSlug(s.last)}_${lcSlug(s.city)}-${s.state.toLowerCase()}`, // TODO(verify) URL pattern
  },
  {
    id: 'radaris',
    name: 'Radaris',
    legalName: null, // TODO(verify) — believed Radaris America, Inc. (MA); confirm entity + spelling
    hqAddress: null, // TODO(verify)
    caRegistryId: null, // TODO(verify)
    optOutUrl: null, // TODO(verify) — Radaris has an on-site information-control flow; confirm current URL
    origin: 'https://radaris.com',
    searchPath: (s) => `/p/${encodeURIComponent(tc(s.first))}/${encodeURIComponent(tc(s.last))}/`, // TODO(verify) URL pattern
  },

  // ── People-search brands behind signup walls (dossier + demand targets;
  //    not sweepable — results pages require an account) ────────────────────
  {
    id: 'beenverified',
    name: 'BeenVerified',
    legalName: 'BeenVerified, LLC', // TODO(verify) — brand of The Lifetime Value Co.; confirm current entity of record
    hqAddress: null, // TODO(verify) — HQ is New York, NY; confirm full street address
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.beenverified.com/app/optout/search',
    origin: 'https://www.beenverified.com',
    searchPath: null, // results are behind signup; nothing public to scrape
  },
  {
    id: 'intelius',
    name: 'Intelius',
    legalName: 'PeopleConnect, Inc.', // Intelius is a PeopleConnect brand
    hqAddress: null, // TODO(verify) — PeopleConnect HQ is in the Seattle, WA area; confirm full street address
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://suppression.peopleconnect.us/', // shared PeopleConnect suppression center
    origin: 'https://www.intelius.com',
    searchPath: null, // results behind signup
  },
  {
    id: 'truthfinder',
    name: 'TruthFinder',
    legalName: 'PeopleConnect, Inc.', // TruthFinder is a PeopleConnect brand
    hqAddress: null, // TODO(verify) — same entity as intelius above
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://suppression.peopleconnect.us/',
    origin: 'https://www.truthfinder.com',
    searchPath: null, // results behind signup
  },
  {
    id: 'instantcheckmate',
    name: 'Instant Checkmate',
    legalName: 'PeopleConnect, Inc.', // Instant Checkmate is a PeopleConnect brand
    hqAddress: null, // TODO(verify) — same entity as intelius above
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://suppression.peopleconnect.us/',
    origin: 'https://www.instantcheckmate.com',
    searchPath: null, // results behind signup
  },
  {
    id: 'mylife',
    name: 'MyLife',
    legalName: 'MyLife.com, Inc.',
    hqAddress: null, // TODO(verify) — HQ is Los Angeles, CA; confirm full street address
    caRegistryId: null, // TODO(verify)
    optOutUrl: null, // TODO(verify) — MyLife handles removals via a CCPA/privacy request flow; confirm current URL
    origin: 'https://www.mylife.com',
    searchPath: null, // TODO(verify) — public profile URL pattern unconfirmed
  },
  {
    id: 'peoplefinders',
    name: 'PeopleFinders',
    legalName: null, // TODO(verify) — believed operated by Confi-Chek, Inc. (Sacramento, CA); confirm
    hqAddress: null, // TODO(verify)
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.peoplefinders.com/opt-out',
    origin: 'https://www.peoplefinders.com',
    searchPath: null, // results behind signup
  },
  {
    id: 'usphonebook',
    name: 'USPhoneBook',
    legalName: null, // TODO(verify) — operating entity not clearly published
    hqAddress: null, // TODO(verify)
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.usphonebook.com/opt-out', // TODO(verify) — confirm current path
    origin: 'https://www.usphonebook.com',
    searchPath: null, // TODO(verify) — public listing URL pattern unconfirmed
  },

  // ── Enterprise data brokers (no public people-search UI; included because
  //    they are exactly who the Consent Provenance Demand exists for) ───────
  {
    id: 'acxiom',
    name: 'Acxiom',
    legalName: 'Acxiom LLC', // owned by Interpublic Group since 2018
    hqAddress: null, // TODO(verify) — HQ is Conway, AR (believed 301 E. Dave Ward Dr, Conway, AR 72032); verify before use in letters
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://www.acxiom.com/optout/',
    origin: 'https://www.acxiom.com',
    searchPath: null, // enterprise broker — no public search page; demand-letter target only
  },
  {
    id: 'lexisnexis-risk',
    name: 'LexisNexis Risk Solutions',
    legalName: 'LexisNexis Risk Solutions', // TODO(verify) — multiple entities (e.g. "LexisNexis Risk Solutions Inc.", "… FL Inc."); confirm the correct entity of record for consumer data
    hqAddress: '1000 Alderman Drive, Alpharetta, GA 30005',
    caRegistryId: null, // TODO(verify)
    optOutUrl: 'https://optout.lexisnexis.com/',
    origin: 'https://www.lexisnexis.com',
    searchPath: null, // enterprise broker — demand-letter target only
  },
  {
    id: 'epsilon',
    name: 'Epsilon',
    legalName: 'Epsilon Data Management, LLC',
    hqAddress: null, // TODO(verify) — HQ is Irving, TX; confirm full street address
    caRegistryId: null, // TODO(verify)
    optOutUrl: null, // TODO(verify) — Epsilon has a consumer preference/opt-out page; confirm current URL
    origin: 'https://www.epsilon.com',
    searchPath: null, // enterprise broker — demand-letter target only
  },
];

// Brokers the sweep can actually visit (public listing page + known pattern).
export const SWEEPABLE_BROKERS = BROKERS.filter((b) => typeof b.searchPath === 'function');

const BROKERS_BY_ID = new Map(BROKERS.map((b) => [b.id, b]));
export function brokerById(id) {
  return BROKERS_BY_ID.get(id) || null;
}

// ---------------------------------------------------------------------------
// R4 hard validator — every URL that reaches Firecrawl goes through this.
// ---------------------------------------------------------------------------

const ALLOWLISTED_ORIGINS = new Set(BROKERS.map((b) => b.origin));

/**
 * Throws unless `urlString` is https AND its origin is EXACTLY one of the
 * allowlisted broker origins above. Exact-origin match — subdomain tricks
 * (evil.com/#www.spokeo.com, www.spokeo.com.evil.com) fail the check because
 * we compare the parsed URL's origin, not a substring.
 */
export function assertAllowlistedUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error('allowlist_violation: unparseable URL');
  }
  if (u.protocol !== 'https:') {
    throw new Error('allowlist_violation: non-https URL refused');
  }
  if (!ALLOWLISTED_ORIGINS.has(u.origin)) {
    // Deliberately not echoing the URL: it can embed the subject's name (R5).
    throw new Error('allowlist_violation: origin not on the broker allowlist (R4)');
  }
  return u;
}

/**
 * Build the search URL for a sweepable broker from a normalized subject
 * ({first, last, fullName, city, state}) and re-validate it against the
 * allowlist. Defense in depth: even a malicious/buggy searchPath cannot
 * produce a fetchable URL outside the broker's own origin, because we resolve
 * the path against broker.origin and then re-check the resulting origin.
 */
export function buildSearchUrl(broker, subject) {
  if (typeof broker.searchPath !== 'function') {
    throw new Error('allowlist_violation: broker is not sweepable');
  }
  const url = new URL(broker.searchPath(subject), broker.origin);
  assertAllowlistedUrl(url.href);
  if (url.origin !== broker.origin) {
    throw new Error('allowlist_violation: searchPath escaped its broker origin');
  }
  return url.href;
}
