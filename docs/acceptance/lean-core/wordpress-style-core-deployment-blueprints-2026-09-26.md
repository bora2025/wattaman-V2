# WordPress-style core deployment blueprint enforcement

Date: 2026-09-26  
Status: Railway and self-hosted blueprints implemented and contract-tested; live drills pending

## Railway blueprint

The digest-pinned school release renderer now sets `WATTANAM_DISTRIBUTION=core` on API and web and
`NEXT_PUBLIC_WATTANAM_DISTRIBUTION=core` on web. The verifier rejects a rendered release if either
service loses that boundary. This complements the core-image release gate; neither image identity
nor an ambient runtime default can silently switch a new core school to legacy-full.

## Self-hosted blueprint

`docker-compose.core.yml` is a separate production-oriented compose file. It intentionally does
not change `docker-compose.yml`, which remains the migration-safe legacy-full path for existing
schools. The core file:

- accepts only externally supplied PostgreSQL, API, web and gateway images;
- requires all four image values instead of building mutable local source;
- explicitly sets the API, web and backup jobs to the core distribution;
- exposes only the gateway;
- waits for PostgreSQL, API and web health checks;
- retains the PostgreSQL database and the entire API `/data` tree in named volumes; and
- reuses the exact API image for schema-neutral backup operations.

Operators must provide digest-pinned `NAME@sha256:...` image values. The checked-in contract proves
the variable boundary; the live drill must additionally inspect the resolved Compose configuration
and image IDs before startup.

## Automated evidence

`tools/core-deployment-blueprint-contract.test.js`:

- rejects local builds or a legacy-full marker in the core compose file;
- requires every image input and both persistent storage mounts;
- requires explicit core distribution variables;
- renders a synthetic digest-pinned Railway school release; and
- runs the production verifier over that result.

Six combined deployment/release/Docker contract checks pass locally.

## Remaining acceptance gap

No container was started by this evidence. A signed beta must be published, then the exact digests
must complete clean database boot, installation, marketplace link, free and paid plugin lifecycle,
backup/restore and core upgrade on both Railway and self-hosted Docker.
