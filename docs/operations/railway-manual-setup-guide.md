# Manual Railway Setup Guide (Dashboard Walkthrough)

A click-by-click guide for deploying Wattanam V2's two deployment types — the optional shared
**Marketplace** and one isolated **Wattanam Core school project per customer** — entirely through
the Railway web dashboard at [railway.app](https://railway.app). No Railway CLI is required.

Verified against the repository configuration on 2026-08-31: the marketplace Dockerfile,
school API/web/gateway Dockerfiles, Caddy routes, production configuration validators, Prisma
migration startup commands, persistent paths, installation API, and marketplace-link workflow.

If you'd rather script the whole thing from a terminal instead of clicking through a dashboard,
see [railway-deployment-guide.md](./railway-deployment-guide.md) — same end result, CLI commands
instead of dashboard steps.

## What you're building

```
Wattanam Marketplace (one project, shared by every school)
├── Postgres
└── marketplace-api      <- the only public service

Wattanam Core / Customer School (one project PER school)
├── Postgres
├── api                  <- backend, private (no public domain)
├── web                  <- frontend, private (no public domain)
└── gateway              <- Caddy reverse proxy, the ONLY public service
```

The gateway is the single front door: `/api/*` and websocket traffic go to `api`, everything else
goes to `web`. Nobody talks to `api`/`web` directly from the internet.

## Before you start

1. A [railway.app](https://railway.app) account with an active plan suitable for persistent
   production services. Confirm the project is not an expiring trial before onboarding a school;
   the reference deployment observed trial projects becoming unavailable after expiry.
2. This repository pushed to a GitHub repository your Railway account can access (Railway deploys
   from a connected GitHub repo — you'll authorize this in Step 1 below).
3. Node.js installed on your own machine, just to generate a few secrets (Step 2). You won't need
   it after that.

---

## Part 1 — Deploy the Marketplace

### Step 1: Create the project

1. Railway dashboard → **New Project** → **Empty Project**.
2. Rename the empty project to **Wattanam Marketplace** from the project settings/name menu.
3. On the empty project canvas, click **+ New** → **GitHub Repo**.
4. If this is your first GitHub deployment, authorize Railway's GitHub App for the Wattanam V2
   repository. Prefer granting access only to this repository.
5. Select the Wattanam V2 repository and name the new service `marketplace-api`.

Creating an **Empty Project** first is intentional. It prevents Railway from creating an
ambiguously named default service with repo-root build settings before you choose the correct
Dockerfile.

### Step 2: Generate secrets on your own machine

Save this as `gen-marketplace-secrets.js` anywhere on your computer and run `node
gen-marketplace-secrets.js`:

```js
const { generateKeyPairSync, randomBytes } = require('crypto');

function toEnvLine(pemBuffer) {
  // Railway env vars are single-line; PEM keys need their real newlines
  // turned into the literal two-character sequence \n.
  return pemBuffer.toString('utf8').trim().split(/\r\n|\r|\n/).join('\\n');
}

const metadata = generateKeyPairSync('ed25519');
const entitlement = generateKeyPairSync('ed25519'); // must differ from metadata's key

console.log('METADATA_SIGNING_PRIVATE_KEY=' + toEnvLine(metadata.privateKey.export({ type: 'pkcs8', format: 'pem' })));
console.log('METADATA_SIGNING_KEY_ID=metadata-' + new Date().toISOString().slice(0, 10));
console.log('ENTITLEMENT_SIGNING_PRIVATE_KEY=' + toEnvLine(entitlement.privateKey.export({ type: 'pkcs8', format: 'pem' })));
console.log('ENTITLEMENT_SIGNING_KEY_ID=entitlement-' + new Date().toISOString().slice(0, 10));
console.log('IDENTITY_ENCRYPTION_ACTIVE_KEY_ID=identity-' + new Date().toISOString().slice(0, 10));
console.log('IDENTITY_ENCRYPTION_KEYS_JSON={"identity-' + new Date().toISOString().slice(0, 10) + '":"' + randomBytes(32).toString('base64') + '"}');
console.log('MARKETPLACE_ADMIN_TOKEN=' + randomBytes(36).toString('base64url'));
console.log('PAYMENT_WEBHOOK_SECRET=' + randomBytes(36).toString('base64url'));
```

Copy its output somewhere safe (a password manager, not a chat window) — you'll paste these into
Railway in Step 5. **Keep this terminal output private**; anyone with these values can impersonate
your marketplace's signing authority.

### Step 3: Configure the marketplace-api service

1. Click the `marketplace-api` service created in Step 1 → **Settings**.
2. Under **Source**:
   - **Root Directory**: leave **blank** (repository root).
3. Under **Build**:
   - **Builder**: Dockerfile.
   - **Dockerfile Path**: `apps/marketplace-api/Dockerfile`
   
   This exact combination matters — `apps/marketplace-api/Dockerfile` expects to be built *from
   the repo root* (its `COPY` lines are written as `apps/marketplace-api/...`), so Root Directory
   must stay blank while Dockerfile Path points explicitly at the nested file.

### Step 4: Add Postgres

1. In the project canvas, **+ New** → **Database** → **Add PostgreSQL**.
2. Nothing else to configure — Railway provisions it immediately.

### Step 5: Set environment variables

Click the `marketplace-api` service → **Variables** tab → **Raw Editor**, and paste (filling in
the secrets from Step 2, and leaving `PUBLIC_BASE_URL` for last):

```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
MARKETPLACE_ADMIN_TOKEN=<from step 2>
METADATA_SIGNING_PRIVATE_KEY=<from step 2>
METADATA_SIGNING_KEY_ID=<from step 2>
ENTITLEMENT_SIGNING_PRIVATE_KEY=<from step 2>
ENTITLEMENT_SIGNING_KEY_ID=<from step 2>
PAYMENT_WEBHOOK_SECRET=<from step 2>
ARTIFACT_STORAGE_PATH=/data/artifacts
IDENTITY_ENCRYPTION_KEYS_JSON=<from step 2>
IDENTITY_ENCRYPTION_ACTIVE_KEY_ID=<from step 2>
TRANSACTIONAL_EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<your real SendGrid API key>
TRANSACTIONAL_EMAIL_FROM=<your real verified sender email>
```

Use a real SendGrid API key and a verified sender. Production marketplace configuration requires
transactional email because account verification and password recovery depend on it. Do not use a
shape-valid fake credential for an environment described as production-ready; if email is not
available yet, treat the deployment as an infrastructure preview and do not onboard users.

### Step 6: Add a persistent volume

Uploaded plugin packages live on disk — without a volume, they vanish on every redeploy.

1. `marketplace-api` service → **Settings** → **Volumes** → **+ New Volume**.
2. **Mount path**: `/data/artifacts`

### Step 7: Generate a public domain

1. `marketplace-api` service → **Settings** → **Networking** → **Generate Domain**.
2. Set the target port to `3010`.
3. Copy the generated URL (e.g. `https://marketplace-api-production-xxxx.up.railway.app`).
4. Go back to **Variables**, edit `PUBLIC_BASE_URL`, and set it to that exact URL (no trailing
   slash) — add it if you skipped it in Step 5.

### Step 8: Deploy and verify

Railway deploys automatically whenever variables or settings change. Watch the **Deployments**
tab until it shows **Success**, then confirm from your own machine:

```bash
curl https://<your-marketplace-domain>/health/live
# {"status":"alive"}
curl https://<your-marketplace-domain>/health/ready
# {"status":"ready","service":"wattanam-marketplace-api","version":"0.1.0"}
```

If the deploy fails or crashes, open the **Deployments → View Logs** tab — a crash mentioning
something clearly unrelated to the marketplace (e.g. `CORS_ORIGINS`) means Step 3's Root
Directory/Dockerfile Path wasn't saved correctly; re-check it.

---

## Part 2 — Deploy a Customer School (Wattanam Core)

Repeat this whole part for **each school** — it's a separate Railway project every time.

### Step 1: Create the project

1. Railway dashboard → **New Project** → **Empty Project**.
2. Rename it to **Wattanam - `<School Name>` - Production**.
3. Do not deploy the repository from the New Project dialog. Add the three application services
   separately in the next step so each receives the correct root directory and Dockerfile.

### Step 2: Add three services from the same repo

From the empty project canvas, repeat **+ New** → **GitHub Repo** → select the Wattanam V2
repository three times:

1. Name the first service `api`.
2. Name the second service `web`.
3. Name the third service `gateway`.

Do not let all three deploy with the repository-root defaults. Configure their source/build
settings in Step 3 before treating any initial deployment as valid. If Railway stages or starts an
automatic deployment immediately, finish Step 3 and redeploy each service afterward.

### Step 3: Configure each service's build settings

**`api`:**
- Settings → Source → **Root Directory**: `backend`
- Settings → Build → **Dockerfile Path**: `Dockerfile` (default — leave as-is)

**`web`:**
- Settings → Source → **Root Directory**: `frontend`
- Settings → Build → **Dockerfile Path**: `Dockerfile` (default)

**`gateway`:**
- Settings → Source → **Root Directory**: `infrastructure/gateway`
- Settings → Build → **Dockerfile Path**: `Dockerfile` (default)

Unlike the marketplace, these three Dockerfiles are self-contained — Root Directory alone is
enough, no separate Dockerfile Path override needed.

### Step 4: Add Postgres

Same as Part 1, Step 4 — **+ New** → **Database** → **Add PostgreSQL**.

### Step 5: Generate the gateway's public domain

Only `gateway` gets a public domain — `api` and `web` are reached only from inside the project.

1. `gateway` service → Settings → Networking → **Generate Domain**.
2. Target port: `8080`.
3. Copy the URL (e.g. `https://gateway-production-xxxx.up.railway.app`) — this is the school's
   public URL.

### Step 6: Generate the school's own secrets

```js
const { createPrivateKey, createPublicKey, randomBytes } = require('crypto');

// Paste the marketplace's METADATA_SIGNING_PRIVATE_KEY value here (from Part 1, Step 2),
// with its literal \n sequences turned back into real newlines first:
const metadataPrivatePem = `<paste, replacing every \\n with a real line break>`;

const metadataPublicPem = createPublicKey(createPrivateKey(metadataPrivatePem))
  .export({ type: 'spki', format: 'pem' }).toString();

console.log('JWT_SECRET=' + randomBytes(36).toString('base64url'));
console.log('UPDATE_REPOSITORY_PUBLIC_KEY=' + metadataPublicPem.trim().split(/\r\n|\r|\n/).join('\\n'));
```

If you don't have the marketplace's private key handy (e.g. someone else deployed it), fetch the
public key directly instead: `curl https://<marketplace-domain>/v1/repository-key` and take the
`publicKeyPem` value from its JSON response — it's already the right key, just reformat it the
same way (real newlines → literal `\n`).

### Step 7: Set environment variables

**`api` service** → Variables → Raw Editor:

```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<from step 6>
CORS_ORIGINS=<the gateway domain from step 5>
PUBLIC_APP_URL=<the gateway domain from step 5>
COOKIE_SECURE=true
PORT=3001
BACKUP_DIR=/data/backups
PLUGIN_DIR=/data/plugins
PLUGIN_DATA_DIR=/data/plugin-data
APP_VERSION=1.0.0
MARKETPLACE_URL=<the marketplace domain from Part 1, Step 7>
UPDATE_REPOSITORY_KEY_ID=<the marketplace's METADATA_SIGNING_KEY_ID, from Part 1, Step 2>
UPDATE_REPOSITORY_PUBLIC_KEY=<from step 6>
INSTALLATION_KEY_DIR=/data/marketplace-identity
PROCESS_ROLE=combined
SENDGRID_API_KEY=<school SendGrid API key>
SENDGRID_FROM=<school verified sender email>
```

`PUBLIC_APP_URL` must be the exact HTTPS gateway origin with no trailing slash. Core uses it to
generate password-reset links. `SENDGRID_API_KEY` and `SENDGRID_FROM` are optional for boot, but
password recovery and email notifications do not work without them; configure both before users
are onboarded. Marketplace email uses the different variable name `TRANSACTIONAL_EMAIL_FROM`.

**`web` service** → Variables:

```
NODE_ENV=production
PORT=3000
API_URL=http://api.railway.internal:3001
MARKETPLACE_URL=<the marketplace domain from Part 1, Step 7>
```

**`gateway` service** → Variables:

```
API_UPSTREAM=api.railway.internal:3001
WEB_UPSTREAM=web.railway.internal:3000
```

**Setting `PORT` explicitly on `api` and `web` is not optional.** Without it, Railway assigns
each service a random port that won't match what `gateway`'s variables above assume, and the
gateway will fail to reach them even though each service looks healthy on its own.

### Step 8: Add a persistent volume to `api`

1. `api` service → Settings → Volumes → **+ New Volume**.
2. **Mount path**: `/data`

This one volume covers backups, installed plugins, and plugin data — the app creates all three
subdirectories under it automatically.

### Step 9: Deploy and verify

Wait for all three services (plus Postgres) to show **Success** in their Deployments tab, then
from your own machine:

```bash
curl https://<gateway-domain>/gateway-health
# ok
curl https://<gateway-domain>/api/version
# real version JSON — confirms the gateway can reach `api`
curl https://<gateway-domain>/api/health/ready
# ready response — confirms API, database, migrations, and required runtime state
curl https://<gateway-domain>/api/installation/status
# "ready" before setup, "installed" after setup
curl -o /dev/null -w "%{http_code}\n" https://<gateway-domain>/login
# 200 — confirms the gateway can reach `web`
```

If `/api/version` doesn't respond but `/gateway-health` does, re-check Step 7's `PORT` values on
`api`/`gateway` before anything else — this is the single most common mistake.

### Step 10: Run the first-run setup

Open `https://<gateway-domain>` in your browser. If this is a genuinely fresh installation, you'll
land on the setup wizard — enter the school's name, your timezone/locale/currency, and create the
first administrator account. Full field reference:
[first-run-installation.md](./first-run-installation.md).

If you land on a login page instead, someone already completed setup — check
`https://<gateway-domain>/api/installation/status`; if it reports `"installed"`, sign in with the
existing administrator account rather than trying to set up again.

### Step 11: Verify persistence before handoff

1. Confirm the `api` volume is mounted at exactly `/data` and PostgreSQL has its Railway-managed
   volume.
2. Redeploy `api` and confirm `/api/health/ready` returns successfully afterward.
3. Confirm `/api/installation/status` is still `installed` and the owner can sign in.
4. Run the documented recovery-set backup and retain its checksum manifest outside the project.
5. Record the Railway project ID, gateway URL, installed core version, deployment commit, volume
   mount, owner organization, and support contact in the customer handoff record. Never record
   secret values in that document.

---

## Part 3 — Link the School to the Marketplace

Once both are live:

1. Sign in to the school at `https://<gateway-domain>/admin/plugins` as the `SUPER_ADMIN` you just
   created.
2. Click **Link marketplace account**. A new tab opens on the marketplace's consent page.
3. Sign in to (or create) your marketplace customer account in that tab, and approve the request.
4. Switch back to the school's admin tab — it detects the approval automatically and shows
   **Linked as `<your email>`**.

From here the school can browse the marketplace catalog, buy plugins, and install them directly
from `/admin/plugins`, without ever leaving the school's own admin panel.

## Part 4 — Add a customer-owned domain

1. Open the school `gateway` service → **Settings** → **Networking** → **Custom Domain**.
2. Enter the exact hostname, for example `school.example.com`.
3. Add both records Railway displays at the DNS provider: the routing `CNAME` and ownership
   verification `TXT`. Railway will not route the hostname with only the CNAME.
4. Wait for Railway's verified indicator and automatic TLS certificate. DNS propagation can take
   up to 72 hours; do not remove the generated Railway domain during this period.
5. Set API `CORS_ORIGINS` to both trusted origins while transitioning, separated by a comma:
   `https://<generated>.up.railway.app,https://school.example.com`.
6. Set `PUBLIC_APP_URL=https://school.example.com` so new password-reset links use the customer
   domain, then deploy the staged variable changes.
7. Verify `/gateway-health`, `/api/health/ready`, `/api/installation/status`, `/login`, WebSocket
   connectivity, and a real password-reset email through the custom domain.
8. Keep the Railway-generated origin as the rollback path. Use
   [custom-domain-state-machine.md](../deployment/custom-domain-state-machine.md) for the guarded
   activation and rollback procedure.

---

## Quick Reference: Which Root Directory / Dockerfile Path goes where

| Service | Project | Root Directory | Dockerfile Path |
|---|---|---|---|
| `marketplace-api` | Marketplace | *(blank — repo root)* | `apps/marketplace-api/Dockerfile` |
| `api` | Customer School | `backend` | `Dockerfile` (default) |
| `web` | Customer School | `frontend` | `Dockerfile` (default) |
| `gateway` | Customer School | `infrastructure/gateway` | `Dockerfile` (default) |

If a service crashes with an error that clearly belongs to a different app than the one you meant
to deploy, this table is almost always the fix — the Root Directory and Dockerfile Path didn't get
saved as shown above.

## Production handoff checklist

- [ ] Railway billing is active and the project is not an expiring trial.
- [ ] Marketplace and school use different PostgreSQL services and secrets.
- [ ] Only `marketplace-api` (marketplace project) and `gateway` (school project) are public.
- [ ] API, web, and gateway deploy from the intended directory/Dockerfile.
- [ ] PostgreSQL and API artifact/data paths have persistent volumes.
- [ ] Every secret was generated uniquely and stored in a password manager.
- [ ] `CORS_ORIGINS` and `PUBLIC_APP_URL` exactly match the school gateway HTTPS origin.
- [ ] Real verified SendGrid senders deliver marketplace and school recovery email.
- [ ] Gateway, API readiness, installation status, web login, and password reset are verified.
- [ ] Setup is `installed`, the owner can sign in, and a redeploy preserves the installation.
- [ ] Backup and clean restore evidence exists before customer handoff.
- [ ] A custom domain, if used, has valid DNS, HTTPS, CORS, and rollback evidence.

The deployment is not production-complete merely because all services show **Success** in Railway;
the handoff checklist and restore proof are the acceptance boundary.

## Railway documentation checked

The dashboard terminology and platform behavior in this guide were checked on 2026-08-31 against
Railway's official documentation:

- [Services and GitHub sources](https://docs.railway.com/services)
- [Dockerfiles and custom Dockerfile paths](https://docs.railway.com/builds/dockerfiles)
- [Variables, references, and sealed values](https://docs.railway.com/variables)
- [Public, private, and custom domains](https://docs.railway.com/networking/domains/working-with-domains)
- [Persistent volumes and backups](https://docs.railway.com/volumes)

Railway may rename dashboard controls later; when that happens, preserve the architecture and
security invariants in this guide rather than guessing from an outdated label.
