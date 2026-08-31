# Railway Deployment Guide: Marketplace, Wattanam Core, and Customer Schools

Concrete, CLI-driven steps for standing up the two deployable backends on Railway — the
**marketplace** (one shared deployment) and **Wattanam Core** (one deployment per customer
school). Written from a real, live deployment of both (2026-08-31); every command below was
actually run against a real Railway account. For the *application-level* first-run setup wizard
(school name, owner account) once Wattanam Core is running, see
[first-run-installation.md](./first-run-installation.md) — this guide stops at "the app is live and
reachable," that document picks up from there.

Prefer clicking through Railway's dashboard yourself instead of running commands? See
[railway-manual-setup-guide.md](./railway-manual-setup-guide.md) — same deployments, dashboard
steps instead of CLI commands.

## Prerequisites

- Railway CLI installed and logged in (`railway login`).
- **A Railway account with billing configured.** Trial/unclaimed projects auto-delete within
  hours (observed: as little as ~3 hours after creation). `railway list --json` shows a
  `deletedAt` timestamp on any such project — if you see one, don't build on it; create a fresh
  project once billing is attached.
- This repository checked out locally with a clean working tree. `railway up` deploys your local
  files (respecting `.gitignore`), not the pushed GitHub state, so make sure you're deploying what
  you think you're deploying.
- The Bash tool session run from the repository root.

## Part 1 — Deploying the Marketplace

One project, shared by every school: `Postgres` + `marketplace-api`.

### 1. Create the project and services

```bash
railway init --name "Wattanam Marketplace"
railway add --database postgres
railway add --service marketplace-api
```

### 2. Generate secrets

`marketplace-api`'s config (`apps/marketplace-api/src/config.ts`) requires several production
secrets with no defaults. Generate them with real crypto, not placeholders — except
`SENDGRID_API_KEY`/`TRANSACTIONAL_EMAIL_FROM`, which genuinely need a real SendGrid account (see
step 4).

```js
// Run with: node gen-secrets.js
const { generateKeyPairSync, randomBytes } = require('crypto');

function toEnvLine(pemBuffer) {
  // Railway (and this app's config reader) expect PEM keys as a single-line env var with
  // literal "\n" sequences, not real newlines.
  return pemBuffer.toString('utf8').trim().split(/\r\n|\r|\n/).join('\\n');
}

const metadata = generateKeyPairSync('ed25519');
const entitlement = generateKeyPairSync('ed25519'); // must be a DIFFERENT key from metadata

console.log('METADATA_SIGNING_PRIVATE_KEY=' + toEnvLine(metadata.privateKey.export({ type: 'pkcs8', format: 'pem' })));
console.log('ENTITLEMENT_SIGNING_PRIVATE_KEY=' + toEnvLine(entitlement.privateKey.export({ type: 'pkcs8', format: 'pem' })));
console.log('IDENTITY_ENCRYPTION_KEY=' + randomBytes(32).toString('base64'));
console.log('MARKETPLACE_ADMIN_TOKEN=' + randomBytes(36).toString('base64url'));
console.log('PAYMENT_WEBHOOK_SECRET=' + randomBytes(36).toString('base64url'));
```

**Do not** build these strings through a shell one-liner with nested `node -e "..."` calls —
bash's own double-quote backslash handling silently corrupts `\n`-escaped PEM values (confirmed
the hard way). Write a real `.js` file and run it with `node file.js`.

### 3. Generate the public domain first

`PUBLIC_BASE_URL` is self-referential (the app needs to know its own public URL), so generate the
domain before setting variables that depend on it:

```bash
railway domain --service marketplace-api --port 3010
# -> https://<generated>.up.railway.app
```

### 4. Set environment variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway variable reference, resolved automatically |
| `PUBLIC_BASE_URL` | the domain from step 3 | e.g. `https://marketplace-api-production-xxxx.up.railway.app` |
| `MARKETPLACE_ADMIN_TOKEN` | generated | |
| `METADATA_SIGNING_PRIVATE_KEY` | generated | |
| `METADATA_SIGNING_KEY_ID` | any id, e.g. `metadata-2026-08-31` | |
| `ENTITLEMENT_SIGNING_PRIVATE_KEY` | generated | must differ from the metadata key |
| `ENTITLEMENT_SIGNING_KEY_ID` | any id, distinct from the metadata key id | |
| `PAYMENT_WEBHOOK_SECRET` | generated | |
| `ARTIFACT_STORAGE_PATH` | `/data/artifacts` | requires the volume in step 5 |
| `IDENTITY_ENCRYPTION_KEYS_JSON` | `{"<key-id>":"<32-byte-base64-key>"}` | |
| `IDENTITY_ENCRYPTION_ACTIVE_KEY_ID` | the key id used above | |
| `TRANSACTIONAL_EMAIL_PROVIDER` | `sendgrid` | required non-`disabled` in production |
| `SENDGRID_API_KEY` | real key, or a shape-valid placeholder (≥20 chars) to defer | placeholder boots the app; email sending will fail until replaced |
| `TRANSACTIONAL_EMAIL_FROM` | real verified sender, or a placeholder valid-looking email | same caveat |

Set each with `railway variable set KEY --stdin --service marketplace-api --skip-deploys`,
piping the value via stdin — this avoids all shell-escaping risk for the PEM keys and JSON blobs.
Add `--skip-deploys` while batching many variables, then let the final one (or an explicit
`railway up`) trigger the actual deploy.

### 5. Attach a persistent volume

Without a volume, `/data/artifacts` is ephemeral — every redeploy silently loses every uploaded
plugin package.

```bash
railway service link marketplace-api   # required first, or `volume add` panics
MSYS_NO_PATHCONV=1 railway volume add --mount-path /data/artifacts
```

`MSYS_NO_PATHCONV=1` is required on Git Bash / MSYS — without it, Git Bash rewrites the
`/data/artifacts` argument into a Windows path before the Railway binary sees it, and it errors
with "Mount path must start with `/`" even though it visibly does.

### 6. Deploy

```bash
railway up --service marketplace-api
```

**Known issue:** `apps/marketplace-api/Dockerfile` and `apps/marketplace-api/railway.json` are
written assuming the build context is the **repository root** (its `COPY` lines are prefixed
`apps/marketplace-api/...`, and `dockerfilePath` is the full repo-root-relative path). The Railway
CLI has no flag to tell a specific service "use this non-default `railway.json`" — a plain
`railway up` picks up whichever `railway.json` sits at the top of what you uploaded, which for a
repo-root upload is the **backend's** root `railway.json`, not the marketplace's. The build will
succeed but deploy the wrong app (visible as a crash on a backend-specific env var check, e.g.
`CORS_ORIGINS is required in production`).

**Fix (CLI, no dashboard step needed):** set Railway's built-in `RAILWAY_DOCKERFILE_PATH` variable
on the service, then deploy from the repo root:

```bash
echo -n "apps/marketplace-api/Dockerfile" \
  | railway variable set RAILWAY_DOCKERFILE_PATH --stdin --service marketplace-api --skip-deploys
railway up --service marketplace-api      # run from the REPOSITORY ROOT
```

Verified working: the resulting deployment reports
`dockerfilePath: apps/marketplace-api/Dockerfile` and serves the real marketplace. The equivalent
dashboard route (Settings → Build → Dockerfile Path) also works if you prefer clicking.

### 7. Verify

```bash
curl https://<marketplace-domain>/health/live    # {"status":"alive"}
curl https://<marketplace-domain>/health/ready    # {"status":"ready", ...}
```

## Part 2 — Deploying a Customer School (Wattanam Core)

One project **per school**: `Postgres` + `api` (backend) + `web` (frontend) + `gateway` (Caddy,
the single public entry point). Only `gateway` gets a public domain; `api` and `web` stay on
Railway's private network and are reached at `api.railway.internal:<port>` /
`web.railway.internal:<port>`.

### 1. Create the project and services

```bash
railway init --name "Wattanam - <School Name>"
railway add --database postgres
railway add --service api
railway add --service web
railway add --service gateway
```

### 2. Generate the gateway's public domain

```bash
railway domain --service gateway --port 8080
# -> https://<generated>.up.railway.app
```

### 3. Derive the marketplace's public key (to trust update/plugin signatures)

The school needs the marketplace's **repository signing public key** pinned via
`UPDATE_REPOSITORY_PUBLIC_KEY`. If you generated the marketplace's keys yourself in Part 1, derive
the public half locally instead of an extra round-trip:

```js
const { createPrivateKey, createPublicKey } = require('crypto');
const publicPem = createPublicKey(createPrivateKey(metadataPrivateKeyPem))
  .export({ type: 'spki', format: 'pem' }).toString();
```

Otherwise fetch it live from the already-deployed marketplace: `GET /v1/repository-key`.

### 4. Set environment variables

**`api` service:**

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | |
| `JWT_SECRET` | generated, ≥32 chars | |
| `CORS_ORIGINS` | the gateway's public domain (step 2) | **required** in production — the app refuses to boot without it |
| `PORT` | `3001` | **set this explicitly** — see the PORT gotcha below |
| `BACKUP_DIR` | `/data/backups` | requires the volume in step 6 |
| `PLUGIN_DIR` | `/data/plugins` | |
| `PLUGIN_DATA_DIR` | `/data/plugin-data` | |
| `APP_VERSION` | e.g. `1.0.0` | used for plugin/core compatibility checks |
| `MARKETPLACE_URL` | the marketplace's public domain (Part 1, step 3) | links this school to the marketplace's update/catalog APIs |
| `UPDATE_REPOSITORY_KEY_ID` | the marketplace's metadata signing key id | |
| `UPDATE_REPOSITORY_PUBLIC_KEY` | derived/fetched in step 3, `\n`-escaped | |
| `INSTALLATION_KEY_DIR` | `/data/marketplace-identity` | where this installation's own Ed25519 identity key persists |

**`web` service:**

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | must match `gateway`'s `WEB_UPSTREAM` |
| `API_URL` | `http://api.railway.internal:3001` | internal, server-side proxy target — must match `api`'s `PORT` |
| `MARKETPLACE_URL` | the marketplace's public domain | for the customer-portal proxy route |

**`gateway` service:**

| Variable | Value | Notes |
|---|---|---|
| `API_UPSTREAM` | `api.railway.internal:3001` | must match `api`'s actual `PORT` |
| `WEB_UPSTREAM` | `web.railway.internal:3000` | must match `web`'s actual `PORT` |

### 5. The PORT-mismatch gotcha

Railway auto-assigns a `PORT` env var to every service by default (observed: `8080`), regardless
of what the app's own Dockerfile `EXPOSE`s. The gateway's `Caddyfile` hardcodes its upstreams'
ports (`api:3001`, `web:3000`) — if you don't **explicitly** set `PORT=3001` on `api` and
`PORT=3000` on `web`, Railway's auto-assigned port won't match what the gateway tries to reach,
and the gateway will get connection failures even though `api`/`web` individually report healthy.
Always set `PORT` explicitly on both and confirm via `railway logs --service api` that it logs the
port you expect.

### 6. Attach a persistent volume to `api`

```bash
railway service link api
MSYS_NO_PATHCONV=1 railway volume add --mount-path /data
```

One volume at `/data` covers `backups`, `plugins`, and `plugin-data` — all three directories the
root `Dockerfile` already creates under it.

### 7. Deploy

Unlike the marketplace, **none of these three services need a dashboard fix** — `backend/Dockerfile`
and `frontend/Dockerfile` are each self-contained (their `COPY` paths are relative to their own
directory), and the repository's root `Dockerfile`/`railway.json` happen to already build the
backend correctly:

```bash
# api: the repo-root default Dockerfile IS the backend's Dockerfile — plain `up` works
railway up --service api

# web and gateway: self-contained Dockerfiles deploy correctly via --path-as-root,
# which uploads the given directory's own contents as the effective build root
railway up frontend --path-as-root --service web
railway up infrastructure/gateway --path-as-root --service gateway
```

### 8. Verify end-to-end through the public gateway

```bash
curl https://<gateway-domain>/gateway-health          # "ok"
curl https://<gateway-domain>/api/version              # real backend version JSON
curl -o /dev/null -w "%{http_code}\n" https://<gateway-domain>/login   # 200
```

If `/api/version` doesn't respond, re-check the PORT gotcha in step 5 before anything else.

### 9. Run the first-run setup

Once the gateway responds, follow [first-run-installation.md](./first-run-installation.md) to
create the school's identity and first `SUPER_ADMIN` — either through the browser setup wizard at
the gateway's public URL, or via `POST /api/installation/install` (through the gateway) with the
same JSON body documented there. Check `GET /api/installation/status` first: if it already reports
`"installed"`, someone has already completed this step — do not re-run it.

## Part 3 — Linking the School to the Marketplace

Once both are live, link the school's own admin panel to a marketplace account so it can browse,
buy, and install plugins directly (the SSO federation flow — see
`docs/platform-master-execution-plan.md` for the underlying design):

1. Sign in to the school's `/admin/plugins` as `SUPER_ADMIN`.
2. Click **Link marketplace account** — this opens the marketplace's consent page in a new tab.
3. Sign in (or register) on the marketplace side and approve the link request.
4. The admin panel polls automatically and shows **Linked as `<email>`** once approved.

This requires the school's `api` to already have `MARKETPLACE_URL` and
`UPDATE_REPOSITORY_PUBLIC_KEY` set correctly (Part 2, step 4) — without those, linking fails with
"Marketplace integration is not configured."

## Troubleshooting Reference

Issues hit and resolved during a real deployment, kept here so the next person doesn't rediscover
them from scratch:

| Symptom | Cause | Fix |
|---|---|---|
| `Mount path must start with a /` on `railway volume add`, even though it clearly does | Git Bash/MSYS rewrites `/data/...`-style arguments into Windows paths before native `.exe` tools see them | Prefix the command with `MSYS_NO_PATHCONV=1` |
| `thread 'main' panicked ... Option::unwrap() on a None value` on `railway volume add` | The target service isn't explicitly linked in the CLI's local context | Run `railway service link <service>` first, then retry without `--service` |
| A service deploys and builds successfully but crashes with an error clearly belonging to a *different* app (e.g. a backend-only env var check failing on what should be the marketplace) | `railway up` from the repo root picked up the **wrong** `railway.json`/`Dockerfile` — Railway uses whatever config sits at the top of what was uploaded, not something tied to the `--service` you named | For a self-contained Dockerfile (own directory, no repo-root-relative `COPY`s), redeploy with `railway up <directory> --path-as-root --service <name>`. For a Dockerfile that genuinely needs repo-root context (its `COPY`s are prefixed with the subdirectory), there is currently no CLI fix — set the Dockerfile/config path once via the dashboard |
| A service is healthy on its own but a sibling service (e.g. the gateway) can't reach it | Railway auto-assigned a `PORT` that doesn't match what the sibling's config hardcodes as the upstream port | Explicitly set `PORT` on the service to the value its siblings expect, and confirm via `railway logs` that it actually bound to that port |
| A Next.js app works perfectly on localhost, but every POST from a real browser fails with a cross-origin/CSRF rejection once deployed | An origin check comparing the browser's `Origin` header against `request.nextUrl.origin`. Behind any TLS-terminating proxy (Railway included) `nextUrl.origin` is the *internal* listener (`http://localhost:3020`), never the public URL, so no legitimate request can match. Curl without an `Origin` header passes, which makes this easy to miss | Compare against the forwarded headers instead: build the expected origin from `x-forwarded-proto` + `x-forwarded-host` (falling back to `host`), keeping `nextUrl.origin` only as the local/direct-run fallback |
| `railway link -p <name>` or `--project <name>` fails with "not found", even though `railway list` shows that exact name | The project is a trial project whose `deletedAt` is already populated (even if the timestamp is nominally in the future) — it's effectively inaccessible already | Check `railway list --json` for `deletedAt`; if set, treat the project as gone and create a fresh one (with billing attached, so it doesn't happen again) |
| `railway connect Postgres` (piped, non-interactive) fails with "Connection URL should point to the Railway TCP proxy" | The Postgres service's internal `DATABASE_URL` isn't reachable from outside Railway's network by default | Not resolved in this guide — either enable the Postgres service's TCP proxy in the dashboard, or run queries from inside a Railway-hosted process instead of your local machine |
| A generated PEM/JSON secret value silently loses its `\n` escaping or gets double-escaped | Piping values through nested `node -e "..."` shell commands — bash's own quote/backslash handling collides with JS string escaping in ways that are very easy to get wrong | Write real `.js` script files (via a heredoc or the Write tool) and run them with `node file.js`; verify the output by reading the file directly, not by re-parsing it through another shell command |
