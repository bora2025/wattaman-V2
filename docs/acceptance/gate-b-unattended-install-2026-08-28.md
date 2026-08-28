# Gate B Unattended Installation Evidence — 2026-08-28

Scope: B-011 unattended fresh installation against a disposable Railway PostgreSQL 18 service.

## Contract controls

- `INSTALL_NON_INTERACTIVE=true` is mandatory.
- `INSTALL_CONFIRM_SLUG` must exactly match the school slug.
- Browser and CLI inputs share `InstallDto` validation.
- Password comes from one sealed file or injected variable, never both.
- Production password-file paths must be absolute.
- Output excludes owner name, owner email, password, hash, and database URL.
- `--migrate` applies only the checked-in Prisma migrations.
- `--use-install-database-url` requires a distinct `INSTALL_DATABASE_URL`, leaving the live installation connection unchanged.

## Railway execution

The CLI ran inside the Core API image against a clean disposable PostgreSQL 18 service. It applied all four checked-in migrations and returned:

```json
{"state":"installed","schoolSlug":"unattended-test-school","coreVersion":"0.1.0"}
```

The installation identifier and timestamp were generated but are omitted from this durable evidence because they are not needed for future operations. A second identical command returned `Installation is already initialized or requires legacy adoption`, proving the shared singleton/user lock.

All 11 temporary installer variables—including the generated synthetic password and isolated database reference—were deleted after the drill. The disposable database service was deleted; Railway may retain its volume during the provider soft-deletion window.

## Local verification

```text
install-cli.spec.ts: 6 tests passed
backend production build: 156 files compiled
```

B-011 is verified for the guarded CLI journey. B-004 browser automation and legacy adoption remain separate requirements.
