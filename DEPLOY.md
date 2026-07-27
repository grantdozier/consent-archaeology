# DEPLOY.md — full deploy runbook

Everything needed to take this repo from clone to live at
`https://dig.doziertechgroup.com`, in order. Secrets are named here but **never**
written here — see [step 5](#5-worker-secrets).

---

## ⚠️ 0. Node >= 22 first. Every time.

**Wrangler requires Node >= 22. The default local Node on this machine is 20.**
This bites on every deploy, so it goes first:

```bash
node -v          # if this says v20.x, STOP
nvm use 22       # or however you switch (nvm-windows: `nvm use 22.x.x` with the full version)
node -v          # must print v22.x or later before ANY wrangler command below
```

Every `wrangler` command in this runbook assumes you already did this. If wrangler
throws an inscrutable engine or syntax error, it's this. It's always this.

---

## 1. GitHub Pages (frontend)

The static site is `docs/` on the default branch, deployed by the workflow at
`.github/workflows/pages.yml`.

1. Push the repo to `github.com/grantdozier/consent-archaeology` (default branch
   `main`).
2. Repo → **Settings → Pages** → Source: **GitHub Actions**. (The workflow uses the
   official `configure-pages` / `upload-pages-artifact` / `deploy-pages` actions and
   uploads `docs/` as the artifact.)
3. Still in Settings → Pages: set **Custom domain** to `dig.doziertechgroup.com`.
   The `docs/CNAME` file should contain the same value so the setting survives
   redeploys.
4. Wait for DNS (step 2 below), then tick **Enforce HTTPS** once the cert issues.

## 2. Cloudflare DNS

`doziertechgroup.com` DNS lives on **Cloudflare** (nameservers
`jonah.ns.cloudflare.com` / `chin.ns.cloudflare.com`). The domain may be *registered*
via Azure, but **there are no Azure DNS zones — do not go looking for one.** Every
record in this runbook goes in the **Cloudflare dashboard**.

Add:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `dig` | `grantdozier.github.io` | DNS only (grey cloud) |

Grey-cloud it — GitHub Pages needs to see the CNAME directly to issue the
certificate. Verify with:

```bash
nslookup dig.doziertechgroup.com
```

## 3. Cloudflare Worker — D1 database

From `worker/` (Node 22, remember):

```bash
npm i -g wrangler                      # if not installed
wrangler login                         # once per machine

wrangler d1 create consent_archaeology
```

The output includes a `database_id`. **Paste it into `worker/wrangler.toml`** at the
`TODO(deploy)` marker in the `[[d1_databases]]` block.

Apply the schema:

```bash
wrangler d1 execute consent_archaeology --file=schema.sql --remote
```

(Run without `--remote` first if you want to sanity-check against the local
simulator.)

## 4. Cloudflare Worker — KV namespace

```bash
wrangler kv namespace create SESSIONS
```

Paste the returned `id` into `worker/wrangler.toml` at the `TODO(deploy)` marker in
the `[[kv_namespaces]]` block.

## 5. Worker secrets

Every secret goes in via `wrangler secret put`, which prompts for the value and
stores it in Cloudflare. **Secrets never go in the repo, never in `wrangler.toml`,
never in `.dev.vars` committed by accident** (`.dev.vars` is gitignored, but the rule
stands). Values live in the service dashboards / password manager; you paste them at
the prompt.

```bash
wrangler secret put BREVO_API_KEY        # Brevo dashboard → SMTP & API → API keys
wrangler secret put FIRECRAWL_API_KEY    # Firecrawl dashboard
wrangler secret put PII_ENCRYPTION_KEY   # generate fresh: openssl rand -base64 32
```

For `PII_ENCRYPTION_KEY`: generate a fresh 32-byte key (`openssl rand -base64 32` in
Git Bash), paste it at the prompt, and store a copy in the password manager —
**losing it makes every encrypted PII row in D1 permanently unreadable**, which is
great for attackers and terrible for the export-and-delete-me endpoint (R5).

Then deploy:

```bash
wrangler deploy
```

Note the `*.workers.dev` URL it prints — the frontend's `docs/assets/api.js` must
point at it (check for a `TODO(deploy)` marker there).

## 6. Brevo — sender domain verification

The R3 magic-link email comes from Brevo (300/day free tier). Brevo must verify the
sender domain, via DNS records that — say it with me — **go in the Cloudflare
dashboard**:

1. Brevo dashboard → **Senders, Domains & Dedicated IPs → Domains** → add
   `doziertechgroup.com`.
2. Brevo shows a set of DNS records: a `brevo-code` TXT verification record, DKIM
   records (`mail._domainkey.*` etc.), and a DMARC TXT if not present.
3. Add each in Cloudflare exactly as shown (TXT/CNAME records aren't proxied, so
   there's no orange/grey decision to get wrong).
4. Back in Brevo, click **Verify & Authenticate**. Propagation is usually minutes.
5. Send a test magic-link email from the deployed Worker and confirm it lands in an
   inbox, not spam.

## 7. Stripe — Payment Link with Apple Pay

Donations are Stripe (Apple Pay) + Venmo, shown only **after** the dossier renders
(DESIGN.md §5).

1. **Apple Pay domain verification** (required before Apple Pay works): Stripe
   dashboard → **Settings → Payments → Payment method domains** → add
   `doziertechgroup.com`. Stripe provides
   `apple-developer-merchantid-domain-association`; host it at
   `https://doziertechgroup.com/.well-known/apple-developer-merchantid-domain-association`
   and click verify.
2. Create a **Payment Link**: suggested amounts, card + **Apple Pay** enabled.
3. Set the after-payment behavior to redirect to the return URL —
   **`https://doziertechgroup.com/dig/thanks`**. The return URL is always on
   `doziertechgroup.com`; this is required, not a preference.
4. Put the Payment Link URL where the donation UI expects it (search `docs/` for the
   `TODO(deploy)` marker).

## 8. Venmo

The donation panel deep-links `venmo://paycharge?txn=pay&recipients=<HANDLE>&note=...`
with an `https://venmo.com/<HANDLE>` desktop fallback.

**`TODO(deploy): Grant's Venmo handle`** — replace the placeholder in the donation UI
(search the repo for `TODO(deploy)`) before launch. Until it's replaced, the Venmo
button points at a placeholder, which violates the never-fake-success rule — so it
must not ship that way.

---

## 9. Pre-launch checklist

Run every line. The first two are Hard Rules — if either fails, **do not launch**,
no matter how good the terminal looks.

- [ ] **R1 — the no-SSN rule holds in reality, not just in copy.**
      `grep -ri "ssn\|social.security" docs/ worker/` returns *only* the
      `[FIELD REMOVED ON ADVICE OF COUNSEL]` joke and its credit-freeze pointer — no
      input, no schema column, no request field, nothing parked in a comment.
- [ ] **R3 — the identity-verification gate actually gates.** With no verified
      session, call the sweep endpoint directly
      (`curl -X POST https://<worker>/api/sweep ...` with no/invalid session token)
      and confirm it is **refused**. Then complete a real magic-link round-trip and
      confirm the sweep runs only for the verified email's identity. The gate must
      hold at the API, not just in the UI.
- [ ] Magic-link email arrives (real inbox, not spam) and the link verifies.
- [ ] **R2 sweep:** `grep -riE "destroy|erase|wipe|nuke|scrub|purge|guaranteed removal" docs/`
      finds nothing in user-facing copy (the R5 auto-purge of *our own* stored PII is
      internal and fine; user-facing verbs are demand/compel/request/file/document/
      track/escalate).
- [ ] Progress bars track real fetch state — throttle the network in devtools and
      watch them slow down. If they don't, they're fiction, which is banned.
- [ ] `/api/stats` returns aggregate counts only — no names, no cities.
- [ ] No PII appears in Worker logs (`wrangler tail` during a full test run).
- [ ] Export-and-delete-me endpoint works on a test subject.
- [ ] Donation panel appears only **after** the dossier, and dismissing it persists
      (localStorage + server flag — reload, different device, still gone).
- [ ] Stripe test payment completes and lands on
      `https://doziertechgroup.com/dig/thanks`; Apple Pay sheet appears on Safari.
- [ ] Venmo handle placeholder replaced; deep link opens Venmo, fallback URL works.
- [ ] `git grep -iE "api[_-]?key|secret" -- ':!*.md'` shows no live values;
      `wrangler.toml` contains IDs only, no secrets.
- [ ] `dig.doziertechgroup.com` loads over HTTPS, cert valid, both panels render,
      `prefers-reduced-motion` kills the flicker.
- [ ] All `TODO(deploy)` markers resolved: `git grep "TODO(deploy)"` returns nothing.

Launch.
