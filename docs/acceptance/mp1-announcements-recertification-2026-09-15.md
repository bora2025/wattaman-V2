# MP-1 Announcements Recertification Evidence

Date: 2026-09-15
Status: in progress (second pass)
Wave: MP-1 low-coupling proof
Checklist: [MP-1 Low-Coupling Proof Checklist](../architecture/mp1-low-coupling-proof-checklist.md)

## Scope of this pass

This pass validates current announcements plugin behavior through focused automated checks, digest-parity verification and live restore-drill evidence, and confirms the compatibility proxy contract remains intact.

## Commands executed

From backend workspace:

- npm.cmd test -- --runInBand src/announcements/announcements.controller.spec.ts src/plugins/reference-plugin.spec.ts src/plugins/plugin-runtime.service.spec.ts
- npm.cmd run build
- npm.cmd run architecture:inventory:gate

Additional certification run:

- node scripts/certify-plugin-migration.js --out ../docs/acceptance/mp1-announcements-certification-report-2026-09-15.json

## Results

- Targeted tests: PASS
- Suite count: 3 passed, 0 failed
- Test count: 18 passed, 0 failed
- Backend build: PASS
- Architecture gate: PASS (1,350 items owned, 82 models classified)

Certification suite report:

- Overall: PASS
- adoption: PASS (7 tests)
- lifecycle: PASS (38 tests)
- recovery: PASS (12 tests)
- security: PASS (25 tests)
- report file: docs/acceptance/mp1-announcements-certification-report-2026-09-15.json
- report SHA-256: 80ffd2351115bbc83f98cf727c80f43f9868f180575a0c49b820acb0d864698f

## What this verifies

### 1. Compatibility proxy behavior remains correct

The proxy controller test confirms all announcements REST endpoints translate to plugin dispatch calls and no Prisma access exists in the proxy layer.

Reference:

- [announcements.controller.spec.ts](../../backend/src/announcements/announcements.controller.spec.ts)

### 2. Announcements plugin route and behavior contract is intact

The reference plugin contract test validates route registration and key behavior paths, including settings, feed/all/read/create/remove flows and notification fan-out behavior.

Reference:

- [reference-plugin.spec.ts](../../backend/src/plugins/reference-plugin.spec.ts)

### 3. Runtime capability enforcement is intact

Runtime tests validate plugin runtime loading and capability-gated access paths used by plugin execution.

Reference:

- [plugin-runtime.service.spec.ts](../../backend/src/plugins/plugin-runtime.service.spec.ts)

### 4. Prior live cutover baseline still available

The earlier live PostgreSQL cutover evidence remains the current authoritative live migration baseline for announcements extraction.

Reference:

- [gate-c-announcements-cutover-2026-08-28.md](./gate-c-announcements-cutover-2026-08-28.md)

## Not yet completed in this pass

- Full lifecycle recertification was validated by certification suites, but not re-executed as a fresh manual live clean-core drill in this pass.

## Clean-core marketplace install status (2026-09-15)

Clean-core marketplace install verification was completed for this wave via targeted automated proof.

Command:

- node node_modules/jest/bin/jest.js --runInBand src/marketplace/marketplace-commerce.service.spec.ts --watchAll=false --verbose --forceExit

Result summary:

- Overall: PASS
- Suites: 1 passed, 0 failed
- Tests: 2 passed, 0 failed

Passing checks:

- installs a marketplace plugin on clean core without requiring existing plugin rows
- merges and persists a release publisher key, then activates when requested

Evidence:

- [mp1-announcements-clean-core-marketplace-install-2026-09-15.md](./mp1-announcements-clean-core-marketplace-install-2026-09-15.md)

## API and worker digest parity status (2026-09-15)

Explicit digest-parity capture was completed for this wave.

Command:

- npm.cmd test -- --runInBand src/plugins/plugin-artifact-cache.service.spec.ts src/plugins/plugin-rollout.service.spec.ts

Result summary:

- Overall: PASS
- Suites: 2 passed, 0 failed
- Tests: 5 passed, 0 failed
- API/worker same-digest assertions: PASS
- Readiness gating assertions: PASS

Evidence:

- [mp1-announcements-digest-parity-2026-09-15.md](./mp1-announcements-digest-parity-2026-09-15.md)

## Live restore drill status (2026-09-15)

A live restore drill was completed for this wave with disposable PostgreSQL source and target databases.

Result summary from JSON evidence:

- `passed`: true
- `identity.exactMatch`: true
- `rto.measuredSeconds`: 3.217
- `rto.withinTarget`: true
- `reportSha256`: `afe27fc9c0fd6fb0ffc01023fa76cad3d470f62aa641fe93f9d07215b640af44`

Evidence:

- [mp1-announcements-restore-drill-2026-09-15.md](./mp1-announcements-restore-drill-2026-09-15.md)
- [mp1-announcements-restore-drill-2026-09-15.json](./mp1-announcements-restore-drill-2026-09-15.json)

## Current assessment

Announcements recertification now has automated behavior checks, clean-core marketplace install proof, digest-parity evidence, and live restore evidence. MP-1 overall remains open until Document Designer certification completes.
