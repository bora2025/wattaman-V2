# Official Update Repository and Marketplace Foundation

## Boundary

`apps/marketplace-api` is a separately deployed central service. It has its own PostgreSQL database, administrator credential, signing key, and artifact volume. It never connects to a customer school's database and receives no student, attendance, grade, fee, staff, message, or location data.

The current implementation is the official-repository foundation, not an open third-party marketplace. Publication is restricted to an operator bearer token. The schema reserves auditable records for accounts, publisher verification, review, orders, idempotent payment events, installation registrations, entitlements, downloads, and advisories. Customer authentication, payment-provider webhooks, offline entitlement-token issuance, publisher self-service, paid publication, and public submissions are intentionally not enabled yet. The API rejects `paid=true` so a commercial artifact cannot accidentally become a public download before entitlement enforcement exists.

## Trust model

Two independent Ed25519 trust layers are required:

1. A publisher key signs `checksums.json` inside every `.wtp` package. The repository accepts only keys belonging to a verified publisher.
2. An offline-controlled repository key signs the canonical JSON update index. Every school pins its public key and expected key ID.

Downloading over HTTPS is necessary but not sufficient. A school verifies the signed index, restricts artifact URLs to the configured repository origin, streams with a size bound, compares SHA-256, and then runs the full publisher-signature/package verifier again.

Never use the repository signing key as a publisher key. Keep private keys outside Git and outside container images.

## Local deployment

Prerequisites are Docker Engine with Compose v2 and two distinct Ed25519 key pairs. Generate keys outside the repository or use the existing helper:

```bash
cd backend
npm run plugin:keygen -- ../secrets/repository-signing
npm run plugin:keygen -- /secure/wattanam-publisher
```

Set `MARKETPLACE_POSTGRES_PASSWORD`, `MARKETPLACE_PUBLIC_BASE_URL`, `MARKETPLACE_ADMIN_TOKEN`, and `METADATA_SIGNING_KEY_ID`, then start the independent profile:

```bash
docker compose -f infrastructure/marketplace/docker-compose.yml up -d --build
curl --fail http://localhost:3010/health/ready
```

The readiness endpoint checks PostgreSQL. Artifact bytes persist in `marketplace_artifacts`; marketplace records persist in `marketplace_database`.

## Railway deployment

Create a Railway project dedicated to the central marketplace. Do not place it in a customer's school project.

1. Add a managed PostgreSQL service.
2. Add a service from this repository and set its config file to `apps/marketplace-api/railway.json` (or root directory `apps/marketplace-api` with the equivalent Dockerfile settings).
3. Attach a persistent volume at `/data/artifacts`.
4. Set `DATABASE_URL` from PostgreSQL, `PUBLIC_BASE_URL` to the final HTTPS marketplace domain, `MARKETPLACE_ADMIN_TOKEN` and `PAYMENT_WEBHOOK_SECRET` to separate random values of at least 32 characters, `METADATA_SIGNING_PRIVATE_KEY` and `ENTITLEMENT_SIGNING_PRIVATE_KEY` to independently generated multiline Ed25519 PKCS8 PEM secrets, distinct key IDs in `METADATA_SIGNING_KEY_ID` and `ENTITLEMENT_SIGNING_KEY_ID`, and `ARTIFACT_STORAGE_PATH=/data/artifacts`.

The initial online adapter accepts `POST /v1/payments/webhooks/online-hmac-v1`. Providers sign the exact request bytes as HMAC-SHA256 over `<unix-seconds>.<raw-body>` and send `x-wattanam-signature: t=<unix-seconds>,v1=<lowercase-hex>`. Signatures outside five minutes are rejected. A browser return URL never settles an order.
5. Generate a Railway domain, then add the official custom domain and update `PUBLIC_BASE_URL` if necessary.
6. Confirm `/health/live`, `/health/ready`, and `/v1/repository-key` before publishing.

The container runs `prisma migrate deploy` before starting. Never point `DATABASE_URL` at a school database.

## Bootstrap an official publisher

Register the reviewed public publisher key once:

```bash
curl --fail-with-body -X POST "$MARKETPLACE_URL/admin/v1/publishers" \
  -H "Authorization: Bearer $MARKETPLACE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @publisher.json
```

Example `publisher.json`:

```json
{
  "slug": "wattanam",
  "displayName": "Wattanam Official",
  "keyId": "official-plugin-2026",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

Verify the key fingerprint with a second operator before registration. The admin token is an initial operations control, not the future publisher identity system.

## Publish an immutable plugin release

First create and sign the package with the publisher key:

```bash
cd backend
npm run plugin:pack -- --source ../plugins/announcements --private-key /secure/wattanam-publisher/plugin-signing-private.pem --key-id official-plugin-2026 --out /tmp/wattanam.announcements-1.0.0.wtp
```

Then publish it:

```bash
curl --fail-with-body -X POST "$MARKETPLACE_URL/admin/v1/plugin-releases" \
  -H "Authorization: Bearer $MARKETPLACE_ADMIN_TOKEN" \
  -F "channel=STABLE" \
  -F "paid=false" \
  -F "changelog=Initial official release" \
  -F "package=@/tmp/wattanam.announcements-1.0.0.wtp;type=application/vnd.wattanam.plugin+zip"
```

Publication fails if the publisher is not verified, a key is revoked or belongs to another publisher, the manifest is invalid, payload files differ from the checksum list, the signature is invalid, or the artifact/version already exists. Artifact paths are derived only from SHA-256 and are never accepted from the request.

## Publish core metadata and advisories

Core releases reference immutable container digests, not mutable tags. Post JSON to `/admin/v1/core-releases` containing semantic `version`, `channel`, `nodeRange`, `postgresRange`, digest-pinned `apiImage`, `webImage`, and `gatewayImage`, plus `releaseNotes` and optional `migrationNotes`.

Post advisories to `/admin/v1/advisories`. Advisory IDs use `WAT-YYYY-NNNN`, and affected versions must be a valid semantic-version range. Schools match advisories locally against installed versions; installation identifiers are not required for this check.

## Connect a school

Copy the reviewed repository public key—not its private key—to the school secret mount as `secrets/update-repository/plugin-signing-public.pem`. Configure:

```text
MARKETPLACE_URL=https://marketplace.wattanam.example
UPDATE_CHANNEL=stable
UPDATE_REPOSITORY_KEY_ID=official-repository-2026
```

Also keep the official publisher public key in `PLUGIN_TRUSTED_KEYS_FILE`; these keys serve different purposes. Restart the API and open **Admin → Plugins → Official repository**. If `MARKETPLACE_URL` is empty, update checks remain explicitly disabled and school operation is unaffected.

## Update and recovery procedure

Plugin update:

1. Create and verify a current database backup.
2. Read the changelog, permissions, dependency changes, and advisories.
3. Deactivate the plugin. Existing data is preserved.
4. Install the selected repository release. The old versioned files remain available for recovery.
5. Apply reviewed plugin migrations when that runtime capability is enabled; this foundation currently refuses to claim migration support.
6. Activate and run its health/functional checks.
7. If activation fails, leave it inactive, retain data, and restore the database only if a migration changed it.

Core update:

1. Do not update when `blockedByActivePlugins` is non-empty.
2. Back up PostgreSQL, uploaded files, plugin files, configuration, and the exact current image digests.
3. Review migration notes and pull the new digest-pinned images.
4. Run `prisma migrate deploy`, start the new containers, and confirm readiness, version, login, and critical workflows.
5. On application failure before an irreversible migration, redeploy the previous digests. On data failure, restore into a clean database using `docs/operations/backup-and-restore.md` rather than editing migration history.

## Key rotation and incident response

- Publisher key: add a new publisher key, publish packages under the new key, distribute it to school plugin trust stores, then revoke the old key. Existing installed packages remain auditable.
- Repository key: ship the new public key/key ID to schools through a trusted core release before signing indexes only with the new key. The current single-signature contract does not support an unannounced rotation.
- Compromised plugin: withdraw the release in the database through an audited operator procedure, publish an advisory immediately, then publish a fixed higher version. Never replace bytes at an existing SHA-256 URL.
- Compromised repository key: stop publication, rotate the key out of band, preserve the database/artifact volume for investigation, and require schools to update their pinned trust anchor. TLS alone is not an acceptable recovery shortcut.

## Current acceptance evidence

- Marketplace TypeScript build passes.
- Package publication verifier tests cover valid, tampered, extra-file, wrong-signature, and cross-publisher-key cases.
- Repository metadata has a canonical Ed25519 signature test.
- School update-client tests cover signed discovery, compatibility blockers, local advisory matching, verified download/install, and checksum mismatch rejection.
- Frontend production build includes repository state, advisories, plugin updates, and core compatibility warnings.

PostgreSQL migration application, artifact-volume restart, and the repository-to-school signed download were verified in the 2026-08-27 foundation drill. Production key custody, deployment, disaster recovery, release promotion, advisory, and failed-update recovery remain Gate D requirements in the [master execution plan](../platform-master-execution-plan.md).
