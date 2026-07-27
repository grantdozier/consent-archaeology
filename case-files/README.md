# Case files

This directory holds **documented instances of a support or privacy system failing in a
way that leaves a claimant with no recourse.** Not rants. Not vibes. Incident reports —
dated, specific, and written so that a stranger (or an arbitrator) could follow the
paper trail.

Everywhere else in this project, the comedy is the point. Here it is not. Case files are
evidence. Write them like evidence.

---

## What a case file is

A case file records one person's complete, factual account of a dispute with a company
where the support process itself became part of the problem: the money at stake, what
was asked, what came back, and — critically — what happened to the *record* of all of
that over time.

One case file is an anecdote. A directory of structurally identical case files, each
showing the same failure pattern at different companies, is a dataset. That's the
project (see [`DESIGN.md`](../DESIGN.md) §4b–4c): individually tedious documentation,
made collective and consistent.

## The four claim elements

Every case file maps its facts onto the four elements from
[`DESIGN.md`](../DESIGN.md) §4c. A file doesn't need all four — it needs to be explicit
about which ones it evidences and which it doesn't.

1. **Privacy violated** — data held, sold, or shared without demonstrable consent.
2. **Sense of intrusion** — documented personal impact on the claimant.
3. **Support dissatisfaction** — the complaint as made, and its outcome.
4. **Support-record decay** — the documentation *vanished*: records that existed became
   unavailable, ticket history was purged, or the claimant was routed into an AI agent
   loop that never met the company's stated support terms.

### Element 4 is the one that matters most here

Elements 1–3 get collected all the time — regulators, review sites, and small-claims
filings are full of them. **Element 4 is the one nobody systematically collects**, and
it's the one that converts "I'm annoyed" into a documented pattern:

- You had a dashboard, an email thread, a ticket number. Later, you didn't — the portal
  purged it, the account closure took the history with it, the link 404s.
- The company's own records couldn't answer the question either. The dispute turned on
  an incident **neither side could produce the source of** (see
  [case file 001](001-twilio-suspicious-activity-shutoff.md)).
- Support was an AI agent loop, a deflection maze, or a queue that never produced the
  response the company's own support terms promised.

Individually, each of these reads as bad luck. Across hundreds of claimants at the same
company, it reads as a system that is *structurally incapable of producing a durable
record* — which is exactly the failure mode GDPR Art. 7(1) and the CCPA's right-to-know
provisions exist to expose. If the support record decays, the consent record probably
did too.

---

## How to contribute a case file

1. Copy [`TEMPLATE.md`](TEMPLATE.md).
2. Name it `NNN-company-short-slug.md` — next number in sequence, lowercase, hyphens
   (e.g. `002-acme-billing-loop.md`).
3. Fill in every section. Where you genuinely don't have a detail, say so explicitly —
   "unknown" is credible; silence is not.
4. Open a pull request. See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full
   process and the list of things that will get a PR rejected.

## What makes a case file credible

An arbitrator, journalist, or opposing counsel should be able to check your file
against reality. That means:

- **Dates.** Even approximate ones ("week of 2024-03-11") beat none. Every contact in
  the timeline gets one.
- **Ticket numbers, case IDs, reference numbers** — whatever the company's system
  issued. If it issued nothing, *that fact* goes in the file; it's element-4 evidence.
- **Amounts.** What was billed, disputed, charged, refunded, or written off. "About
  $20,000" is fine. "A lot" is not.
- **What was asked, verbatim where possible.** Quote your own messages; you own those.
- **What came back.** Quote or closely paraphrase responses, and say which channel each
  came through (email, chat, phone, in-app agent).
- **What existed, then didn't.** The heart of element 4: name the documentation that
  was available at the time, and the moment you discovered it no longer was.
- **No mind-reading.** Report what happened, not why you think they did it. "The stated
  reason was X" is a fact. "They did it to bury the evidence" is a theory — leave it out.
- **No legal conclusions.** "This violates §1798.110" is for lawyers and the demand
  letters. A case file says what happened; the pattern does the arguing.

## Redaction rules

- **Your own PII:** publish what you choose, redact the rest — but keep the verifiable
  spine (dates, ticket numbers, amounts) intact.
- **Other people's PII:** always redacted. No exceptions.
- **Support staff:** redact individual employee names — the failure is systemic, and
  naming a rep turns an incident report into a pile-on. Roles are fine ("tier-2 billing
  agent").

## Right of response

Every case file names a company, so every case file carries a standing invitation for
that company to respond. Corrections supported by documentation are published **in the
case file itself, with the same prominence as the original claim.** We are building a
record, not a grudge. A company that shows up with the receipt is the system working —
that's literally what we asked for.
