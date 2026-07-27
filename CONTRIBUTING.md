# Contributing

Thanks for wanting to help. Read this whole file first — especially the rejection
list. This repo has [Hard Rules](DESIGN.md#1-hard-rules--non-negotiable), they are
enforced in review, and "but it would be a cool feature" has never once been a
counterargument to any of them.

**[`DESIGN.md`](DESIGN.md) is the binding build contract.** If your PR conflicts with
it, the PR is wrong, even if the PR is clever. *Especially* if the PR is clever.

---

## Ways to contribute

1. **Case files** — documented support/privacy failures. The most valuable
   contribution a non-developer can make. See [`case-files/README.md`](case-files/README.md)
   and use [`case-files/TEMPLATE.md`](case-files/TEMPLATE.md). Credibility bar: dates,
   ticket numbers, amounts, what was asked, what came back. Anonymous case files are
   not accepted — a claim nobody stands behind is a rumor with formatting.
2. **Brokers for the allowlist** — see [below](#adding-a-broker-to-the-allowlist).
3. **Code** — vanilla JS, no frameworks, no build step, no npm runtime dependencies
   (DESIGN.md §7). Keyboard accessible, real `<label>`s, `prefers-reduced-motion`
   respected. The bit never breaks a11y.
4. **Legal template review** — statute citations in `legal/` carry currency dates;
   corrections with sources are gold.
5. **Truth-panel copy** — the right panel must be plain-English, jargon-free, and
   funnier than the theater because it's flat. If you can make it flatter, PR it.

## Process

- Fork, branch, PR against the default branch. Small PRs review fast.
- One logical change per PR. A broker addition and a CSS fix are two PRs.
- PR description says *what* and *why*. If it touches anything in the rejection list
  below, save us both the time.

---

## Contributions we will reject

These are not style preferences. Each one exists because this is a **public repo that
collects PII and accepts money**, and each rejection maps to a Hard Rule in
[`DESIGN.md` §1](DESIGN.md#1-hard-rules--non-negotiable). PRs that do any of the
following will be closed, with a link to this section, no matter how well-written
they are.

### 1. Anything adding an SSN field — rejected (R1)

No SSN input, no "last 4," no schema column, no optional advanced mode, no
commented-out field "for later." **Why:** a public repo that collects Social Security
Numbers behind a dramatic UI is, to any security researcher who finds it,
indistinguishable from a phishing kit — because functionally it *is* one, regardless
of intent. Also it's unnecessary: brokers key on name + address history + email +
phone. The correct tool for SSN anxiety is a credit freeze, and the UI says so.

### 2. Anything that removes or weakens the identity-verification gate — rejected (R3)

No admin bypass, no "research mode," no dev flag that skips the Brevo magic link, no
caching a verification across sessions beyond what the design allows. **Why:** the
verified-self gate is the *entire* ethical difference between this tool and a doxing
engine. Public repo + "type a name, get everything" = a stalking tool with good
typography. The gate is one email round-trip. We are not trading it for conversion,
convenience, or your demo.

### 3. Anything enabling lookups of a person other than the verified user — rejected (R3)

No "check on a family member," no "authorized agent mode," no batch upload of other
people's names, no API parameter that decouples the swept identity from the verified
email. **Why:** same rule as #2, sharper edge — every one of these features is "dox
someone else" wearing a helpful hat. The sweep subject and the verified email holder
must be the same person, cryptographically tied to this session, forever.

### 4. Anything adding open-web crawling beyond the broker allowlist — rejected (R4)

No "search the whole internet for this person," no Google-dorking module, no social
media scraping, no generic URL parameter fed to Firecrawl. **Why:** the allowlist
(`worker/src/brokers.js`) is a reviewed set of data-broker endpoints with named legal
entities behind them. Open-web crawl converts a targeted compliance tool into a
general-purpose profile builder — the exact thing this project exists to fight. Also:
Firecrawl reads HTML. It does not "trace IPs," and no PR copy may imply otherwise.

### 5. Any copy claiming we delete, erase, wipe, nuke, scrub, or purge data — rejected (R2)

Or "guaranteed removal," or "remove you from the internet," in any user-facing string,
README, tweet draft, or meta description. **Why:** nobody can delete data from the
internet, and this project accepts donations — so claiming erasure isn't just wrong,
it's a paid-service misrepresentation squarely inside FTC Act §5 deceptive-practices
territory. We *demand, compel, request, file, document, track, escalate*. The theater
may be loud; the claims must be exact.

### Also instant-rejects, for the same underlying reasons

- **Fake progress** — any progress bar, spinner, or "Sent!" not backed by real async
  state (DESIGN.md §3). Faked progress is faked success, and faked success is banned.
- **PII in logs or error messages** (R5). PII is radioactive; it goes in encrypted
  columns or nowhere.
- **Anonymous demand-sending** (R7). Demands are signed by a real, identifiable human
  or they are legally void and indistinguishable from harassment.

---

## Adding a broker to the allowlist

The allowlist lives at `worker/src/brokers.js`. It is short on purpose. A PR adding a
broker **must** include every one of the following, each with a source:

| Required field | What it is | Acceptable source |
|---|---|---|
| **Legal entity name** | The registered company, not the brand ("Acme Data LLC", not "acmepeoplesearch.com") | State SoS filing, CA registry entry, their own ToS |
| **HQ address** | Registered or principal business address | Same filing, registry entry, or official filing document |
| **Registry ID** | California Data Broker Registry ID (per SB 362 / the Delete Act), or the equivalent registration in another jurisdiction, or an explicit note that the entity is unregistered (which is itself interesting) | [CPPA data broker registry](https://cppa.ca.gov/data_broker_registry/) |
| **Opt-out URL** | The broker's own suppression/opt-out endpoint | The broker's site (link to the exact page) |
| **Source for each of the above** | A URL or document reference per field — "trust me" is not a citation | — |

Additional requirements:

- The endpoint must be a **broker search or opt-out page**, not a general website.
  We crawl listing pages about the verified user; we do not crawl companies.
- Confirm the target respects being crawled: check `robots.txt` and note the result
  in the PR.
- One broker per PR. Reviews are line-by-line because this list is the R4 boundary.

## Case-file standards, short version

Full version in [`case-files/README.md`](case-files/README.md). The short version:
dates, ticket numbers, amounts, what was asked, what came back, what documentation
existed and what later didn't. No motive-guessing, no legal conclusions, redact other
people's PII always and support reps' names specifically. Every case file invites the
named company to respond, and documented corrections get published with equal
prominence. We're building a record, not a grudge.

## Questions

Open an issue. If your question is "can I add just a tiny SSN field," see above, and
also: no.
