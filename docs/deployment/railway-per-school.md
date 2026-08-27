# Railway Deployment: One Project per School

> This runbook defines the current manual deployment. Automation, legacy adoption, domain-state handling, release promotion, and the production approval gate are specified in [the master execution plan](../platform-master-execution-plan.md).

## Deployment Model

Every customer school receives an independent Railway project containing its own services, variables, PostgreSQL database, domains, backups, installation identity, and plugin registry.

```text
Wattanam release repository or template
                    ↓
School Railway project
├── gateway (only public service)
├── web
├── api
├── worker (future milestone)
└── postgres
```

Never reference one school's PostgreSQL service or secrets from another school's project.

## Current Service Configuration

### PostgreSQL

Create a Railway PostgreSQL service named `postgres`. Do not expose it publicly.

### Gateway

Build the gateway from `/infrastructure/gateway` and expose port `8080`. This is the only service that receives a Railway public domain or customer custom domain.

Set:

```text
API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:3001
WEB_UPSTREAM=${{web.RAILWAY_PRIVATE_DOMAIN}}:3000
```

The gateway routes:

```text
/                 → private web service
/api/*            → private API service with /api removed
/socket.io/*      → private API WebSocket service
/gateway-health   → gateway health response
```

### API

| Setting | Value |
|---|---|
| Source | Wattanam V2 repository |
| Root directory | `/backend` |
| Dockerfile | `/backend/Dockerfile` |
| Internal port | `3001` |
| Health check | `/health/ready` |

Required variables:

```text
NODE_ENV=production
PORT=3001
APP_VERSION=<immutable release version>
GIT_COMMIT=<immutable release commit>
DATABASE_URL=${{postgres.DATABASE_URL}}
JWT_SECRET=<unique generated secret of at least 32 characters>
CORS_ORIGINS=https://portal.customer-domain.example
COOKIE_SECURE=true
PLUGIN_DIR=/data/plugins
PLUGIN_TRUSTED_KEYS_FILE=/run/plugin-keys/trusted-keys.json
```

Seal `JWT_SECRET` and external-provider credentials. Do not copy them between projects.

Attach a persistent volume at `/data/plugins`. Mount or inject the trusted public-key JSON as a sealed secret. Never deploy publisher private signing keys to a school project.

The API startup command runs:

```text
prisma migrate deploy && node dist/main
```

A failed migration prevents API startup.

### Web

| Setting | Value |
|---|---|
| Source | Wattanam V2 repository |
| Root directory | `/frontend` |
| Dockerfile | `/frontend/Dockerfile` |
| Internal port | `3000` |

Variables for the single-domain topology:

```text
NODE_ENV=production
PORT=3000
API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001
NEXT_PUBLIC_API_URL=
```

`API_URL` is server-only and uses Railway private networking. Keep `NEXT_PUBLIC_API_URL` empty so browser HTTP and WebSocket traffic use the same public customer origin through the gateway.

## Domain Topology

The application uses one customer domain:

```text
portal.customer-domain.example → gateway
```

Configure this domain on the gateway service and add the exact Railway-provided CNAME and ownership-verification TXT records at the DNS provider. Keep the web, API, and PostgreSQL services private.

Set API CORS exactly:

```text
CORS_ORIGINS=https://portal.customer-domain.example
```

HTTP and Socket.IO use this same exact-origin list. Wildcard Railway, Vercel, and `*` origins are not allowed in production. This topology keeps authentication cookies first-party and prevents browser exposure of internal service domains.

## Fresh School Provisioning

1. Create a new project from the approved Wattanam template.
2. Name it with the customer and environment, such as `Wattanam - Angkor School - Production`.
3. Confirm that a new `postgres` service was created.
4. Generate unique secrets.
5. Configure the exact customer domain on the gateway.
6. Deploy the API and confirm `/health`, `/health/ready`, and `/version`.
7. Deploy the web service and confirm `/setup` loads.
8. Confirm `/installation/status` returns `ready`.
9. Complete the setup wizard over HTTPS.
10. Confirm the state changes to `installed`.
11. Sign in with the new owner account.
12. Enable scheduled database backups.
13. Create an encrypted logical backup and perform a restore drill.
14. Record ownership, support contacts, core version, and domain details.

## Deployment Gate

A Railway template is not production-approved until automation verifies:

- Fresh migrations apply to an empty PostgreSQL database.
- Web and API images build from immutable sources.
- API readiness fails when PostgreSQL is unavailable.
- Setup creates exactly one owner under concurrent requests.
- Public setup locks immediately after completion.
- Web login redirects a fresh installation to `/setup`.
- HTTP and WebSocket requests reject unauthorized origins.
- Database and uploads survive application replacement.
- A backup restores into a clean project.

## Template Publication

Create the reusable Railway template only from a clean reference project. The template should contain service definitions and variable references, but no customer data, domains, credentials, or installation records.

For proprietary distribution, prefer immutable signed container images once the release pipeline exists. Until then, restrict repository access and pin deployments to reviewed release tags rather than a moving development branch.
