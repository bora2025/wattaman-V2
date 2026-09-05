# Wattanam V2 Railway CLI Deployment and Setup Guide

Status: operational runbook  
Scope: central marketplace, private platform administration, and isolated customer schools  
Validated repository layout: 2026-09-03

> **Production control-plane correction (2026-09-05):** the production Platform Admin now shares
> the one canonical marketplace API/database in `Wattanam V2 Marketplace`; do not create the
> second production marketplace project described later in this historical guide. Use
> [railway-canonical-control-plane.md](./railway-canonical-control-plane.md) for current production
> configuration. The separate topology below is valid only for an isolated staging environment.

This guide creates three separate deployment boundaries:

```text
Wattanam V2 Marketplace                 one shared central project
├── Postgres
└── marketplace-api                     public API, port 3010

Wattanam Platform Admin                 one private operations project
├── Postgres
├── marketplace-api                     private where practical, port 3010
└── platform-admin-web                  public operator login, port 3020

Wattanam - <School> - Production        one project for each school
├── Postgres
├── api                                 private, port 3001
├── web                                 private, port 3000
└── gateway                             only public school service, port 8080
```

Never put school records in the marketplace database. Platform Admin never connects directly to
a school's PostgreSQL database. Every school has an isolated project, database, secrets, volumes,
domain, installation identity, and administrator.

## 1. Prerequisites

1. Install Node.js 20, Git, Railway CLI, and OpenSSH.
2. Push a reviewed release to GitHub `main`.
3. Use a paid Railway workspace suitable for persistent production services.
4. Store secrets in a password manager, never Git, chat, screenshots, or evidence files.
5. Authenticate from the repository root:

```powershell
Set-Location C:\Users\borax\Wattanam-V2
railway.cmd login --browserless
railway.cmd whoami
git status --short
git rev-parse HEAD
```

Open Railway's activation URL and approve its short-lived code. Deploy only a reviewed, clean
commit: `railway up` uploads the working directory, including uncommitted files.

## 2. Generate central secrets

Generate these separately for every marketplace environment:

- `MARKETPLACE_ADMIN_TOKEN`;
- Ed25519 metadata signing private key and key ID;
- a different Ed25519 entitlement signing private key and key ID;
- identity-encryption keyring and active key ID;
- payment webhook secret and metrics token;
- real transactional-email credentials.

Use the generator in
[railway-manual-setup-guide.md](./railway-manual-setup-guide.md#step-2-generate-secrets-on-your-own-machine).
Keep private keys in an access-controlled password manager. Schools receive public trust keys
only, never marketplace private keys.

## 3. Deploy the central Marketplace

### 3.1 Create and link

Create an empty Railway project named `Wattanam V2 Marketplace`. Add PostgreSQL and an empty
service named `marketplace-api`, then run:

```powershell
railway.cmd link `
  --project "Wattanam V2 Marketplace" `
  --environment production `
  --service marketplace-api
railway.cmd status
```

Read `railway status` before every mutation and confirm the project, environment, and service.

### 3.2 Select the correct Dockerfile

The marketplace Dockerfile requires repository-root build context:

```powershell
railway.cmd variable set `
  RAILWAY_DOCKERFILE_PATH=apps/marketplace-api/Dockerfile `
  --service marketplace-api `
  --environment production `
  --skip-deploys
```

If its logs mention school-only settings such as `CORS_ORIGINS`, Railway built the school backend.
Correct this variable and redeploy from the repository root.

### 3.3 Configure variables and storage

Set these on `marketplace-api` with Railway sealed variables or its Raw Editor:

```text
NODE_ENV=production
PORT=3010
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_BASE_URL=https://<marketplace-api-domain>
ARTIFACT_STORAGE_PATH=/data/artifacts
MARKETPLACE_ADMIN_TOKEN=<secret>
METADATA_SIGNING_PRIVATE_KEY=<secret PEM with escaped newlines>
METADATA_SIGNING_KEY_ID=<stable key id>
ENTITLEMENT_SIGNING_PRIVATE_KEY=<different secret PEM>
ENTITLEMENT_SIGNING_KEY_ID=<stable key id>
IDENTITY_ENCRYPTION_KEYS_JSON=<keyring JSON>
IDENTITY_ENCRYPTION_ACTIVE_KEY_ID=<active key id>
PAYMENT_WEBHOOK_SECRET=<secret>
METRICS_TOKEN=<secret>
TRANSACTIONAL_EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<secret>
TRANSACTIONAL_EMAIL_FROM=<verified sender>
```

Reference Railway PostgreSQL; do not copy its resolved password. Mount a persistent volume at
`/data/artifacts`. Generate a public domain targeting port `3010`, then set `PUBLIC_BASE_URL` to
that exact HTTPS origin without a trailing slash.

### 3.4 Deploy and verify

```powershell
railway.cmd up --service marketplace-api --environment production --detach
railway.cmd deployment list --service marketplace-api --environment production --limit 3
railway.cmd logs --service marketplace-api --environment production --lines 200
```

Wait for `SUCCESS`, then run:

```powershell
$marketplace = 'https://<marketplace-api-domain>'
curl.exe --fail-with-body "$marketplace/"
curl.exe --fail-with-body "$marketplace/health/live"
curl.exe --fail-with-body "$marketplace/health/ready"
curl.exe --fail-with-body "$marketplace/v1/catalog"
curl.exe --fail-with-body "$marketplace/v1/repository-key"
curl.exe --fail-with-body "$marketplace/v1/index?coreVersion=1.0.0&channel=stable"
```

All must return HTTP 200. A bare `/v1/index` may correctly return HTTP 400 because it requires
`coreVersion` and `channel`.

## 4. Deploy Platform Admin

Use `Wattanam Platform Admin` for production and `Wattanam Platform Admin Staging` only for
non-production validation.

### 4.1 Create services

Create an empty project with PostgreSQL, `marketplace-api`, and `platform-admin-web`. The API uses
the same variable classes as §3, but its database, tokens, encryption keys, signing keys, webhook
secret, and volume must be unique. Never reuse production secrets in staging.

Deploy the API from repository root:

```powershell
railway.cmd link `
  --project "Wattanam Platform Admin Staging" `
  --environment production `
  --service marketplace-api

railway.cmd variable set `
  RAILWAY_DOCKERFILE_PATH=apps/marketplace-api/Dockerfile `
  --service marketplace-api `
  --environment production `
  --skip-deploys

railway.cmd up --service marketplace-api --environment production --detach
```

Deploy the self-contained admin web directory:

```powershell
railway.cmd up .\apps\platform-admin `
  --path-as-root `
  --service platform-admin-web `
  --environment production `
  --detach
```

Configure `platform-admin-web`:

```text
NODE_ENV=production
PORT=3020
MARKETPLACE_API_URL=http://${{marketplace-api.RAILWAY_PRIVATE_DOMAIN}}:3010
```

Only `platform-admin-web` needs a public domain. Verify its `/login` returns HTTP 200 and the API
readiness endpoint succeeds.

### 4.2 Create the first Platform Owner

There is intentionally no public operator registration. Create the first named operator inside
the deployed API:

```powershell
$email = Read-Host 'Platform owner email'
$name = Read-Host 'Platform owner display name'
$securePassword = Read-Host 'Temporary password (minimum 12 characters)' -AsSecureString
$password = [PSCredential]::new('owner', $securePassword).GetNetworkCredential().Password
$account = @{
  email = $email
  name = $name
  password = $password
  role = 'platform_owner'
} | ConvertTo-Json -Compress
$payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($account))

Get-Content `
  -LiteralPath 'apps/marketplace-api/scripts/create-platform-operator.js' `
  -Raw |
railway.cmd ssh `
  --service marketplace-api `
  --environment production `
  -i "$HOME\.ssh\id_ed25519_wattanam_railway" `
  env "PLATFORM_OPERATOR_B64=$payload" node

$password = $null
$account = $null
$payload = $null
Remove-Variable securePassword
```

The command seeds 36 permissions and 9 roles and refuses to overwrite an email. On first login,
enroll MFA, confirm the six-digit code, save recovery codes, and change the temporary password.
Never share the MFA QR/setup key or recovery codes.

`platform_owner` is not a universal role. Create separate named operators with least-privilege
roles such as `marketplace_operator`, `plugin_reviewer`, `publisher_manager`, `finance_operator`,
`security_reviewer`, and `auditor`. Two-person actions require two different humans.

## 5. Deploy a customer school

Repeat this section for every legal school organization.

### 5.1 Create the isolated project

Create `Wattanam - <School Name> - Production` with PostgreSQL and three empty services:

| Service | Upload path | Port | Public? |
|---|---|---:|---|
| `api` | `backend` | 3001 | No |
| `web` | `frontend` | 3000 | No |
| `gateway` | `infrastructure/gateway` | 8080 | Yes |

```powershell
railway.cmd link --project "Wattanam - <School Name> - Production" --environment production
```

### 5.2 Configure the school API

Generate a unique JWT secret and provider credentials. Fetch the marketplace metadata public key
from `/v1/repository-key`; never copy the private key into a school.

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<unique school secret>
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
UPDATE_REPOSITORY_KEY_ID=<marketplace metadata key id>
UPDATE_REPOSITORY_PUBLIC_KEY=<marketplace public key PEM>
SENDGRID_API_KEY=<school email secret>
SENDGRID_FROM=<school verified sender>
```

Mount one persistent volume at `/data`.

Configure `web`:

```text
NODE_ENV=production
PORT=3000
API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001
MARKETPLACE_URL=https://<marketplace-api-domain>
NEXT_PUBLIC_API_URL=
```

Configure `gateway`:

```text
PORT=8080
API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:3001
WEB_UPSTREAM=${{web.RAILWAY_PRIVATE_DOMAIN}}:3000
```

Only `gateway` receives a public domain, targeting port `8080`.

### 5.3 Deploy in dependency order

```powershell
railway.cmd up .\backend --path-as-root --service api --environment production --detach
railway.cmd up .\frontend --path-as-root --service web --environment production --detach
railway.cmd up .\infrastructure\gateway --path-as-root --service gateway --environment production --detach
railway.cmd status
```

Inspect failures with `railway.cmd logs --service <name> --environment production --lines 200`.

### 5.4 Verify and install

```powershell
$school = 'https://<school-gateway-domain>'
curl.exe --fail-with-body "$school/gateway-health"
curl.exe --fail-with-body "$school/api/version"
curl.exe --fail-with-body "$school/api/health/ready"
curl.exe --fail-with-body "$school/api/installation/status"
curl.exe -sS -o NUL -w '%{http_code}' "$school/login"
```

Open the gateway URL. The fresh database redirects to setup. Enter the legal school name and slug,
timezone, locale, currency, owner name, real email, strong password, accepted licence, and provider
choices. Complete setup once. Confirm status changes from `ready` to `installed`, setup locks, the
owner logs in, and the installation survives an API redeploy.

### 5.5 Link Marketplace

1. Sign in to the school as `SUPER_ADMIN`.
2. Open **Admin → Plugins** and select **Link marketplace account**.
3. Sign in to the customer marketplace account in the consent tab.
4. Approve only that installation and return to the school.
5. Confirm the linked identity, browse the catalog, obtain an entitlement, and install locally.

Platform operators approve acquisition but cannot silently install into a school.

### 5.6 Add a school domain

Attach `portal.school-domain.example` only to `gateway`. Add Railway's exact CNAME and TXT records.
After TLS becomes ready:

1. temporarily allow Railway and custom origins in `CORS_ORIGINS`;
2. set `PUBLIC_APP_URL` to the final custom HTTPS origin;
3. verify login, API, Socket.IO, password-reset email, and plugin actions;
4. retain the Railway domain as rollback during acceptance;
5. remove the old origin after controlled cutover.

## 6. Backup, restore, and handoff

Before production handoff:

1. enable Railway database and volume backups;
2. generate an encrypted application recovery set;
3. copy it to separate access-controlled storage;
4. restore into a clean project and compare database/file/plugin/identity checksums;
5. record witnessed RPO/RTO results;
6. verify redeploy and controlled upgrade/rollback;
7. record project/service IDs, domains, release commit, mounts, owners, and support contacts without
   recording secret values.

## 7. Troubleshooting

| Symptom | Cause | Corrective action |
|---|---|---|
| Marketplace asks for `CORS_ORIGINS` | Railway built the school backend | Set `RAILWAY_DOCKERFILE_PATH=apps/marketplace-api/Dockerfile`; deploy from repo root |
| GitHub push does not redeploy | CLI-uploaded service or disconnected GitHub source | Connect repo/branch or run the correct `railway up` command |
| Marketplace root says `Not found` | Old marketplace build | Deploy commit `abf88a3` or later |
| Liveness works but readiness fails | Database, migration, or configuration failure | Read API logs; never bypass readiness |
| Gateway works but API routes fail | Incorrect private host or port | Set explicit ports and Railway private-domain upstreams |
| Platform login rejects a new account | Account created in the wrong project database | Create it in the API used by that exact admin web deployment |
| No operator signup page | Expected security design | Use the SSH-piped script; never add public bootstrap HTTP |
| Bare repository index returns 400 | Missing required query parameters | Supply `coreVersion` and `channel` |

## 8. Final acceptance checklist

- [ ] Marketplace API, database, keys, email, volume, and public probes pass.
- [ ] Platform Admin API/web/database are isolated and the owner completes MFA.
- [ ] Every privileged operator has a named least-privilege account.
- [ ] Every school has its own project, database, secrets, volume, identity, and owner.
- [ ] Only intended marketplace, admin-web, and school-gateway ingress is public.
- [ ] Custom domain, exact CORS, TLS, cookies, email links, and WebSockets pass.
- [ ] Marketplace link, entitlement, signed download, and local installation pass.
- [ ] Backup restores into clean infrastructure and meets recorded RPO/RTO.
- [ ] Commit, service IDs, ownership, support, monitoring, and rollback are recorded.
- [ ] No key, password, session, admin token, or recovery code appears in Git or evidence.

Related references:

- [Manual Railway Setup Guide](./railway-manual-setup-guide.md)
- [Railway Deployment Guide](./railway-deployment-guide.md)
- [Per-school Railway Architecture](../deployment/railway-per-school.md)
- [First-run Installation](./first-run-installation.md)
- [Backup and Restore](./backup-and-restore.md)
- [Platform Admin Interface Plan](../marketplace/platform-admin-interface-plan.md)
