# Wattanam V2 Railway Manual (Dashboard) Deployment Guide

Status: operational runbook
Scope: central marketplace, private platform administration, and isolated customer schools
Companion to: [railway-complete-platform-cli-guide.md](./railway-complete-platform-cli-guide.md)
Validated repository layout: 2026-09-03

This is the same end-to-end deployment as the CLI guide, done entirely through the Railway
dashboard — GitHub-connected services, clicked settings, and pasted variables — so you can deploy
and re-deploy without a terminal. The two guides produce identical infrastructure; pick whichever
you prefer and stay in it, because mixing them mid-project is how services end up with build
settings that disagree with their `railway.json`.

**One step genuinely cannot be done from the dashboard**: creating the first platform operator.
Railway has no shell in the browser, and the platform admin deliberately exposes no signup page.
[Part 3, Step 7](#step-7-create-the-first-platform-operator-the-one-cli-step) gives you the single
command it needs, and explains why it works that way.

## What you're building

Three separate deployment boundaries, in this order:

```text
Wattanam V2 Marketplace                 one shared central project
├── Postgres
└── marketplace-api                     public API, port 3010

Wattanam Platform Admin                 one private operations project
├── Postgres                            its own database, never the marketplace's
├── marketplace-api                     private, port 3010
└── platform-admin-web                  the only public service here, port 3020

Wattanam - <School> - Production        one project PER school
├── Postgres
├── api                                 private, port 3001
├── web                                 private, port 3000
└── gateway                             the only public school service, port 8080
```

Two rules the layout exists to enforce: school records never enter the marketplace database, and
the platform admin never connects to a school's database. Every school gets its own project,
database, secrets, volume, domain, installation identity, and administrator.

## Before you start

1. A [railway.app](https://railway.app) account on a paid plan. Confirm the workspace is **not an
   expiring trial** before onboarding a real school — trial projects have been observed becoming
   unreachable after expiry, and `railway link` then fails with "not found" even though the project
   still appears in listings.
2. This repository pushed to GitHub, on a reviewed commit. Railway deploys from the connected repo
   and redeploys on every push to the branch you select, so treat that branch as production.
3. Node.js on your own machine — only to generate secrets in Step 1 below.
4. A password manager. Every secret in this guide goes there, never into Git, chat, or a screenshot.

Deploy each boundary fully and verify it before starting the next. The platform admin needs nothing
from the marketplace project, but a school needs the marketplace's public key, so the order above
is the order that avoids backtracking.

---

## Part 1 — Deploy the central Marketplace

### Step 1: Generate the marketplace's secrets

Run the generator in
[railway-manual-setup-guide.md § Step 2](./railway-manual-setup-guide.md#step-2-generate-secrets-on-your-own-machine)
on your own machine and keep its output in your password manager. It produces the metadata and
entitlement signing keys (which must differ from each other), the identity encryption keyring, the
admin token, and the payment webhook secret.

Generate a **fresh set for every environment**. Staging must never share production's signing keys.

### Step 2: Create the project and service

1. Railway dashboard → **New Project** → **Empty Project**.
2. Rename it to **Wattanam V2 Marketplace**.
3. On the canvas: **+ New** → **GitHub Repo** → authorize Railway's GitHub App for this repository
   if prompted, then select it and name the service `marketplace-api`.

Start from an *empty* project deliberately. Deploying the repo straight from the New Project dialog
creates a service with repo-root build defaults, which builds the **school backend** instead — the
single most common failure in this whole process.

### Step 3: Point the service at the right Dockerfile

`marketplace-api` → **Settings**:

- **Source → Root Directory**: leave **blank** (repository root).
- **Build → Builder**: `Dockerfile`.
- **Build → Dockerfile Path**: `apps/marketplace-api/Dockerfile`.

That exact combination matters. `apps/marketplace-api/Dockerfile` writes its `COPY` lines as
`apps/marketplace-api/...`, so it must be built *from the repo root* — Root Directory stays blank
while Dockerfile Path points at the nested file.

### Step 4: Add Postgres

Canvas → **+ New** → **Database** → **Add PostgreSQL**. Nothing to configure.

### Step 5: Generate the public domain first

`marketplace-api` → **Settings → Networking → Public Networking** → **Generate Domain**, targeting
port **3010**. Copy the resulting `https://…` origin — Step 6 needs it, and setting it afterwards
means a second deploy.

### Step 6: Set variables

`marketplace-api` → **Variables** → **Raw Editor**, paste and fill in:

```text
NODE_ENV=production
PORT=3010
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_BASE_URL=https://<marketplace-api-domain>
ARTIFACT_STORAGE_PATH=/data/artifacts
MARKETPLACE_ADMIN_TOKEN=<from Step 1>
METADATA_SIGNING_PRIVATE_KEY=<from Step 1, newlines already escaped as \n>
METADATA_SIGNING_KEY_ID=<from Step 1>
ENTITLEMENT_SIGNING_PRIVATE_KEY=<from Step 1, different key>
ENTITLEMENT_SIGNING_KEY_ID=<from Step 1>
IDENTITY_ENCRYPTION_KEYS_JSON=<from Step 1>
IDENTITY_ENCRYPTION_ACTIVE_KEY_ID=<from Step 1>
PAYMENT_WEBHOOK_SECRET=<from Step 1>
TRANSACTIONAL_EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<your SendGrid key>
TRANSACTIONAL_EMAIL_FROM=<verified sender address>
```

Notes on the ones that bite:

- `DATABASE_URL` must stay as the literal `${{Postgres.DATABASE_URL}}` reference. Pasting the
  resolved connection string hard-codes a password that Railway may rotate.
- `PUBLIC_BASE_URL` must be `https://`, must have **no trailing slash**, and must be the public
  domain — the service refuses to start otherwise in production.
- The two signing keys must be different keys with different key IDs; startup checks both.
- `METRICS_TOKEN` is optional. Without it `/metrics` returns 401 and stays disabled, which is the
  safe default. Set it (32+ characters) only when you have somewhere to scrape it from.

### Step 7: Add a persistent volume

`marketplace-api` → **Settings → Volumes** → **Add Volume**, mount path `/data/artifacts`. This is
where signed plugin packages live; without it, every deploy loses them.

### Step 8: Deploy and verify

Railway deploys on save. Watch **Deployments** until the build succeeds, then check:

```bash
curl https://<marketplace-api-domain>/health/live      # {"status":"alive"}
curl https://<marketplace-api-domain>/health/ready     # {"status":"ready",...}
curl https://<marketplace-api-domain>/v1/repository-key
curl "https://<marketplace-api-domain>/v1/index?coreVersion=1.0.0&channel=stable"
```

All four must return 200. `/v1/index` **without** `coreVersion` and `channel` correctly returns
400 — that is not a failure. Keep the `/v1/repository-key` response; every school needs it.

If readiness fails while liveness passes, the database, a migration, or a variable is wrong — read
the logs rather than working around the check.

---

## Part 2 — Deploy the Platform Admin

The operator control plane ships **with the marketplace, never with a school**. It gets its own
project, its own Postgres, and its own secrets. Use **Wattanam Platform Admin** for production and
a clearly separate **Wattanam Platform Admin Staging** for validation — never point staging at
production's database.

### Step 1: Create the project and services

1. **New Project** → **Empty Project**, renamed **Wattanam Platform Admin**.
2. **+ New** → **Database** → **Add PostgreSQL**.
3. **+ New** → **GitHub Repo** → the Wattanam V2 repository, named `marketplace-api`.
4. **+ New** → **GitHub Repo** → the same repository again, named `platform-admin-web`.

Yes, this project runs its own copy of `marketplace-api`. The operator API and the public
marketplace API are the same program serving different surfaces against different databases; the
admin's copy holds operator identities and never becomes publicly reachable.

### Step 2: Configure build settings

| Service | Root Directory | Dockerfile Path |
|---|---|---|
| `marketplace-api` | *(blank — repo root)* | `apps/marketplace-api/Dockerfile` |
| `platform-admin-web` | `apps/platform-admin` | `Dockerfile` (default) |

The two differ because their Dockerfiles differ: the API's expects repo-root context, while
`apps/platform-admin/Dockerfile` is self-contained and copies from its own directory. Setting Root
Directory for the web service is the dashboard equivalent of the CLI's `--path-as-root`.

### Step 3: Give only the web service a public domain

`platform-admin-web` → **Settings → Networking** → **Generate Domain**, port **3020**.

Leave `marketplace-api` with **no public domain**. The web app reaches it over Railway's private
network, and an operator API on the open internet is exactly what this project's isolation exists
to prevent.

### Step 4: Set the API's variables

Same shape as Part 1 Step 6, with **freshly generated secrets** — run the generator again. Reusing
the marketplace's signing keys here would let a staging mistake sign production artifacts.

```text
NODE_ENV=production
PORT=3010
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_BASE_URL=https://<any stable https URL you control>
ARTIFACT_STORAGE_PATH=/data/artifacts
MARKETPLACE_ADMIN_TOKEN=<new>
METADATA_SIGNING_PRIVATE_KEY=<new>
METADATA_SIGNING_KEY_ID=<new>
ENTITLEMENT_SIGNING_PRIVATE_KEY=<new, different again>
ENTITLEMENT_SIGNING_KEY_ID=<new>
IDENTITY_ENCRYPTION_KEYS_JSON=<new>
IDENTITY_ENCRYPTION_ACTIVE_KEY_ID=<new>
PAYMENT_WEBHOOK_SECRET=<new>
TRANSACTIONAL_EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<key>
TRANSACTIONAL_EMAIL_FROM=<verified sender>
```

`IDENTITY_ENCRYPTION_KEYS_JSON` is not optional in practice here: it is what encrypts operator MFA
secrets at rest. Without it in production the service refuses to start, which is the intended
behaviour.

`PUBLIC_BASE_URL` has no public listener in this project, but the config still requires an HTTPS
URL. Use a stable placeholder you own; it only appears in entitlement issuer strings and email
links this deployment does not send.

Add a volume at `/data/artifacts` as in Part 1 Step 7.

### Step 5: Set the web service's variables

`platform-admin-web` → **Variables** → **Raw Editor**:

```text
NODE_ENV=production
PORT=3020
MARKETPLACE_API_URL=http://${{marketplace-api.RAILWAY_PRIVATE_DOMAIN}}:3010
```

`http://` and the explicit `:3010` are both correct — private networking is plain HTTP inside
Railway, and the port must match the API service's `PORT`.

### Step 6: Deploy and verify

Wait for both services to reach SUCCESS, then:

```bash
curl -o /dev/null -w '%{http_code}\n' https://<platform-admin-domain>/login          # 200
curl -o /dev/null -w '%{http_code}\n' https://<platform-admin-domain>/api/platform/payouts   # 404
```

The second one matters: the app's proxy allowlists routes, so an upstream path it does not list is
unreachable through it. A 404 there means the allowlist is working; a 502 means the web service
cannot reach the API — recheck `MARKETPLACE_API_URL`.

### Step 7: Create the first platform operator (the one CLI step)

There is deliberately **no signup page and no HTTP endpoint that creates an operator** — exposing
one, even once, is the bootstrap hole the whole design avoids. Railway's dashboard has no shell, so
this step needs the CLI exactly once per environment.

A freshly migrated database has no operators *and* an empty role/permission catalog. One script
handles both.

**First time only** — register an SSH key with Railway:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_railway -C "wattanam-railway"
railway ssh keys add ~/.ssh/id_ed25519_railway.pub
```

Then, from `apps/marketplace-api` in a checkout of this repository:

```bash
railway link --project "Wattanam Platform Admin" --environment production --service marketplace-api

PAYLOAD=$(printf '%s' '{"email":"you@example.com","name":"Your Name","password":"<12+ characters>"}' | base64 -w0)
MSYS_NO_PATHCONV=1 railway ssh --service marketplace-api -i ~/.ssh/id_ed25519_railway \
  env PLATFORM_OPERATOR_B64=$PAYLOAD node < scripts/create-platform-operator.js
```

PowerShell (`<` redirection does not exist there, so pipe instead):

```powershell
$json = '{"email":"you@example.com","name":"Your Name","password":"<12+ characters>"}'
$b64  = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
Get-Content apps\marketplace-api\scripts\create-platform-operator.js |
  railway ssh --service marketplace-api -i $HOME\.ssh\id_ed25519_railway env PLATFORM_OPERATOR_B64=$b64 node
```

Three details that will otherwise waste an afternoon:

- `MSYS_NO_PATHCONV=1` is required on Git Bash, which otherwise rewrites `/app`-style paths into
  Windows paths before the native `railway.exe` sees them.
- Inputs go in as base64 because `railway ssh` joins its command arguments and re-splits them on
  whitespace — a quoted `NAME="Two Words"` arrives broken.
- Avoid `"` and `\` in the password; it travels inside JSON.

Expect a JSON summary reporting 36 permissions and 9 roles seeded plus the created operator. The
script refuses to overwrite an existing email.

### Step 8: First sign-in

Open `https://<platform-admin-domain>/login` and sign in with that email and password.

MFA is mandatory and enforced from the very first login: you will be shown a setup key, not offered
a choice. Add it to an authenticator app, enter the six-digit code, and **save the recovery codes**
— they are shown once and there is no administrator who can reissue them.

Afterwards, change the bootstrap password from **Your account** in the header. Note that there is
no password-reset link and no administrator override for an operator identity: rotation is
self-service, and a genuinely lost password means creating a replacement operator and suspending
the old one.

### Step 9: Create least-privilege operators

`platform_owner` is **not** an all-access role — it deliberately cannot browse the catalog,
customer records, or commerce. Create separate named operators for the work people actually do, by
re-running Step 7 with a `"role"` field:

```text
marketplace_operator   schools, plugin requests, manual entitlements
plugin_reviewer        submissions and review decisions
security_reviewer      advisories and emergency withdrawal
publisher_manager      publisher identity, members, signing-key approval
finance_operator       orders, refunds, revenue
payout_approver        payout approval (never the requester)
customer_support       customer/school/request views, masked identifiers
auditor                read-only across audit-safe records and exports
```

One human per account. Two-person actions — payouts, exceptional entitlements, publisher key
approval — check operator identity, so two accounts shared by one person defeats the control.

---

## Part 3 — Deploy a customer school

Repeat this entire part for each school. Never add a second school to an existing school project.

### Step 1: Create the project and three services

1. **New Project** → **Empty Project**, renamed **Wattanam - `<School Name>` - Production**.
2. **+ New** → **Database** → **Add PostgreSQL**.
3. **+ New** → **GitHub Repo** three times, naming the services `api`, `web`, and `gateway`.

If Railway starts automatic deployments with repo-root defaults, let them fail — configure Step 2
and redeploy.

### Step 2: Configure build settings

| Service | Root Directory | Dockerfile Path |
|---|---|---|
| `api` | `backend` | `Dockerfile` (default) |
| `web` | `frontend` | `Dockerfile` (default) |
| `gateway` | `infrastructure/gateway` | `Dockerfile` (default) |

All three are self-contained, so Root Directory alone is enough.

### Step 3: Generate the gateway's public domain

`gateway` → **Settings → Networking** → **Generate Domain**, port **8080**. `api` and `web` get no
public domain, ever — the gateway is the single front door.

### Step 4: Generate the school's own secrets

Each school needs its **own** `JWT_SECRET` and email credentials. Do not reuse another school's.

Fetch the marketplace's *public* trust key — schools receive public keys only, never a marketplace
private key:

```bash
curl https://<marketplace-api-domain>/v1/repository-key
```

The response maps onto two school variables:

| Response field | School variable |
|---|---|
| `activeKeyId` | `UPDATE_REPOSITORY_KEY_ID` |
| `keys[]` entry whose `keyId` matches `activeKeyId` → its `publicKeyPem` | `UPDATE_REPOSITORY_PUBLIC_KEY` |

Railway variables are single-line, so replace the PEM's real newlines with the literal two
characters `\n` — the school reads it back either way, but a PEM pasted with raw line breaks will
be truncated at the first one.

### Step 5: Set variables

`api`:

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<unique to this school>
CORS_ORIGINS=https://<school-gateway-domain>
PUBLIC_APP_URL=https://<school-gateway-domain>
COOKIE_SECURE=true
APP_VERSION=1.0.0
PROCESS_ROLE=combined
BACKUP_DIR=/data/backups
PLUGIN_DIR=/data/plugins
PLUGIN_DATA_DIR=/data/plugin-data
INSTALLATION_KEY_DIR=/data/marketplace-identity
MARKETPLACE_URL=https://<marketplace-api-domain>
UPDATE_REPOSITORY_KEY_ID=<metadata key id from /v1/repository-key>
UPDATE_REPOSITORY_PUBLIC_KEY=<public key PEM from /v1/repository-key>
SENDGRID_API_KEY=<school's key>
SENDGRID_FROM=<school's verified sender>
```

Two constraints worth knowing before the first failed deploy:

- `PUBLIC_APP_URL` is the origin used to build password-reset links. Point it at the gateway
  domain, not an internal listener, or those emails contain unreachable links.
- `MARKETPLACE_URL` must be a bare HTTPS **origin** — no path, no query, no trailing segment. A
  value like `https://…/v1` is rejected at startup.

`web`:

```text
NODE_ENV=production
PORT=3000
API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001
MARKETPLACE_URL=https://<marketplace-api-domain>
NEXT_PUBLIC_API_URL=
```

`NEXT_PUBLIC_API_URL` is intentionally empty — the browser talks to the gateway on the same origin.

`gateway`:

```text
PORT=8080
API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:3001
WEB_UPSTREAM=${{web.RAILWAY_PRIVATE_DOMAIN}}:3000
```

### Step 6: Add a volume to `api`

`api` → **Settings → Volumes** → mount path `/data`. One volume covers backups, plugins, plugin
data, and the installation identity. Losing it loses the school's marketplace identity.

### Step 7: Verify through the gateway

```bash
S=https://<school-gateway-domain>
curl $S/gateway-health              # ok
curl $S/api/version                 # real JSON — proves gateway reaches api
curl $S/api/health/ready            # ready — proves database and migrations
curl $S/api/installation/status     # "ready" before setup, "installed" after
curl -o /dev/null -w '%{http_code}\n' $S/login   # 200 — proves gateway reaches web
```

### Step 8: Run first-run setup

Open the gateway URL. A fresh database redirects to setup. Enter the legal school name and slug,
timezone, locale, currency, the owner's real name and email, and a strong password. Complete it
once: `installation/status` flips to `installed` and setup locks itself.

Confirm the owner can sign in, then redeploy `api` once and confirm the installation survives —
that is the check that proves the volume is mounted correctly.

### Step 9: Link the school to the marketplace

1. Sign in to the school as `SUPER_ADMIN`.
2. **Admin → Plugins** → **Link marketplace account**.
3. In the consent tab, sign in to the *customer* marketplace account.
4. Approve that one installation and return to the school.
5. Confirm the linked identity, browse the catalog, obtain an entitlement, install locally.

Approval and installation are separate on purpose: a platform operator can approve access but
cannot silently install anything into a school.

### Step 10: Attach a customer-owned domain

Attach `portal.school-domain.example` to `gateway` only, add the exact CNAME/TXT records Railway
shows, and wait for TLS. Then, in this order:

1. temporarily allow both the Railway and custom origins in `CORS_ORIGINS`;
2. set `PUBLIC_APP_URL` to the final custom HTTPS origin;
3. verify login, API, Socket.IO, password-reset email links, and plugin actions;
4. keep the Railway domain as rollback through acceptance;
5. remove the old origin after cutover.

---

## Quick reference: build settings

Get this table wrong and the service builds cleanly, then crashes on a *different* application's
configuration. It is the first thing to re-check on any unexplained crash.

| Service | Project | Root Directory | Dockerfile Path | Port | Public? |
|---|---|---|---|---:|---|
| `marketplace-api` | Marketplace | *(blank)* | `apps/marketplace-api/Dockerfile` | 3010 | Yes |
| `marketplace-api` | Platform Admin | *(blank)* | `apps/marketplace-api/Dockerfile` | 3010 | **No** |
| `platform-admin-web` | Platform Admin | `apps/platform-admin` | `Dockerfile` | 3020 | Yes |
| `api` | School | `backend` | `Dockerfile` | 3001 | **No** |
| `web` | School | `frontend` | `Dockerfile` | 3000 | **No** |
| `gateway` | School | `infrastructure/gateway` | `Dockerfile` | 8080 | Yes |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Marketplace or admin API crashes demanding `CORS_ORIGINS` | Railway built the **school backend** — Root Directory/Dockerfile Path not saved as in the table above | Fix both fields and redeploy |
| `PUBLIC_BASE_URL must use HTTPS in production` | An `http://` or trailing-slash value | Use the exact `https://` public origin, no trailing slash |
| Liveness passes, readiness fails | Database, migration, or variable problem | Read the logs; never route around the readiness check |
| Admin web returns 502 | It cannot reach its API | Check `MARKETPLACE_API_URL` uses `http://`, the private domain, and the API's real `PORT` |
| Gateway is up but `/api/*` fails | Wrong private host or port in the upstreams | Set `API_UPSTREAM`/`WEB_UPSTREAM` to `${{service.RAILWAY_PRIVATE_DOMAIN}}:<port>` |
| Operator sign-in rejects a brand-new account | The account was created in a different project's database | Create it against the API that *this* admin web deployment points at |
| No operator signup page anywhere | Intended design | Use the Step 7 script; never add a public bootstrap endpoint |
| `railway ssh` says "no SSH key was offered" | The key is registered but not being offered | Pass it explicitly with `-i ~/.ssh/<key>` |
| A quoted display name arrives mangled over `railway ssh` | The CLI re-splits joined arguments on whitespace | Use the base64 payload form shown in Step 7 |
| `/v1/index` returns 400 | Missing required query parameters | Supply `coreVersion` and `channel` |
| Pushing to GitHub does not redeploy | Service was created by CLI upload, or the GitHub source is disconnected | Reconnect the repo/branch in Settings → Source |

## Acceptance checklist

- [ ] Marketplace API, database, signing keys, email, volume, and all four public probes pass.
- [ ] Platform Admin has its own project, database, and freshly generated secrets — nothing shared
      with the marketplace or with staging.
- [ ] Only `marketplace-api` (central), `platform-admin-web`, and each school's `gateway` are public.
- [ ] The first operator completed MFA enrollment, saved recovery codes, and changed the bootstrap
      password.
- [ ] Every privileged human has their own named least-privilege operator account.
- [ ] Each school has its own project, database, secrets, volume, installation identity, and owner.
- [ ] Each school survived an `api` redeploy with its installation and identity intact.
- [ ] Custom domain, CORS, TLS, cookies, email links, and WebSockets verified per school.
- [ ] Marketplace link → entitlement → signed download → local install verified end to end.
- [ ] Database and volume backups enabled, and a restore rehearsed into a clean project.
- [ ] Commit SHA, project/service IDs, domains, owners, and support contacts recorded — with no
      secret values among them.

## Related

- [Railway CLI Deployment Guide](./railway-complete-platform-cli-guide.md) — same deployment, terminal-driven
- [Manual Railway Setup Guide](./railway-manual-setup-guide.md) — the earlier marketplace + school walkthrough this expands on
- [Railway Deployment Guide](./railway-deployment-guide.md) — troubleshooting reference from a real deployment
- [Per-school Railway Architecture](../deployment/railway-per-school.md)
- [First-run Installation](./first-run-installation.md)
- [Backup and Restore](./backup-and-restore.md)
