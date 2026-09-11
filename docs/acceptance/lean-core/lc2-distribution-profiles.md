# LC-2 Distribution Profile Evidence

Status: **LC2-001 and LC2-002 accepted; LC2-007 pending separate acceptance**

Date: 2026-09-11

## LC2-001 — Configuration

The backend exposes a typed `Distribution` union with exactly two supported values:

- `core` — lean platform foundation;
- `legacy-full` — existing compiled feature set.

`readRuntimeConfig()` validates `WATTANAM_DISTRIBUTION` before either the API or worker opens its
network port. Both entry points log the selected distribution. Root/backend environment examples
and the API/worker Docker Compose services expose the same setting.

Invalid values produce a direct error naming `WATTANAM_DISTRIBUTION` and the received value. Blank
or absent configuration resolves to `legacy-full`.

## LC2-002 — Safe default

An existing installation that predates this setting therefore retains every compiled feature. Both
API and worker Compose services use `${WATTANAM_DISTRIBUTION:-legacy-full}`, and both environment
templates document that value. Automated Railway school provisioning sets `legacy-full` explicitly,
so new production projects cannot become core-only before LC2-014–LC2-023 prove that lifecycle.

`tools/distribution-default.test.js` locks these five entry points together and also rejects an
accidental `core` value in the Railway provisioner. Moving new schools to core-only later must be a
reviewed policy change with clean installation, identity, marketplace, billing, recovery and legacy
regression evidence—not a default-value edit.

## Verification

Run on 2026-09-11:

- `npm test -- --runInBand src/config/environment.spec.ts` — 15/15 tests passed.
- `npm run build` — all 242 backend source files compiled successfully.
- `node --test tools/*.test.js` includes the LC2-002 deployment-default contract.
- The focused test covers both accepted values, whitespace/case normalization, the default, direct
  invalid-value rejection and rejection through the complete runtime configuration loader.

## Files

- `backend/src/config/environment.ts`
- `backend/src/config/environment.spec.ts`
- `backend/src/main.ts`
- `backend/src/worker.ts`
- `.env.example`
- `backend/.env.example`
- `docker-compose.yml`
- `tools/provision-railway-school.js`
- `tools/distribution-default.test.js`
