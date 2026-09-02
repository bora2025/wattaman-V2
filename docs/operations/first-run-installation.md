# First-Run Installation

## Status

The backend installation contract and browser setup wizard are implemented. A full browser-to-PostgreSQL end-to-end test remains pending.

## Endpoints

### Check installation status

```http
GET /installation/status
```

Possible states:

- `ready`: no installation record and no users exist; setup may proceed.
- `installed`: setup is locked and safe installation metadata is returned.
- `legacy_unadopted`: users already exist but there is no installation record; public setup is locked until an explicit legacy-adoption procedure is completed.

### Complete a fresh installation

```http
POST /installation/install
Content-Type: application/json
```

Example body:

```json
{
  "schoolName": "Angkor International School",
  "schoolSlug": "angkor-international-school",
  "locale": "en-KH",
  "timezone": "Asia/Phnom_Penh",
  "currency": "KHR",
  "ownerName": "School Owner",
  "ownerEmail": "owner@school.example",
  "ownerPassword": "a-unique-password-with-12-or-more-characters"
}
```

The endpoint is publicly reachable only because a fresh installation has no user who can authenticate. It is rate-limited and performs its final safety checks inside a serializable database transaction.

The transaction:

1. Confirms no installation record exists.
2. Confirms no user exists.
3. Hashes and creates the first `SUPER_ADMIN` owner.
4. Sets the school name in site settings.
5. Creates the singleton installation identity and lock.

Concurrent attempts cannot create multiple owners. A unique or serialization conflict returns an installation conflict instead of overwriting the first installation.

## Unattended Fresh Installation

The CLI uses the same DTO, timezone check, password hashing, serializable transaction, and singleton lock as the HTTP installer. Build the backend, provide variables through the deployment secret mechanism, then run:

```bash
INSTALL_NON_INTERACTIVE=true \
INSTALL_SCHOOL_NAME='Angkor International School' \
INSTALL_SCHOOL_SLUG='angkor-international-school' \
INSTALL_CONFIRM_SLUG='angkor-international-school' \
INSTALL_LOCALE='en-KH' \
INSTALL_TIMEZONE='Asia/Phnom_Penh' \
INSTALL_CURRENCY='KHR' \
INSTALL_OWNER_NAME='School Owner' \
INSTALL_OWNER_EMAIL='owner@school.example' \
INSTALL_OWNER_PASSWORD_FILE='/run/secrets/owner-password' \
npm run install:unattended -- --migrate
```

`--migrate` applies only checked-in migrations before installation and is appropriate for a fresh database. Omit it when the deployment release step already ran migrations. `INSTALL_CONFIRM_SLUG` must exactly match the requested slug. In production, the password-file path must be absolute. `INSTALL_OWNER_PASSWORD` is supported for secret-injected one-shot environments, but never place it in shell history, source control, logs, or reusable templates. The command refuses ambiguous file-plus-variable password sources and prints only installation identity, slug, version, timestamp, and final state.

For an isolated certification database inside an existing operations container, leave production `DATABASE_URL` unchanged, set `INSTALL_DATABASE_URL` to the disposable database, and add `--use-install-database-url`. Remove the reference immediately after the drill.

## Security Properties

- No default administrator email or password is used.
- The owner password is hashed with bcrypt cost 12.
- Owner email is normalized to lowercase.
- Timezone must be a valid IANA timezone.
- Locale, currency, slug, and input lengths are validated.
- Password hashes are never returned.
- Once any user exists, public fresh installation is refused.
- Installation identity is generated in PostgreSQL and is unique.

## Fresh Railway School Flow

For the concrete, tested Railway CLI commands (project/service creation, exact environment
variables, volumes, and the platform-specific gotchas hit deploying this way) see
[railway-deployment-guide.md](./railway-deployment-guide.md), which also covers deploying the
marketplace itself and linking a school's admin panel to it. Summary:

1. Create the school project (`api` + `web` + `gateway` + `Postgres`).
2. Provision the new PostgreSQL service.
3. Generate unique JWT and encryption secrets.
4. Deploy — migrations run automatically as part of each service's start command.
5. Confirm `GET /installation/status` (via the gateway) returns `ready`.
6. Connect and verify the customer's domain.
7. Submit the installation form over HTTPS (this document's sections above).
8. Confirm status changes to `installed`.
9. Sign in with the new owner account.
10. Enable and verify backups.
11. Link the installation to the marketplace from `/admin/plugins` if the school wants to browse and buy plugins directly.

## Legacy Installations

Do not use the fresh installer for an existing school. If status is `legacy_unadopted`, follow the fingerprint, backup, comparison, and guarded command-line adoption process in [database-migrations.md](./database-migrations.md). Adoption reuses an existing `SUPER_ADMIN`; it never creates or resets a legacy credential.

## Remaining Work

- Terms/license acceptance fields if required by the commercial model.
- Storage and email preflight checks.
- Initial plugin selection.
- Two sanitized real legacy snapshots and their adoption comparison reports.
- Browser-to-PostgreSQL end-to-end automation. PostgreSQL concurrency was verified in the 2026-08-27 foundation acceptance drill.
