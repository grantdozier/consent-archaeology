<div align="center">

```
 ▄████▄   ▒█████   ███▄    █   ██████ ▓█████  ███▄    █ ▄▄▄█████▓
▒██▀ ▀█  ▒██▒  ██▒ ██ ▀█   █ ▒██    ▒ ▓█   ▀  ██ ▀█   █ ▓  ██▒ ▓▒
▒▓█    ▄ ▒██░  ██▒▓██  ▀█ ██▒░ ▓██▄   ▒███   ▓██  ▀█ ██▒▒ ▓██░ ▒░
▒▓▓▄ ▄██▒▒██   ██░▓██▒  ▐▌██▒  ▒   ██▒▒▓█  ▄ ▓██▒  ▐▌██▒░ ▓██▓ ░
▒ ▓███▀ ░░ ████▓▒░▒██░   ▓██░▒██████▒▒░▒████▒▒██░   ▓██░  ▒██▒ ░
                    A R C H A E O L O G Y
```

### You allegedly agreed. Prove it.

*An absurdly over-classified terminal for the least-protected asset in modern life: your own name.*

[**▶ ENTER THE FACILITY**](https://dig.doziertechgroup.com) · [How it works](#how-it-works) · [What it refuses to do](#what-this-refuses-to-do) · [Legal basis](legal/LEGAL-BASIS.md)

</div>

---

## The joke

You need two forms of ID, a notarized letter, and a business day to change your own
mailing address at the bank.

A company you have never heard of, in a state you have never visited, will sell your
name, phone number, current address, three previous addresses, your relatives' names,
and your approximate income to anyone with $0.003 and a credit card. No ID. No letter.
No business day.

So we built the ID check. For you. About you. And we made it look like launch codes,
because apparently that's what it takes for anyone to treat your identity like it matters.

## The part that isn't a joke

Buried in GDPR Article 7(1) is one of the most quietly devastating sentences in
consumer law:

> *"the controller **shall be able to demonstrate** that the data subject has consented."*

Not *"consent must be obtained."* **Demonstrate.** Produce it. Show the receipt.

Now think about how your data actually got where it is. A 2009 signup. A ToS rewrite in
2014 nobody read. An acquisition in 2017 where the database moved but the consent logs
didn't. A broker purchase in 2021 where "consent" meant a checkbox on a sweepstakes
entry your cousin filled out.

**They have your data. They lost the receipt.**

Nobody asks for the receipt, because asking is tedious, the address is buried, and the
form is designed to exhaust you. That's the whole business model. It only works at scale
against people acting alone.

So: what if asking took ninety seconds and looked incredibly cool?

---

## How it works

**1 — Request clearance.** Name, email, city, previous addresses. Ninety seconds.

**2 — Verify it's you.** We email you a link. You click it. This is the boring step and
it is the single most important line of code in this repo — see
[below](#what-this-refuses-to-do).

**3 — The sweep.** We check a curated list of data brokers for records matching you, and
we log the *company* too: legal entity name, headquarters address, registry ID. Not just
"someone has your data" — *who, incorporated where, at what street address.*

**4 — The demand.** We generate four letters in your name:

| Letter | What it asks for | Authority |
|---|---|---|
| Right to Know | Every piece of data you hold on me | Cal. Civ. Code §1798.110 |
| Disclosure Trail | Everyone you sold or shared it with | Cal. Civ. Code §1798.115 |
| Deletion | Delete it | Cal. Civ. Code §1798.105 |
| **Consent Provenance** | **The receipt. The date. The exact form. Proof I saw it.** | **GDPR Art. 7(1)** |

That last one is the whole project. The first three they have automated pipelines for.
The fourth one, for a lot of these companies, has no answer at the other end.

**5 — The evidence locker.** Whatever comes back — including *nothing* — gets timestamped
and hash-chained into a file **you own and can export.** Because a pattern of ten thousand
identical non-answers is not ten thousand complaints. It's discovery.

---

## What this refuses to do

Every privacy tool should have this section. Most don't. Ours is enforced in code, not vibes —
see [`DESIGN.md`](DESIGN.md) §1.

**❌ It does not ask for your Social Security Number.** Not the full one, not the last
four, not in an advanced mode. A public repo collecting SSNs behind a dramatic UI is a
phishing kit no matter who wrote it. You don't need an SSN to find broker records anyway.
The field in the UI reads `[FIELD REMOVED ON ADVICE OF COUNSEL]` and points you at a
credit freeze, which is free, is the law, takes ten minutes, and works better than we do.

**❌ It does not claim to delete you from the internet.** Nobody can do that. Anyone
selling you that is lying, and if they're taking your money for it, they're committing a
deceptive trade practice. We send legally-grounded demands and we track who complies.
The word "nuke" appears nowhere in the interface.

**❌ It does not look anyone up but you.** You can only run a sweep on an email address
you have proven you control, in that session. No admin bypass. No research mode. No
"just this once." Without that gate this is a stalking tool with good typography — the
entire ethical difference between this and a doxing engine is one email round-trip, and
we are not skipping it to improve conversion.

**❌ It does not crawl the open internet.** Firecrawl hits a reviewed allowlist of broker
endpoints, respects `robots.txt`, and rate-limits per person. And to be exact about it:
Firecrawl reads web pages. It does not trace IP addresses. If you saw that claim
somewhere, it wasn't from us.

**❌ It does not give legal advice or represent you.** We're not lawyers. These are
self-help documents you send as yourself. Your evidence file is *yours* — export it,
take it to any firm you like.

---

## Why we think this gets big

Because it's the same trick that works every time: **an individually tedious act, made
collective and instant.**

One person asking a data broker to produce a 2011 consent record is a support ticket
that gets closed unread.

Forty thousand people asking on the same Tuesday is a compliance event.

And the mechanism at the end isn't a class action — class actions die in the arbitration
clause these companies all wrote into their terms. It's **mass arbitration**, which
weaponizes that exact clause: thousands of individual filings, each carrying a
per-claimant fee *the company* owes. It is the one door they nailed shut from the inside
and cannot reopen. [Details here.](legal/MASS-ARBITRATION.md)

We just make the paperwork fast, consistent, and kind of a rush to fill out.

---

## Case files

Real, documented instances of support systems failing in ways that leave a claimant with
nothing. Starting with the one that started this: **a $20,000 Twilio bill, a suspicious-
activity shutoff, and an incident neither party could ever locate the source of.**

📁 [`case-files/`](case-files/) — [contributions welcome](CONTRIBUTING.md)

---

## Run it yourself

Static frontend, one Cloudflare Worker, ~$0/month. No framework, no build step, no npm
runtime dependencies. It's a terminal made of divs.

```bash
git clone https://github.com/grantdozier/consent-archaeology
cd consent-archaeology
# frontend: it's static. open docs/index.html.
# backend:
cd worker && npm i -g wrangler   # needs Node >= 22
wrangler d1 create consent_archaeology
wrangler deploy
```

Full instructions, including every secret you need and where to put it, in
[`DEPLOY.md`](DEPLOY.md).

---

<div align="center">

**Free forever.** There is a donate button. It appears *after* you get your results,
never before, and if you dismiss it we never ask you again — not on this device, not on
any device, not in thirty days. That's a promise implemented in the schema.

MIT licensed · Built in Louisiana by [Dozier Tech Group](https://doziertechgroup.com)

*If a company can't produce the receipt, they never had consent. They had your data anyway.*

</div>
