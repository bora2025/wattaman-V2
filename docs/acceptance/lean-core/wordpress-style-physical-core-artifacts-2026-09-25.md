# WordPress-style physical core artifacts — 2026-09-25

Status: **LCF-005 physical UI/build boundary complete; hosted runtime certification remains in
LCF-008 and LCF-009**

Plan: [WordPress-style core and plugin reform](../../architecture/wordpress-style-core-plugin-reform-plan.md)

## Implementation

- `backend/src/app-core.module.ts` is a physical core-only Nest composition. It does not import the
  transitional AppModule or root registry that makes legacy business modules compiler-reachable.
- `backend/src/main-core.ts` refuses to start unless `WATTANAM_DISTRIBUTION=core`.
- `backend/webpack.core.config.js` produces the single-file `backend/dist-core/main.js` artifact
  from the core entry point.
- `frontend/core-routes.json` is the shared runtime/build contract for core routes.
- `frontend/scripts/build-core.js` creates an isolated build workspace and excludes optional page
  and route entry files before Next.js compilation.
- Only the generic `/plugins/[pluginId]/[[...path]]` host is compiled. Hard-coded plugin-specific
  pages are rejected even though `/plugins/*` remains a valid runtime URL space.
- Required PR validation now builds both physical artifacts and runs the strict gate.
- `backend/Dockerfile.core` packages only the bundled core entry point, core Prisma schema and the
  backup/migration scripts required by retained core operations.
- `frontend/Dockerfile.core` packages the isolated core workspace's standalone server rather than
  the legacy-full `.next` output.
- The core release workflow explicitly selects both core Dockerfiles, rebuilds the physical
  artifacts and runs the clean-core gate before pushing or signing image digests. A workflow
  contract enforces this boundary
  ([release evidence](./wordpress-style-core-release-image-enforcement-2026-09-26.md)).

## Verification

```text
npx tsc -p backend/tsconfig.json --noEmit
npm --prefix backend run build:core
npm --prefix frontend run test:build-core
npm --prefix frontend run build:core
node --test tools/verify-clean-core-artifact.test.js
npm run architecture:clean-core:gate
```

Results:

- Backend core webpack build: **pass**.
- Frontend core production build: **pass**, 27 generated routes.
- Artifact and image/build contract fixtures: **14 passed, 0 failed**.
- Frontend core-build fixtures: **2 passed, 0 failed**.
- Strict combined artifact gate: **PASS, 0 violations**.
- Core Docker artifact contracts: **2 passed, 0 failed**; live image build/boot remains open.
- Backend violations reduced from 23 to 0.
- Frontend violations reduced from 112 to 0.

## Remaining certification

This evidence proves LCF-005's physical UI/build composition: optional business pages and backend
symbols are absent from freshly rebuilt artifacts, rather than hidden at runtime. It does not prove
database migration/boot, Railway or self-hosted runtime health, marketplace installation,
backup/restore or core upgrade; those are separate LCF-004 and LCF-008/009 acceptance gates.

## 2026-09-28 revalidation

The backend and frontend core artifacts were rebuilt from the current worktree. The frontend
successfully generated 27 admitted routes; Attendance, Timetable, Examination, Finance, Human
Resources, Parent Portal, Learning and the other optional module routes were absent. The combined
artifact gate returned `PASS` with `Violations: 0`, and the focused scanner/build contracts passed
14/14.
