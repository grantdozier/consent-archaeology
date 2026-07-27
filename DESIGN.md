# CONSENT ARCHAEOLOGY — build contract

> Internal spec. Every contributor and every agent building in this repo obeys this file.
> If a request conflicts with the **Hard Rules**, the Hard Rules win.

---

## 0. What this is

A joke-shaped, deadly-serious privacy tool.

**The bit:** an absurdly over-classified Cold War terminal — retina scans, compartment
codes, encryption theater — protecting the single least-protected asset in modern life:
*your own name.* The comedy is the mismatch. Data brokers treat your identity as a $0.003
line item; we treat it like launch codes.

**The thesis (real, and legally load-bearing):** under GDPR Art. 7(1) a controller
*"shall be able to demonstrate that the data subject has consented."* Most companies
holding your data acquired it through a chain of acquisitions, ToS rewrites, and broker
purchases spanning 15+ years. **They cannot produce the record.** They have the data but
lost the receipt. This tool makes ordinary people ask for the receipt, at scale, in
writing, with a paper trail.

**Tagline:** *You allegedly agreed. Prove it.*

---

## 1. HARD RULES — non-negotiable

These exist because this repo is public, collects PII, and accepts money. Violating any
one of them turns a privacy tool into the exact thing it's fighting.

### R1 — No Social Security Numbers. Ever.
No SSN field. No "last 4." No schema column. No optional advanced mode.
A public repo that collects SSNs behind a dramatic UI **is a phishing kit**, regardless
of intent, and would be indistinguishable from one to a security researcher.

You do not need an SSN to find or delete broker records — brokers key on
name + address history + email + phone. The UI makes this a *joke*, not an omission:

```
  SSN ........................ [FIELD REMOVED ON ADVICE OF COUNSEL]
                               ↳ if you're worried about SSN exposure, the actual
                                 fix is a credit freeze. It's free, it's law, it
                                 takes 10 minutes, and it works better than we do.
                                 → annualcreditreport.com  → freeze all three bureaus
```

### R2 — Never claim we delete anything.
We do not "destroy," "nuke," "wipe," or "erase" data from the internet. **Nobody can.**
We generate and transmit legally-grounded demands, then track who complies. That is the
product. Since donations are accepted, "we will erase you from the internet" is a paid-
service misrepresentation — squarely an FTC Act §5 deceptive-practices problem.

Banned in all user-facing copy: *destroy, erase, wipe, nuke, scrub, purge, guaranteed
removal, remove you from the internet.*
Correct verbs: *demand, compel, request, file, document, track, escalate.*

The theater may be loud. The **claims** must be exact.

### R3 — Verified-self only. This is the anti-doxing gate.
A sweep may only run against an identity whose **email has been verified in this session
via a Brevo magic link.** No verification → no sweep. No exceptions, no admin bypass,
no "research mode."

Without R3 this is a doxing engine: public repo + "give me a name and I'll find
everything about them" = a stalking tool with a nice UI. With R3 it's Incogni.
The entire ethical difference is one email round-trip.

### R4 — Allowlist crawling only.
Firecrawl targets **only** `worker/src/brokers.js` — a curated, reviewed list of
data-broker search/opt-out endpoints. No open-web crawl. No "search the whole internet
for this person." Respect `robots.txt`. Rate-limit per subject. A PR adding a broker
must include the company's legal name, HQ address, and CA registry ID.

**Firecrawl does not trace IP addresses.** It is an HTML→markdown scraper. Any copy
implying network-level tracing is a lie; see R2. What we *actually* do is read
public broker listing pages and record what they publish about you.

### R5 — PII is radioactive. Treat accordingly.
- Encrypted at rest in D1 (AES-GCM, key from `wrangler secret`).
- Auto-purge raw PII 90 days after last activity; keep only salted hashes for dedup.
- `/api/stats` returns aggregate counts only — never a name, never a city.
- No PII in logs, ever. No PII in error messages.
- Export-and-delete-me endpoint from day one, not "v2."

### R6 — We are not lawyers and we represent nobody.
No legal advice. No attorney-client relationship. No "you will recover $X."
Templates are self-help documents the user sends **as themselves, in their own name.**
The user owns their evidence file and can walk it to any firm they choose.
Every generated document carries the disclaimer block from `legal/DISCLAIMER.md`.

### R7 — Demands are signed by a real, identifiable human.
No anonymous sending. An anonymous DSAR is (a) legally void — the controller must
verify the requester — and (b) indistinguishable from harassment. The user's own name
and contact go on the letter. That's what makes it work.

---

## 2. Architecture

House pattern (per `~/.claude/CLAUDE.md`): GitHub Pages static frontend + Cloudflare
Worker + D1 + KV. Vanilla JS, zero runtime dependencies, ~$0 infra. Brevo for email,
Stripe for Apple Pay, Venmo deep-link. **No Supabase.**

```
  Threads post
       │
       ▼
  dig.doziertechgroup.com            ← GitHub Pages (docs/, CNAME)
  ┌──────────────────────────────┐
  │  THEATER      │   TRUTH      │   ← the two-panel gag; see §3
  │  (left)       │   (right)    │
  └──────────────────────────────┘
       │  fetch()
       ▼
  dig-api.<sub>.workers.dev        ← Cloudflare Worker
       ├── D1  consent_archaeology  ← subjects, findings, demands, evidence
       ├── KV  SESSIONS             ← magic-link tokens, rate limits
       ├── Brevo API                ← verification email (R3 gate)
       ├── Firecrawl API            ← allowlist broker sweep (R4)
       └── Stripe                   ← donation, return_url on doziertechgroup.com
```

### User flow

1. **Land** — classified splash. One button: `REQUEST CLEARANCE`.
2. **Intake** — name, email, phone (opt), city/state, prior addresses (opt), birth *year*
   (opt, for broker disambiguation). **No SSN (R1).**
3. **Verify** — Brevo magic link. Hard gate (R3). Theater: "TRANSMITTING TO SECURE
   COMPARTMENT." Truth panel: "We sent you an email. Click it. This proves the identity
   is yours, which is the only thing stopping this from being a stalking tool."
4. **Sweep** — Firecrawl across the broker allowlist. Live progress theater.
5. **Dossier** — every broker holding you: legal entity name, HQ address, CA registry ID,
   opt-out URL, what they publish.
6. **Demands** — generate + send: CCPA Right to Know, CCPA Delete, GDPR Art. 15, and the
   headline one — **Consent Provenance Demand** (produce the receipt).
7. **Evidence locker** — log the four claim elements (§4). Hash-chained, timestamped,
   user-exportable.
8. **Donate** — *after* results, never before. Apple Pay (Stripe) / Venmo. Dismissal is
   permanent (§5).

---

## 3. The two-panel gag (this is the whole design)

Every screen is split. Left = maximum theater. Right = deadpan plain English.
The joke *is* the honesty — and it doubles as the R2 compliance mechanism.

```
┌────────────────────────────────┬───────────────────────────────────┐
│ ▓▓ COMPARTMENT: HUMAN-BASELINE │  WHAT'S ACTUALLY HAPPENING        │
│ ▓▓ CLEARANCE .......  CIVILIAN │                                   │
│ ▓▓ CIPHER ......... AES-256-GCM│  Your browser opened an HTTPS      │
│                                │  connection. That's it. That's the │
│  ESTABLISHING SECURE CHANNEL   │  same encryption as ordering       │
│  ██████████░░░░░░░░  58%       │  a burrito online.                 │
│  > handshake ......... OK      │                                   │
│  > key exchange ...... OK      │  We are dramatizing a normal TLS   │
│  > paranoia .......... OK      │  handshake because it looks cool.  │
│                                │  We are not doing anything the     │
│                                │  padlock icon wasn't already doing.│
└────────────────────────────────┴───────────────────────────────────┘
```

Truth panel rules: no jargon, no marketing, admits limits, funnier than the theater
because it's flat. If the theater ever describes something the truth panel can't
confirm in one plain sentence — **the theater is wrong, fix the theater.**

Progress bars must track **real** async work (actual fetch state), never `setTimeout`
fiction. Fake progress is faked success, which is banned outright.

---

## 4. The legal engine

### 4a. Consent Provenance Demand — the novel instrument
Demands the controller produce, in writing:
1. **Date and time** consent was obtained.
2. **Exact text/form** presented at that moment (screenshot or archived markup).
3. **Method of verification** — how they confirmed it was you.
4. **Record of receipt on both sides** — their log *and* what was sent to you.
5. **Chain of custody** if acquired via merger, acquisition, or broker purchase.

Legal basis (verify currency before publishing — see agent brief):
- **GDPR Art. 7(1)** — controller *shall be able to demonstrate* consent. The spine.
- **GDPR Art. 15(1)(g)** — right to know the *source* when not collected from you.
- **Cal. Civ. Code §1798.110** — right to know specific pieces collected.
- **Cal. Civ. Code §1798.115** — right to know to whom it was sold/shared.
- **Cal. Civ. Code §1798.105** — right to delete.
- **CA Delete Act (SB 362)** — broker registration + the DROP deletion platform.

### 4b. Mass arbitration, not class action
Class actions die in the arbitration clause. **Mass arbitration weaponizes that same
clause**: thousands of individual demands, each with a per-claimant filing fee the
*company* owes. It is the one mechanism these ToS cannot route around, because they
wrote it. Every user files as themselves; we only help produce a clean, consistent,
well-evidenced record. See R6 — we refer, we do not represent.

### 4c. The four claim elements (evidence locker schema)
1. Privacy violated — data held/sold without demonstrable consent.
2. Sense of intrusion — documented personal impact.
3. Support dissatisfaction — the complaint and its outcome.
4. **Support-record decay** — documentation vanished, ticket history purged, or the
   user was routed into an AI agent loop that never met the stated support terms.

Element 4 is the one nobody is systematically collecting, and it's the one that
turns "I'm annoyed" into a documented pattern across thousands of claimants.
See `case-files/` for the worked example.

---

## 5. Donation flow

- Appears **only after** the dossier renders. Never gates a feature. Everything is free.
- **Apple Pay** — Stripe Payment Link, Apple Pay enabled. Requires domain verification on
  `doziertechgroup.com`.
- **Venmo** — deep link `venmo://paycharge?txn=pay&recipients=<HANDLE>&note=...`, with an
  `https://venmo.com/<HANDLE>` desktop fallback. **TODO(deploy): Grant's Venmo handle.**
- **Return/callback URL is always on `doziertechgroup.com`** — required. Use
  `https://doziertechgroup.com/dig/thanks`.
- **Dismissal is permanent.** "No thanks" → `localStorage` flag + server-side flag on the
  verified subject. Never ask that person again, on any device, forever. No dark patterns,
  no re-prompt after N days, no "are you sure?" interstitial.

---

## 6. Repo layout

```
consent-archaeology/
├─ README.md              ← Threads-facing pitch. Funny. Honest. Grant writes the voice.
├─ DESIGN.md              ← this file
├─ LICENSE                ← MIT
├─ docs/                  ← GitHub Pages root
│  ├─ index.html          ← splash + intake
│  ├─ verify.html         ← magic-link landing
│  ├─ sweep.html          ← live sweep theater
│  ├─ dossier.html        ← results + demands + evidence locker
│  ├─ CNAME              ← dig.doziertechgroup.com
│  └─ assets/{terminal.css,terminal.js,api.js,theater.js}
├─ worker/
│  ├─ wrangler.toml       ← house style: TODO(deploy) markers, secrets documented
│  ├─ schema.sql          ← D1
│  └─ src/{index.js,brokers.js,crypto.js,routes/*.js}
├─ legal/
│  ├─ DISCLAIMER.md       ← stamped onto every generated doc
│  ├─ LEGAL-BASIS.md      ← statute-by-statute, with currency dates
│  ├─ MASS-ARBITRATION.md
│  └─ templates/*.md
├─ case-files/            ← worked examples of documented support failure
└─ .github/workflows/     ← Pages deploy
```

## 7. Style

Vanilla JS. No framework, no build step, no npm runtime deps. Terminal aesthetic:
phosphor green `#33ff66` on `#0a0e0a`, amber `#ffb000` for warnings, monospace
(`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`). Respect
`prefers-reduced-motion` — kill scanlines, flicker, and typewriter effects when set.
Fully responsive: on mobile the two panels stack, theater first, truth immediately below.
Keyboard accessible, real `<label>`s, visible focus rings. The bit never breaks a11y.
