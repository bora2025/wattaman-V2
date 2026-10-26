# Wattanam Marketplace

This repository is the central Wattanam marketplace and plugin-development workspace. It does not contain or deploy the customer-school application.

The standalone customer-school product lives at [bora2025/Customer-School](https://github.com/bora2025/Customer-School) and can be installed on infrastructure chosen by each customer.

## Workspace

- `apps/marketplace-api` — marketplace catalog, customer accounts, commerce, entitlements, school control, and repository APIs.
- `apps/platform-admin` — operator control plane for customers, schools, billing, plugins, publishers, and governance.
- `plugins` — official free and paid plugin source packages.
- `packages/plugin-sdk` — public plugin contracts and runtime types.
- `packages/plugin-cli` — plugin scaffold, validation, signing, packaging, and publishing CLI.
- `packages/marketplace-contracts` — framework-independent protocols shared with customer-school installations.
- `tools` — marketplace catalog, package publication, and control-plane validation tools.
- `infrastructure/marketplace` and `infrastructure/railway` — marketplace deployment definitions.

## Local verification

```bash
npm run install:all
npm test
npm run build
```

## Provider-neutral local or VPS stack

Railway is an optional deployment adapter, not a runtime dependency. Bootstrap a local secret bundle,
then run the same API, PostgreSQL, artifact volume, and operator UI topology on any Docker host:

```bash
npm run local:bootstrap
npm run local:up
```

- Marketplace API: `http://localhost:3010`
- Platform Admin: `http://localhost:3020`
- PostgreSQL is private to the Compose network.
- Generated signing keys and credentials stay in ignored local files.

Use `npm run local:down` to stop the stack without deleting its database or artifact volumes. Production
must replace the generated development credentials, terminate TLS at a reverse proxy, use immutable image
digests, configure external object storage, and satisfy the production control verifier.

## Deployment boundary

Deploy `apps/marketplace-api` and `apps/platform-admin` as separate services with the marketplace PostgreSQL database. Never point a customer-school service at the marketplace database, and never place marketplace signing private keys in a customer-school installation. `.railway/railway.ts` is one optional adapter; `docker-compose.marketplace.yml` is the provider-neutral reference topology.
