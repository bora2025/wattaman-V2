# LC2-015 — Clean database boot

Status: **complete — live PostgreSQL 16 core boot verified 2026-09-11**

## Implemented controls

- `backend/prisma/core/schema.prisma` is deterministically generated from the accepted ownership
  contract and contains exactly the 21 core models. `npm run schema:core:check` fails if it drifts.
- `backend/prisma/core/migrations/00000000000000_core_baseline` creates only that closed model graph
  and records immutable lineage `wattanam-core-v1`.
- The existing migration chain remains separate and gains only the non-destructive
  `wattanam-legacy-v1` lineage marker. No business table or row is removed.
- `backend/scripts/deploy-migrations.js` selects the migration chain from
  `WATTANAM_DISTRIBUTION`, defaults safely to `legacy-full`, and rejects unknown values.
- Docker and Railway startup use that selector before starting the API.
- Core API and worker startup fail closed when the lineage marker is missing or incompatible.
  A marked legacy database is accepted by core composition only for the documented staged cutover.

## Offline evidence completed 2026-09-11

```text
npm run schema:core:write                         PASS (21 models)
npm run schema:core:check                         PASS
npx prisma validate --schema=prisma/core/schema.prisma
                                                    PASS
node --test backend/scripts/deploy-migrations.test.js
                                                    PASS (3/3)
npm test -- --runInBand src/database/schema-lineage.spec.ts
                                                    PASS (4/4)
npm test -- --runInBand src/distribution           PASS (6/6)
npm run build                                      PASS
npm run lint:ci                                    PASS (0 errors; existing warnings)
node --test tools/core-schema-contract.test.js     PASS (4/4)
```

## Live proof completed 2026-09-11

- Built the production backend Dockerfile and applied the core baseline to a new disposable
  `postgres:16-alpine` database.
- API readiness returned `ready`/`database: up`; the separate worker returned `ready` on port 3002.
- The database contained the exact 21 application tables plus `_prisma_migrations` and
  `_wattanam_schema_lineage`; no `Attendance`, `Student`, `FeeRecord`, or `Message` table existed.
- The lineage was `wattanam-core-v1` and the API exposed no legacy `/parent/children` route (404).
- Missing and unsupported (`unknown-v99`) lineage databases both exited before opening a port.
- The live run discovered and fixed a hidden `PluginsModule -> ParentModule` dependency. Plugin
  notification sockets now use the core-owned authenticated `PluginRealtimeGateway`; parent and
  messaging controllers are not composed.
