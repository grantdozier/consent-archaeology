# LEGAL BASIS — statute by statute

> Every citation in this file, and every template in `templates/`, rests on the law
> summarized here. Each entry carries a **verified-as-of date**. When that date gets
> stale, re-verify before shipping — a wrong citation discredits the entire project.
>
> Nothing in this file is legal advice. See [`DISCLAIMER.md`](DISCLAIMER.md).

---

## ⚠️ THE CLOCK THAT MATTERS RIGHT NOW: August 1, 2026

**Verified 2026-07-27 — this is five days away.**

Under the **California Delete Act (SB 362, 2023)**, the California Privacy Protection
Agency's **DROP** — the *Delete Request and Opt-out Platform* — went live for consumers
on **January 1, 2026** at **https://consumer.drop.privacy.ca.gov**. Any California
resident can file **one free deletion request that reaches every data broker on the
CPPA's registry** — hundreds of companies, in one request.

Requests filed before August 1 have been queuing. Then:

- **Beginning August 1, 2026**, every registered data broker **must** access DROP at
  least **once every 45 days** and **process the verified deletion requests** waiting
  there. Unverified requests must be honored as opt-outs of sale/sharing.
- Practical effect: a request submitted now enters the first mandatory processing
  window; the CPPA's consumer guidance states brokers must delete within **90 days**
  of the August 1 start (the 45-day access cycle plus the processing window), and
  every 45 days on an ongoing basis thereafter.
- **Noncompliance is priced per request, per day**: following **SB 361** (the
  *Defending Californians' Data Act*, effective January 1, 2026), an unprocessed
  deletion request can draw a fine of **$200 per deletion request per day**.
- Brokers must also delete new data about you every 45 days going forward, and
  third-party audits of broker compliance begin in 2028.

**Why this matters for launch:** DROP is the state doing, by force of law, a piece of
what this tool documents by demand letter. The two are complementary — DROP deletes at
registered California brokers; our letters create the *paper trail* and reach
controllers DROP never touches (non-brokers, out-of-state services, EU controllers).
Every California user should be pointed at DROP **in addition to** their letters.

Sources: Cal. Civ. Code §1798.99.80 et seq.; CPPA, cppa.ca.gov/data_brokers/;
privacy.ca.gov DROP consumer page. **Verified as of 2026-07-27.**

---

## 1. GDPR — Regulation (EU) 2016/679

**Who it covers:** people **in the EU/EEA**, plus processing by controllers established
in the EU, plus non-EU controllers that offer goods/services to or monitor people in
the EU (Art. 3). A US resident generally cannot invoke GDPR against a US company with
no EU nexus — the templates say so honestly. The **UK GDPR** mirrors these provisions
for the UK (regulator: the ICO).

| Provision | What it gives you | Verified |
|---|---|---|
| **Art. 7(1)** | *"Where processing is based on consent, the controller **shall be able to demonstrate** that the data subject has consented to processing of his or her personal data."* The burden of proof of consent sits on the controller, permanently. This is the spine of the Consent Provenance Demand. | 2026-07-27 |
| **Art. 15(1)** | Right of access: confirmation of processing plus the personal data itself and the purposes, categories, recipients, retention period, and rights of complaint. | 2026-07-27 |
| **Art. 15(1)(g)** | Where the data was **not collected from you**: *"any available information as to their source."* This is how you trace the broker/acquisition chain. | 2026-07-27 |
| **Art. 15(3)** | A copy of the personal data, **free of charge** for the first copy. | 2026-07-27 |
| **Art. 12(3)** | **Response deadline: one month** from receipt, extendable by **two further months** where necessary (complexity/volume) — but the controller must tell you about the extension, with reasons, within the first month. | 2026-07-27 |
| **Art. 12(6)** | The controller may request additional information to confirm identity if it has reasonable doubts. (Why anonymous requests are void — see DESIGN.md R7.) | 2026-07-27 |
| **Art. 77** | Right to lodge a complaint with a supervisory authority. Escalation route if the deadline blows. EU authority directory: https://edpb.europa.eu/about-edpb/about-edpb/members_en · UK: https://ico.org.uk/make-a-complaint/ | 2026-07-27 |

No amendment to Articles 7, 12, or 15 has occurred since adoption. **Verified as of
2026-07-27.**

---

## 2. California — CCPA/CPRA (Cal. Civ. Code §1798.100 et seq.)

**Who it covers:** **California residents**, against businesses meeting the CCPA
thresholds. Not available to non-residents.

| Provision | What it gives you | Verified |
|---|---|---|
| **§1798.110** | **Right to know**: categories of personal information collected, **categories of sources**, business purpose, categories of third parties it's shared with, and the **specific pieces** of personal information held about you. | 2026-07-27 |
| **§1798.115** | **Right to know re: sale/sharing**: the categories of personal information the business **sold or shared, and the categories of third parties to whom** — plus categories disclosed for a business purpose. The disclosure-trail letter. | 2026-07-27 |
| **§1798.105** | **Right to delete** personal information collected from you, with enumerated exceptions; the business must also **notify service providers, contractors, and third parties** to delete. | 2026-07-27 |
| **§1798.130(a)(2)** | **Response deadline: 45 calendar days** from receipt, extendable **once by a further 45 days** (90 total) with notice and explanation. Inability to verify does not extend the first 45. Look-back: 12 months by default; for data collected on or after Jan 1, 2022, you may request beyond 12 months (§1798.130(a)(2)(B)). | 2026-07-27 |
| **CCPA Regs, 11 CCR §7021** | Business must **confirm receipt within 10 business days** and describe how the request will be processed. | 2026-07-27 |
| **§1798.150** | Private right of action — **data breach only** (unencrypted/unredacted PI, statutory damages $100–$750 per consumer per incident). There is **no** private right of action for right-to-know/delete violations; enforcement there belongs to the CPPA and AG. The templates never imply otherwise. | 2026-07-27 |

**Escalation route:** complaint to the California Privacy Protection Agency —
https://cppa.ca.gov/webapplications/complaint — and/or the California Attorney General —
https://oag.ca.gov/contact/consumer-complaint-against-business-or-company

---

## 3. California Delete Act — Cal. Civ. Code §1798.99.80 et seq. (SB 362)

**Who it covers:** California residents, against **registered data brokers**.

- **Registration:** data brokers must register **annually by January 31** with the CPPA
  (registry moved from the AG to the CPPA), disclosing categories collected. **SB 361**
  (eff. 2026-01-01) expanded the disclosures: whether the broker sells/shares to
  **foreign actors, government entities, law enforcement, or AI-model developers**.
  The public registry is the source for `worker/src/brokers.js` legal-entity fields.
- **DROP:** one free deletion request to all registered brokers —
  https://consumer.drop.privacy.ca.gov — consumer-accessible since **2026-01-01**;
  **mandatory broker processing begins 2026-08-01** (see the flag box at top).
- **Penalties:** $200/day for failure to register; **$200 per deletion request per day**
  for unprocessed DROP requests.

**Verified as of 2026-07-27.**

---

## 4. Other US state laws in force (the provenance hooks)

Twenty US states have comprehensive privacy laws in effect in 2026 (Indiana, Kentucky,
and Rhode Island joined in January). Nearly all give **access** and **deletion** rights
with a **45-day response deadline, extendable once by 45 days**. All apply to
**residents of that state only**. The ones that matter most to this project:

| State | Citation | Deadline | The hook | Verified |
|---|---|---|---|---|
| **Oregon** (OCPA) | ORS 646A.574(1)(a)(B) | 45d + 45d ext. | **Strongest state provenance hook.** Right to a **list of specific third parties** (named entities, not categories) to which the controller disclosed your personal data — or, at the controller's option, any personal data. | 2026-07-27 |
| **Minnesota** (MCDPA) | Minn. Stat. §325M.14, subd. 1(h) | 45d + 45d ext. | Same specific-third-party list right as Oregon: *"A consumer has a right to obtain a list of the specific third parties to which the controller has disclosed the consumer's personal data."* Falls back to an any-consumer list if no consumer-specific records exist. | 2026-07-27 |
| **Colorado** (CPA) | C.R.S. §6-1-1306; CPA Rules, 4 CCR 904-3 | 45d + 45d ext. | **The consent-records hook.** The CPA Rules require controllers to **maintain documentation demonstrating compliance with the consent rules** (Rules 6.11, 7) for the life of the processing **plus 24 months**, and to keep records of all data-rights requests for 24 months. A Colorado resident demanding sensitive-data consent records is asking for documents the controller is *required by regulation to possess*. | 2026-07-27 |
| **Connecticut** (CTDPA) | Conn. Gen. Stat. §42-518 | 45d + 45d ext. | Access + deletion; **major amendments (SB 1295) took effect 2026-07-01**: threshold dropped to 35,000 consumers, applies at *any* volume to controllers processing sensitive data or selling personal data, expanded sensitive-data categories, tightened minimization ("reasonably necessary **and proportionate**"). | 2026-07-27 |
| **Texas** (TDPSA) | Tex. Bus. & Com. Code §541.051 et seq. | 45d + 45d ext. | Access + deletion with **no minimum processing threshold** (applies to any non-small business processing Texans' data) and the **largest state penalty: up to $25,000 per violation**, AG-enforced. Aggressive AG enforcement posture. | 2026-07-27 <!-- TODO(verify): rights at §541.051 confirmed; exact subsection housing the 45-day deadline (§541.052?) not independently confirmed as of 2026-07-27 --> |
| **Virginia** (VCDPA) | Va. Code Ann. §59.1-577 | 45d + 45d ext. | The original state clone: access, deletion, categories of third parties. First-mover, well-settled. | 2026-07-27 |
| **Montana** (MCDPA) | Mont. Code Ann. Title 30, ch. 14, part 28 (§30-14-2801 et seq.) | 45d + 45d ext. | Access + deletion at low thresholds (50,000 consumers; lowered further by 2025 amendments eff. 2025-10-01). | 2026-07-27 <!-- TODO(verify): part-28 codification confirmed in secondary sources; exact section numbers for individual rights not independently confirmed as of 2026-07-27 --> |

**What no US state gives you:** a general-purpose Art. 7(1)-style duty to *demonstrate
consent* for ordinary personal data — US state laws are opt-out regimes, not consent
regimes. The honest framing (used in the Consent Provenance Demand): US state law
compels **source and recipient disclosure** (§1798.110/.115, Oregon, Minnesota) and
**consent documentation for sensitive data** (Colorado); GDPR Art. 7(1) supplies the
demonstrate-consent duty **where GDPR applies**. The template asserts each basis only
against the jurisdictions where it holds. No bluffing — a privacy officer who catches
one overreach discounts the whole letter.

---

## 5. Response-deadline cheat sheet

| Regime | Acknowledge | Substantive response | Extension | Escalation if missed |
|---|---|---|---|---|
| GDPR / UK GDPR | — | **1 month** (Art. 12(3)) | +2 months, with notice & reasons in month 1 | Supervisory authority (Art. 77); EDPB member list; UK ICO |
| CCPA/CPRA | **10 business days** (11 CCR §7021) | **45 calendar days** (§1798.130(a)(2)) | +45 days, with notice | CPPA complaint · CA AG complaint |
| Delete Act / DROP | — | broker must check DROP **every 45 days** and process (from **2026-08-01**) | — | CPPA ($200/request/day) |
| VA · CO · CT · TX · OR · MT · MN | — | **45 days** | +45 days, with notice | State Attorney General (CO: also district attorneys) |

---

## 6. What we could NOT verify (flagged, per the accuracy rule)

- **Texas**: the 45-day response deadline is uniformly reported by practitioner
  sources, but the exact TDPSA subsection housing it was not independently pulled from
  the statute text as of 2026-07-27. Templates cite "Tex. Bus. & Com. Code ch. 541"
  for the deadline rather than a pinpoint.
- **Montana**: rights confirmed; pinpoint section numbers within part 28 not
  independently confirmed. Templates cite the part, not a section.
- Everything else in this file was verified against primary or authoritative secondary
  sources on **2026-07-27**.

---

*Verification log: CPPA (cppa.ca.gov/data_brokers, privacy.ca.gov DROP pages, fetched
2026-07-27); Cal. Legislature (SB 361 text); Oregon Revised Statutes (ORS 646A.574);
Minnesota Revisor (Minn. Stat. §325M.14, fetched 2026-07-27); Colorado SoS (4 CCR
904-3); multistate practitioner surveys of 2026 effective dates. Mass-arbitration
authorities are cited in [`MASS-ARBITRATION.md`](MASS-ARBITRATION.md).*
