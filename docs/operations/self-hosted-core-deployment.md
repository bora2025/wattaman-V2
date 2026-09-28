# Self-hosted Wattanam core deployment

Use this procedure only with an approved core beta or stable release. Existing legacy-full schools
must use the existing-school upgrade runbook instead of pointing an old database at this compose
file.

## Required inputs

Create a private environment file outside source control containing:

- `POSTGRES_IMAGE`, `API_IMAGE`, `WEB_IMAGE`, `GATEWAY_IMAGE`: exact `image@sha256:<64 hex>` values
  from one signed Wattanam release evidence bundle;
- `APP_VERSION`: the matching release version;
- unique `POSTGRES_PASSWORD` and `JWT_SECRET` values;
- the public HTTPS `APP_URL`;
- `MARKETPLACE_URL`, trusted publisher keys and the core update repository key; and
- optional retention, port and storage-provider settings.

Never mix digests from different release evidence bundles.

## Preflight and start

1. Verify signatures and provenance for all three Wattanam image digests.
2. Verify the environment file is readable only by the deployment operator.
3. Render the configuration with `docker compose --env-file <private-file> -f docker-compose.core.yml config`.
4. Confirm every rendered image contains `@sha256:`, both application services say `core`, only
   gateway publishes a host port, and the `postgres_data` and `api_data` volumes exist.
5. Pull without rebuilding: `docker compose --env-file <private-file> -f docker-compose.core.yml pull`.
6. Start: `docker compose --env-file <private-file> -f docker-compose.core.yml up -d`.
7. Wait until PostgreSQL, API, web and gateway are healthy.
8. Open the gateway URL, complete first-owner setup and MFA, and verify no optional business menu
   appears.

## Backup and lifecycle proof

Run the operations-profile backup before every plugin or core update:

`docker compose --env-file <private-file> -f docker-compose.core.yml --profile operations run --rm backup`

For certification, link the Marketplace, install one free and one paid plugin, exercise the
business workflow, disable, update, remove and reinstall with data retained, restore the recovery
set into a separate clean project, and upgrade to the next digest-pinned core release. Record image
digests, plugin versions, reconciliation output and rollback outcome.

Do not delete named volumes during an uninstall or routine rollback.
