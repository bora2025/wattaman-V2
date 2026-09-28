# WordPress-style core runtime dependency security — 2026-09-26

## Scope

This record covers the dependency graph and packaged contents of the physical lean-core API and
web runtime artifacts. It is local release-candidate evidence, not a substitute for a signed image
scan, penetration test, hosted CI run, or formal security approval.

## Finding and remediation

The first production-only API audit found two high and three moderate findings:

- Multer 2.2.0 exposed three remotely triggerable denial-of-service conditions and one low-severity
  upload-limit race through `@nestjs/platform-express`;
- `qs` 6.15.3 exposed two moderate denial-of-service conditions; and
- ExcelJS resolved UUID 8.3.2, which was affected by a moderate buffer-bounds advisory.

The remediation keeps compatible application behavior while avoiding npm's suggested ExcelJS
downgrade:

- Nest common/core/platform-express are pinned to 11.2.6;
- Multer is constrained to 2.4.0 and `qs` to 6.16.0;
- only ExcelJS's transitive UUID is constrained to 11.1.1; and
- an Excel workbook write/load round trip verifies the scoped UUID override.

Prisma was moved from development-only metadata to production dependencies because the container
deliberately executes `prisma migrate deploy` before startup. `backend/Dockerfile.core` now creates
a separate `production-dependencies` stage with `npm ci --omit=dev`, generates only the reduced
core Prisma client there, and copies that tree into the runner. The runner no longer receives the
builder's compilers, test tools, linter, Nest CLI, or legacy Prisma schema.

## Verification

The following checks passed on 2026-09-26:

```text
backend npm audit --omit=dev --audit-level=moderate: 0 vulnerabilities (317 production dependencies)
frontend npm audit --omit=dev --audit-level=moderate: 0 vulnerabilities (230 production dependencies)
core API webpack build: passed
ExcelJS workbook write/load round trip: passed, 6,429-byte workbook
plugin security/storage/UI suites: 41/41 passed
core Docker artifact contract: 3/3 passed
production-dependencies Docker install: 316 packages, 0 vulnerabilities
physical core API image build: passed
fresh hardened-image topology boot and installation smoke: passed
repository tooling suite: 76/76 passed
```

Read-only checks inside `wattanam-api-core:security-gate` confirmed:

- Prisma migration CLI is present;
- the reduced generated client is present at `/app/generated/core-client`;
- TypeScript, Jest and `@nestjs/cli` are absent; and
- `/app/prisma/schema.prisma` is absent.

The first topology boot exposed a packaging regression after migrations completed: bundled code
still resolved `@prisma/client` through its conventional `.prisma/client` location, while the
reduced client existed only in `/app/generated/core-client`. The production-dependency stage now
copies that same reduced generated client into `node_modules/.prisma/client`; it does not generate
or copy the legacy client. A fresh retry applied all three core migrations, made API, web and
gateway healthy, passed `tools/core-deployment-smoke.js`, installed `core-smoke-school`, and kept
the optional Attendance, Timetable and Examination pages absent. All disposable containers,
network and volumes were removed after the drill.

PR validation now rejects moderate-or-higher production dependency findings for both the backend
and frontend. Development-only findings remain visible during the disposable builder install, but
that dependency tree is not copied to the runtime image.

The core release workflow separately scans the final immutable API, web and gateway digests with
Trivy. Any high or critical OS/library finding—including one without a published fix—blocks
signing and marketplace beta publication. Its three JSON reports are retained with the release
evidence artifact, and the workflow contract enforces scan order and fail-closed settings.

## Remaining production security gates

- Retain the first green hosted CI run with the stricter audit threshold.
- Complete the first hosted release run and retain its signed multi-architecture digests, SBOMs,
  provenance and three scan reports.
- Run authenticated application security testing against the released topology, including bounded
  multipart upload abuse cases.
- Obtain the independent security/privacy approval required by the final release gate.
