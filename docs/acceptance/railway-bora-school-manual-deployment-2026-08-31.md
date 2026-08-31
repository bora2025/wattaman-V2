# Railway Bora School manual deployment evidence

Date checked: 2026-08-31

## Observed deployment

- Railway project: `Wattanam - Bora School`
- Project ID: `a5117967-5491-48d1-9cc1-69062ba973cb`
- Public gateway: `https://gateway-production-cc8b.up.railway.app`
- Private application services: `api`, `web`
- Managed database: `Postgres` (PostgreSQL 18 image)
- Persistent API volume: `/data`

Railway CLI inspection on 2026-08-31 reported `SUCCESS` for PostgreSQL, API, web, and gateway, with one running replica of each and both volumes in `READY` state. The project was originally created and configured through explicit Railway CLI commands, then the three application directories were uploaded with `railway up`.

## What this proves

- A real one-project-per-school topology can be created in Railway.
- PostgreSQL, API, web, gateway, private service addressing, a public gateway domain, and persistent API storage operate together in a real project.
- This is real cloud deployment evidence, not a local or synthetic topology.

## What this does not prove

- `tools/provision-railway-school.js --execute` was **not** used; the sequence was performed manually. B-006 automation therefore remains in progress.
- Images were uploaded from the repository rather than provisioned from the B-005 signed, digest-pinned release blueprint.
- No replacement, backup/restore, core-upgrade, custom-domain, or automated browser-install drill was performed against this project.
- This project therefore does not close Gate B2 by itself.
