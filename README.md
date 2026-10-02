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

## Deployment boundary

Deploy `apps/marketplace-api` and `apps/platform-admin` as separate services with the marketplace PostgreSQL database. Never point a customer-school service at the marketplace database, and never place marketplace signing private keys in a customer-school installation.
