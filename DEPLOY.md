# DEPLOY.md — full deploy runbook (Azure)

Everything needed to take this repo from clone to live at
`https://dig.doziertechgroup.com`, in order. Secrets are named here but **never**
written here — see [step 5](#5-app-settings-the-secrets).

Target shape, per [`api/CONTRACT.md`](api/CONTRACT.md):

```
  dig.doziertechgroup.com                    ← GitHub Pages (docs/)
       │  fetch()
       ▼
  func-consent-archaeology.azurewebsites.net ← Azure Functions, Node 22, Linux, Consumption (Y1)
       ├── Cosmos DB  cosmos-dtg-consent-arch / consentarch   ← free tier, 1000 RU/s shared
       ├── Brevo API      ← verification email (R3 gate)
       ├── Firecrawl API  ← allowlist broker sweep (R4)
       └── Stripe         ← donation, return_url on doziertechgroup.com
```

Subscription: **DTG Platform**, `ea96e212-9b00-4e93-9d3b-9018638cee20`.
Resource group: `rg-consent-archaeology`. Location: `centralus`.

---

## ⚠️ 0a. DNS IS ON CLOUDFLARE. THERE ARE NO AZURE DNS ZONES.

**Read this before you open the Azure portal looking for a DNS blade. There isn't one.
There is nothing wrong. Stop looking.**

`doziertechgroup.com` is authoritative on Cloudflare:

```
jonah.ns.cloudflare.com
chin.ns.cloudflare.com
```

The domain is *registered* through Azure. **That does not matter.** Registration and
DNS hosting are different things, and the nameservers above are the ones the internet
actually asks. There are **zero** `Microsoft.Network/dnsZones` resources on this
subscription — moving the backend to Azure did not create one and must not.

So: **every DNS record for this project goes in the Cloudflare dashboard.** Every one.

| Record you might need | Where it goes |
|---|---|
| `dig` CNAME → `grantdozier.github.io` (Pages) | **Cloudflare** |
| Brevo sender verification (TXT + DKIM CNAMEs) | **Cloudflare** |
| Any future API subdomain (`dig-api` CNAME + `asuid` TXT) | **Cloudflare** |
| DMARC, SPF, anything else | **Cloudflare** |

Verify:

```bash
nslookup -type=ns doziertechgroup.com     # must show jonah/chin.ns.cloudflare.com
az network dns zone list -o table          # must be empty. if it isn't, someone made a mistake.
```

This has cost real time before. It is written here in this much detail so that it
cannot cost it again.

## ⚠️ 0b. Node >= 22 first. Every time.

**Azure Functions Core Tools v4 (`func`) needs Node >= 22, and the Function App runs
Node 22.** The default local Node on this machine is 20. Mismatched Node is how you
get code that runs locally and dies at cold start in production.

```bash
node -v          # if this says v20.x, STOP
nvm use 22       # nvm-windows: `nvm use 22.x.x` with the full version
node -v          # must print v22.x before ANY func/npm command below
```

Every `func` and `npm` command in this runbook assumes you already did this. If you
get an inscrutable engine or syntax error, it's this. It's always this.

```bash
npm i -g azure-functions-core-tools@4 --unsafe-perm true   # once per machine
az login                                                    # once per machine
az account set --subscription ea96e212-9b00-4e93-9d3b-9018638cee20
```

---

## 1. GitHub Pages (frontend)

The static site is `docs/` on the default branch, deployed by the workflow at
`.github/workflows/pages.yml`. Unchanged by the Azure move — the frontend never
cared what the backend ran on.

1. Push the repo to `github.com/grantdozier/consent-archaeology` (default branch
   `main`).
2. Repo → **Settings → Pages** → Source: **GitHub Actions**.
3. Still in Settings → Pages: set **Custom domain** to `dig.doziertechgroup.com`.
   The `docs/CNAME` file contains the same value so the setting survives redeploys.
4. Wait for DNS (step 2), then tick **Enforce HTTPS** once the cert issues.

## 2. Cloudflare DNS — the Pages record

Say it with me: **Cloudflare dashboard** (see §0a).

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `dig` | `grantdozier.github.io` | DNS only (grey cloud) |

Grey-cloud it — GitHub Pages needs to see the CNAME directly to issue the
certificate.

```bash
nslookup dig.doziertechgroup.com
```

---

## 3. Provision Azure

Every command below is **idempotent**: re-running the whole block on an existing
deployment is safe and is the intended way to verify state. Anything already there
is left alone.

Set the variables once (Git Bash):

```bash
SUB=ea96e212-9b00-4e93-9d3b-9018638cee20
RG=rg-consent-archaeology
LOC=centralus
COSMOS=cosmos-dtg-consent-arch
DB=consentarch
APP=func-consent-archaeology
ORIGIN=https://dig.doziertechgroup.com

az account set --subscription "$SUB"
```

### 3a. Resource group

```bash
az group create --name "$RG" --location "$LOC" -o none
```

### 3b. Cosmos DB — account, database, containers

**Free tier is one account per subscription and this one has claimed it.** If
`az cosmosdb create` ever complains that free tier is already in use, the answer is
never "create a second one" — it's "you're pointed at the wrong subscription."

```bash
az cosmosdb create \
  --name "$COSMOS" --resource-group "$RG" \
  --locations regionName="$LOC" failoverPriority=0 isZoneRedundant=False \
  --default-consistency-level Session \
  --enable-free-tier true \
  -o none
```

The database carries the throughput; containers share it. That is the whole reason
this fits in the free tier:

```bash
az cosmosdb sql database create \
  --account-name "$COSMOS" --resource-group "$RG" --name "$DB" \
  --throughput 1000 -o none
```

Containers — partition keys are load-bearing and come straight from
`api/CONTRACT.md`. **Do not pass `--throughput` to any of these.** A container with
dedicated throughput allocates its own RU/s outside the database's 1000 and puts the
account over free tier, which turns a $0 project into a billed one silently:

```bash
# sessions — the KV replacement. Native TTL is why Cosmos was chosen: magic-link
# tokens, rate-limit counters and the robots.txt cache expire without a cron job.
az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
  -n sessions  --partition-key-path /pk --ttl 86400 -o none

az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
  -n subjects  --partition-key-path /id -o none

# /subjectId on the rest, so a dossier read is single-partition
for c in sweeps findings demands evidence; do
  az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
    -n "$c" --partition-key-path /subjectId -o none
done
```

Verify:

```bash
az cosmosdb sql container list -a "$COSMOS" -g "$RG" -d "$DB" \
  --query "[].{name:name, pk:resource.partitionKey.paths[0], ttl:resource.defaultTtl}" -o table
```

Expected: six containers; `sessions` with `ttl 86400`; the rest with no default TTL.

### 3c. Storage account

Every Function App needs one (it stores the deployment package and the runtime's
own bookkeeping). The name must be globally unique, 3–24 chars, lowercase
alphanumeric only.

**Check whether one already exists before creating a second:**

```bash
az storage account list -g "$RG" --query "[].name" -o tsv
```

If that prints a name, use it: `STORAGE=<that name>`. If it prints nothing:

```bash
STORAGE="stconsentarch$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
echo "$STORAGE"          # write this down; it is referenced below

az storage account create \
  --name "$STORAGE" --resource-group "$RG" --location "$LOC" \
  --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false \
  -o none
```

### 3d. Function App

```bash
az functionapp create \
  --name "$APP" --resource-group "$RG" \
  --storage-account "$STORAGE" \
  --consumption-plan-location "$LOC" \
  --os-type Linux \
  --runtime node --runtime-version 22 \
  --functions-version 4 \
  -o none
```

`az functionapp create` also provisions an **Application Insights** resource unless
you pass `--disable-app-insights true`. Keep it — you need somewhere to read logs
(step 8 checks that no PII appears in them). But note what that means: **App Insights
is now an R5 surface.** Anything the code logs is retained there for 90 days by
default. "No PII in logs" is not a style preference; it is the difference between
encrypted-at-rest PII and a plaintext copy sitting in a telemetry store.

Confirm the runtime actually landed on Node 22:

```bash
az functionapp config show -n "$APP" -g "$RG" --query linuxFxVersion -o tsv   # Node|22
```

---

## 4. App Settings — configuration

Azure App Settings are `process.env` inside the function — this is what replaces the
Worker's per-request `env` object. The code **fails loudly at startup** if a required
one is missing, which is deliberate: an encryption key that silently defaults is the
worst available failure mode for a tool holding PII.

The authoritative list is `REQUIRED` in [`api/src/lib/config.js`](api/src/lib/config.js)
— that array is what actually throws at startup. It is a superset of CONTRACT.md's
table: the implementation added `PUBLIC_APP_URL` and `SENDER_EMAIL`, both required,
and made `FIRECRAWL_API_KEY` optional (absent ⇒ each broker in a sweep records a real
`firecrawl_not_configured` error code rather than the whole app refusing to boot). If
that array and this section ever disagree, **the array is right** — fix this file.

### 4a. Cosmos connection, CORS origin, app URL, sender (read straight from Azure)

```bash
COSMOS_ENDPOINT=$(az cosmosdb show -n "$COSMOS" -g "$RG" --query documentEndpoint -o tsv)
COSMOS_KEY=$(az cosmosdb keys list -n "$COSMOS" -g "$RG" --query primaryMasterKey -o tsv)

az functionapp config appsettings set -n "$APP" -g "$RG" --settings \
  COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
  COSMOS_KEY="$COSMOS_KEY" \
  COSMOS_DB="$DB" \
  ALLOWED_ORIGIN="$ORIGIN" \
  PUBLIC_APP_URL="$ORIGIN" \
  -o none
```

`ALLOWED_ORIGIN` is comma-separated if you ever need more than one origin.
`PUBLIC_APP_URL` is where magic links land — `verify.html` reads `?token=` from it —
so it must be the **frontend** origin, never the Function App's. Pointing it at
`azurewebsites.net` produces links that 404, which reads to a user as "the email is
broken" and to R3 as "nobody can ever verify."

`SENDER_EMAIL` carries forward the address the Worker used
(`worker/wrangler.toml`). **It must be an address on the domain Brevo verifies in
§7** — a mismatch means Brevo rejects the send, and a magic-link email that never
arrives is an R3 gate that never opens.

```bash
az functionapp config appsettings set -n "$APP" -g "$RG" --settings \
  SENDER_EMAIL="clearance@doziertechgroup.com" \
  SENDER_NAME="CONSENT ARCHAEOLOGY" \
  -o none
```

(`SENDER_NAME` is the one genuinely optional setting; the code falls back to
`CONSENT ARCHAEOLOGY` if unset.)

### 4b. The two generated secrets

Generate fresh, 32 bytes each, and **put a copy in the password manager before you
move on.**

```bash
PII_ENCRYPTION_KEY=$(openssl rand -base64 32)
PII_HASH_SALT=$(openssl rand -base64 32)

echo "SAVE THESE IN THE PASSWORD MANAGER NOW:"
echo "  PII_ENCRYPTION_KEY=$PII_ENCRYPTION_KEY"
echo "  PII_HASH_SALT=$PII_HASH_SALT"

az functionapp config appsettings set -n "$APP" -g "$RG" --settings \
  PII_ENCRYPTION_KEY="$PII_ENCRYPTION_KEY" \
  PII_HASH_SALT="$PII_HASH_SALT" \
  -o none
```

**Losing `PII_ENCRYPTION_KEY` makes every encrypted PII document in Cosmos permanently
unreadable.** That breaks the export-and-delete-me endpoint, which is an R5
obligation, not a feature. Rotating it has the same effect — there is no re-encrypt
path. Treat it as write-once.

`PII_HASH_SALT` salts the dedup hashes. Changing it doesn't destroy data, but every
existing subject stops matching itself, so returning users silently become new
subjects. Also write-once in practice.

### 4c. The two secrets Grant pastes himself

These are **not** generated and **not** in Azure yet. Nobody but Grant can produce
them, and they must never be echoed into a terminal transcript, an issue, or a chat.

| Setting | Where to get it | Required? |
|---|---|---|
| `BREVO_API_KEY` | Brevo dashboard → **SMTP & API → API keys** → generate a key scoped to transactional email | **Yes** — no email, no session, no R3 gate |
| `FIRECRAWL_API_KEY` | Firecrawl dashboard → **API Keys** | No, but a sweep without it finds nothing and says so |

Set each one on its own so a shell-history line never contains both:

```bash
az functionapp config appsettings set -n "$APP" -g "$RG" \
  --settings BREVO_API_KEY='<paste from Brevo>' -o none

az functionapp config appsettings set -n "$APP" -g "$RG" \
  --settings FIRECRAWL_API_KEY='<paste from Firecrawl>' -o none
```

### 4d. Verify all ten are present

Names only — this deliberately does not print values:

```bash
az functionapp config appsettings list -n "$APP" -g "$RG" \
  --query "[?contains(['COSMOS_ENDPOINT','COSMOS_KEY','COSMOS_DB','PII_ENCRYPTION_KEY','PII_HASH_SALT','BREVO_API_KEY','FIRECRAWL_API_KEY','ALLOWED_ORIGIN','PUBLIC_APP_URL','SENDER_EMAIL'], name)].name" -o tsv \
  | sort
```

Expected: ten lines — the nine `REQUIRED` in `api/src/lib/config.js` plus
`FIRECRAWL_API_KEY`. Missing one of the nine means the app refuses to start, which is
correct behaviour and a bad surprise to discover from a user.

---

## 5. CORS

The Function App is on `azurewebsites.net` and the frontend is on
`dig.doziertechgroup.com`, so this is a genuine cross-origin setup and CORS is
load-bearing, not paperwork.

```bash
az functionapp cors add -n "$APP" -g "$RG" --allowed-origins "$ORIGIN" -o none

# Azure seeds the portal's own origin. Drop it — nothing calls this API from the portal.
az functionapp cors remove -n "$APP" -g "$RG" --allowed-origins https://portal.azure.com -o none 2>/dev/null || true

az functionapp cors show -n "$APP" -g "$RG" -o json
```

Do **not** add `*`. A wildcard on an API that returns dossier data behind a bearer
token is an own-goal.

For local development, `api/local.settings.json` carries its own `Host.CORS` value
(see `api/local.settings.json.example`) — that is separate and does not affect Azure.

> **Check this with curl, don't assume it.** Azure's platform CORS layer adds
> `Access-Control-Allow-Origin` itself. If the function code *also* emits that
> header, the browser sees two and rejects the response — a failure that looks like
> "CORS is broken" while both layers report themselves as configured correctly:
>
> ```bash
> curl -sI -H "Origin: $ORIGIN" "https://$APP.azurewebsites.net/api/stats" \
>   | grep -i access-control-allow-origin
> ```
>
> Exactly one line. If you get two, remove the header from one layer — keep the
> platform one and drop it from the code, or the reverse, but not both.

---

## 6. Deploy the API

### Normal path — GitHub Actions

`.github/workflows/deploy-api.yml` deploys `api/` on every push to `main` that
touches `api/**`. It needs one repository secret,
`AZURE_FUNCTIONAPP_PUBLISH_PROFILE`. The full instructions for producing it are in
the header comment of that workflow file; the short version:

```bash
# 1. New Function Apps ship with basic SCM auth disabled — turn it on first
az resource update -g "$RG" \
  --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies \
  --name scm --parent "sites/$APP" --set properties.allow=true -o none

# 2. Print the profile (secrets to stdout — do not paste this anywhere but GitHub)
az functionapp deployment list-publishing-profiles -n "$APP" -g "$RG" --xml
```

Then GitHub → Settings → **Secrets and variables → Actions → New repository secret**:
name `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`, value the entire `<publishData>…</publishData>`
XML.

The workflow regenerates the legal templates and fails if the committed artifact has
drifted from `legal/`, installs production dependencies, publishes, and then curls
`/api/stats` — because "the zip uploaded" and "the API works" are different claims
and only the second one is worth reporting.

### Manual path — when you need to push from a laptop

```bash
node api/scripts/build-templates.mjs      # legal/ is the source of truth; regenerate first
cd api
npm install
func azure functionapp publish "$APP"
```

Then confirm it is actually serving:

```bash
curl -s "https://$APP.azurewebsites.net/api/stats"
```

Logs:

```bash
az functionapp log tail -n "$APP" -g "$RG"
# or: portal → the Function App → Log stream / Application Insights → Logs
```

---

## 7. Brevo — sender domain verification

The R3 magic-link email comes from Brevo (300/day free tier). Brevo must verify the
sender domain, via DNS records that — say it with me — **go in the Cloudflare
dashboard** (§0a):

1. Brevo dashboard → **Senders, Domains & Dedicated IPs → Domains** → add
   `doziertechgroup.com`.
2. Brevo shows a set of DNS records: a `brevo-code` TXT verification record, DKIM
   records (`mail._domainkey.*` etc.), and a DMARC TXT if not present.
3. Add each in Cloudflare exactly as shown (TXT/CNAME records aren't proxied, so
   there's no orange/grey decision to get wrong).
4. Back in Brevo, click **Verify & Authenticate**. Propagation is usually minutes.
5. Send a test magic-link email from the deployed API and confirm it lands in an
   inbox, not spam.

## 8. Stripe — Payment Link with Apple Pay

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

## 9. Venmo

The donation panel deep-links `venmo://paycharge?txn=pay&recipients=<HANDLE>&note=...`
with an `https://venmo.com/<HANDLE>` desktop fallback.

**`TODO(deploy): Grant's Venmo handle`** — replace the placeholder in the donation UI
(search the repo for `TODO(deploy)`) before launch. Until it's replaced, the Venmo
button points at a placeholder, which violates the never-fake-success rule — so it
must not ship that way.

---

## 10. Pre-launch checklist

Run every line. The first two are Hard Rules — if either fails, **do not launch**,
no matter how good the terminal looks.

- [ ] **R1 — the no-SSN rule holds in reality, not just in copy.**
      `grep -ri "ssn\|social.security" docs/ api/src/` returns *only* the
      `[FIELD REMOVED ON ADVICE OF COUNSEL]` joke, its credit-freeze pointer, and the
      rejection logic in `api/src/routes/intake.js` — no input, no document field, no
      request field, nothing parked in a comment.
- [ ] **R3 — the identity-verification gate actually gates.** With no verified
      session, call the sweep endpoint directly and confirm it is **refused**:

      ```bash
      curl -i -X POST https://func-consent-archaeology.azurewebsites.net/api/sweep
      curl -i -X POST https://func-consent-archaeology.azurewebsites.net/api/sweep \
        -H 'authorization: Bearer definitely-not-a-real-token'
      ```

      Both must come back **401**, with no dossier data in either body. Then complete
      a real magic-link round-trip and confirm the sweep runs only for the verified
      email's identity. The gate must hold at the API, not just in the UI — the UI is
      a suggestion and the API is the product.
- [ ] Magic-link email arrives (real inbox, not spam) and the link verifies.
- [ ] **R2 sweep:** `grep -riE "destroy|erase|wipe|nuke|scrub|purge|guaranteed removal" docs/`
      finds nothing in user-facing copy (the R5 auto-purge of *our own* stored PII is
      internal and fine; user-facing verbs are demand/compel/request/file/document/
      track/escalate).
- [ ] Progress bars track real fetch state — throttle the network in devtools and
      watch them slow down. If they don't, they're fiction, which is banned.
- [ ] `/api/stats` returns aggregate counts only — no names, no cities.
- [ ] No PII appears in logs. Run a full test flow, then check **both** the live
      stream (`az functionapp log tail -n func-consent-archaeology -g rg-consent-archaeology`)
      **and** Application Insights → Logs (`traces | order by timestamp desc`), which
      is where anything logged actually persists for 90 days.
- [ ] Export-and-delete-me endpoint works on a test subject, and the purged subject's
      `piiCiphertext` really is null in Cosmos (Data Explorer, or a query) — not just
      hidden by the API.
- [ ] `sessions` TTL works: write a session, wait past its expiry, confirm `get()`
      returns null. Cosmos TTL sweeping is eventually consistent, so this is testing
      the explicit `expiresAt` check in `lib/sessions.js`, which is the part that
      makes an expired magic link actually dead.
- [ ] Donation panel appears only **after** the dossier, and dismissing it persists
      (localStorage + server flag — reload, different device, still gone).
- [ ] Stripe test payment completes and lands on
      `https://doziertechgroup.com/dig/thanks`; Apple Pay sheet appears on Safari.
- [ ] Venmo handle placeholder replaced; deep link opens Venmo, fallback URL works.
- [ ] `git grep -iE "api[_-]?key|secret" -- ':!*.md'` shows no live values.
      `api/local.settings.json` is **not** tracked (`git ls-files api/ | grep local.settings`
      must print only the `.example`).
- [ ] All ten App Settings present (§4d), and the app starts — a missing required one
      is supposed to be a loud startup failure, so an app that starts is itself a check.
- [ ] `SENDER_EMAIL` matches the sender address Brevo actually verified in §7.
- [ ] Exactly one `Access-Control-Allow-Origin` header on a cross-origin response (§5).
- [ ] `dig.doziertechgroup.com` loads over HTTPS, cert valid, both panels render,
      `prefers-reduced-motion` kills the flicker.
- [ ] All `TODO(deploy)` markers in shipping code resolved:
      `git grep -n "TODO(deploy)" -- docs/ api/` returns nothing. (The runbooks and
      DESIGN.md *discuss* the markers; scope the grep to what actually ships, or the
      check can never pass and stops being read.)

Launch.
