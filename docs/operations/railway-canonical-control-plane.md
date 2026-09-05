# Railway Canonical Production Control Plane

Status: deployment contract

Canonical Railway project: `Wattanam Marketplace Production`

Project ID: `6be51398-fec2-481c-84b8-86e6a978fad8`

Production has exactly one marketplace API and one marketplace database. `platform-admin-web`
is an interface to that API; it must not run a second marketplace API or use a second Postgres
database. Staging remains isolated and must never be presented as production.

```text
Wattanam Marketplace Production (one Railway project)
├── Postgres                  canonical marketplace database
├── marketplace-api          canonical API
└── platform-admin-web       operator UI -> marketplace-api private domain
```

The machine-readable source of truth is
[`control-plane-contract.json`](../../infrastructure/railway/control-plane-contract.json).

## Required Railway service settings

Both services use repository-root build context. Configure these values in Railway **Settings →
Source**. Do not point either control-plane service at the repository's root `railway.json`; that
file deploys the customer-school backend.

| Service | Root directory | Railway config file |
|---|---|---|
| `marketplace-api` | `/` | `/infrastructure/railway/marketplace-api.railway.json` |
| `platform-admin-web` | `/` | `/infrastructure/railway/platform-admin.railway.json` |

The explicit configs select different Dockerfiles and watch paths. This makes a GitHub auto-deploy
deterministic and removes the former dependence on which directory a person happened to upload
with `railway up`.

Required cross-service references:

```text
marketplace-api.DATABASE_URL=${{Postgres.DATABASE_URL}}
platform-admin-web.MARKETPLACE_API_URL=http://${{marketplace-api.RAILWAY_PRIVATE_DOMAIN}}:3010
```

Use the actual internal listening port if the production service intentionally changes `PORT`, and
update the checked-in contract in the same reviewed change. Never substitute a public staging URL.

## Pre-deployment gate

Run from the repository root:

```powershell
npm run verify:control-plane
npm run test:tools
git status --short
```

The first check is also required by PR validation. It verifies the canonical project identity,
database reference, private API binding, Dockerfile selection, repository-root context, and health
checks. A clean result does not inspect Railway; compare the live service settings with the table
above before the first deployment and after any Railway configuration change.

## Safe CLI deployment

These commands upload the repository root and rely on each service's checked-in Railway config:

```powershell
railway.cmd link --project 6be51398-fec2-481c-84b8-86e6a978fad8 --environment production
railway.cmd status
npm run verify:control-plane
railway.cmd up --service marketplace-api --environment production --detach
railway.cmd up --service platform-admin-web --environment production --detach
```

Stop if `railway status` does not show the canonical project ID. Do not use
`railway up .\apps\platform-admin --path-as-root` for production; that legacy command bypasses the
root-context deployment contract.

## Post-deployment acceptance

Verify the exact production origins:

```powershell
curl.exe --fail-with-body https://<marketplace-origin>/health/live
curl.exe --fail-with-body https://<marketplace-origin>/health/ready
curl.exe --fail-with-body https://<platform-admin-origin>/login
```

Then sign in to Platform Admin and verify that a known production operator and customer-school
record are visible. This catches the most dangerous valid-looking failure: a healthy UI connected
to the wrong marketplace database.

## Failure signatures

| Symptom | Meaning | Action |
|---|---|---|
| Marketplace logs require `CORS_ORIGINS` | School backend Dockerfile was selected | Stop; restore the marketplace config path and redeploy |
| Platform Admin logs run Prisma migrations or require `DATABASE_URL` | Backend Dockerfile was selected | Stop; restore the Platform Admin config path and redeploy |
| Login works but production schools/operators are absent | UI is connected to another API/database | Correct `MARKETPLACE_API_URL`; do not duplicate records |
| API is live but `/health/ready` fails | Database/migration dependency is not ready | Do not promote; repair the database reference or migrations |

Never fix a wrong-image symptom by adding the missing variable requested by that image. Correct the
build selection instead.
