# LC2-016 — Clean core installation

Status: **complete — live CLI and web-path installation verified 2026-09-11**

## Implemented controls

- Interactive `/setup` and unattended `install-cli` share `InstallDto` and
  `InstallationService`; both create only the first `SUPER_ADMIN`, `SiteSetting`, and
  `Installation` records in one serializable transaction.
- Both paths now run the same database, storage, locale, provider, licence, and optional package
  preflight before installation writes. A blocking preflight failure produces no owner or
  installation records.
- `--migrate` selects `prisma/core/schema.prisma` for `WATTANAM_DISTRIBUTION=core` and the existing
  schema for `legacy-full`. Unknown distributions fail before Prisma runs.
- The standalone CLI deliberately does not import `PluginsModule`; therefore setup cannot trigger
  optional plugin runtime/bootstrap queries.
- Core setup exposes no local package-upload step. Optional features are obtained through the
  marketplace after the base installation is ready.
- Existing users or an existing singleton installation permanently close public setup, including
  concurrent requests.

## Offline evidence completed 2026-09-11

```text
npm test -- --runInBand src/installation             PASS (35/35)
node --test tools/core-installation-contract.test.js PASS (3/3)
npm run build (backend)                              PASS
NEXT_PUBLIC_WATTANAM_DISTRIBUTION=core npm run build
                                                      PASS (120 pages)
```

The contract test proves all direct installation persistence targets belong to the accepted
21-model core schema, the CLI module excludes the optional runtime, and the browser setup form has
no package installation input.

## Live proof completed 2026-09-11

- **Unattended:** `install-cli.js --migrate` installed a new core school, created exactly one
  `SUPER_ADMIN`, `Installation`, and `SiteSetting`, issued a working owner login, and rejected the
  repeated run.
- **Web path:** the production frontend served `/setup` with HTTP 200 and its `/api` proxy reached
  the clean core API. The interactive installation endpoint transitioned `ready -> installed`,
  produced a working owner login, and rejected a second installation with HTTP 400. The available
  automation environment did not expose a graphical browser, so the already-passing setup-form
  contract plus rendered page/proxy and real HTTP submission are the retained UI-path evidence.
- Both paths used separate disposable PostgreSQL databases. No optional business table existed.
- The live owner-login check found and fixed an implicit Prisma selection of legacy
  `User.departmentId`; email/phone login and refresh-token user loading now use an explicit
  core-safe projection.
