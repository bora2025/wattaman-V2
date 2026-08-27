# Foundation Runtime Acceptance — 2026-08-27

## Scope

This drill used isolated Docker Compose projects and volumes, PostgreSQL 16, the production API/web/gateway images, a temporary publisher key, and a distinct temporary repository-signing key. No private key was written into the repository.

## Results

| Check | Result |
|---|---|
| Clean release stack | PostgreSQL, API, web, and gateway became healthy on port 3100 |
| Migrations | Four checked-in Prisma migrations applied through `prisma migrate deploy` |
| First installation race | Exactly one installation and one `SUPER_ADMIN`; later setup returned HTTP 409 |
| Persistence | Installation identity and owner authentication survived API/web/gateway restart |
| Diagnostics | Owner-only endpoint reported ready database, installation, version, and migration state |
| Backup | PostgreSQL 16 custom archive and SHA-256 manifest created successfully |
| Restore | Separate empty database restored the same installation ID/slug, one owner, and four completed migrations |
| Signed plugin | Inspection, exact SHA confirmation, install, recovery backup, namespaced migration, activation, routes, settings, jobs, navigation, permissions, page descriptor, restart reload, and safe mode passed |
| Data preservation | Plugin removal preserved migration history, settings, job definition, and namespaced table; repository reinstall restored the runtime with its previous setting |
| Official repository | Independent PostgreSQL migration, publisher registration, immutable artifact publication, signed index, restart persistence, school-side signature verification, bounded download, checksum verification, and package re-verification passed |

## Defects found and corrected

- The API image originally installed PostgreSQL 15 client tools against PostgreSQL 16. It now installs the pinned PostgreSQL 16 client from the official PGDG repository.
- Failed dump commands could leave `.dump.partial` files because the database helper exits immediately. An exit cleanup now removes the active partial archive.
- The marketplace root build context excluded `apps`, making its Dockerfile unreleasable. The ignore rule was corrected.
- The marketplace Alpine image lacked OpenSSL required by Prisma. OpenSSL is now present in build and runtime stages.
- File-based plugin/update/repository keys previously prevented inline Railway secrets when an optional mount was absent. Each reader now falls back to its inline secret only when the configured file does not exist.

## Remaining gates

- Rehearse baseline adoption against a copy of a pre-migration Wattanam database.
- Run a deliberately failing plugin SQL migration against PostgreSQL and prove transaction rollback plus recovery restore.
- Complete the legacy announcements business-data cutover into the reference plugin.
- Commerce, entitlements, payment integration, and third-party publishing remain outside the verified official-repository foundation.
