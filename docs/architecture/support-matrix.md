# Wattanam V2 Version 1 Support Matrix

Status: technical baseline. Commercial support windows require Product Owner approval at Gate A0.

| Component | Supported baseline | Verification |
|---|---|---|
| Node.js | 20.x LTS runtime images | API, web, and marketplace Dockerfiles |
| PostgreSQL | 16.x for school installations | Compose, migrations, backup/restore acceptance |
| PostgreSQL client | 16.x in school API image | backup/restore tool compatibility |
| NestJS | 10.x | backend build and tests |
| Prisma | 5.22.x | both schema migrations and generated clients |
| Next.js | 14.x | standalone production build |
| Expo | 55.x | mobile project baseline; release certification pending B-014 |
| Caddy | 2.10 | gateway image and Railway smoke test |
| Docker | Linux containers with Compose v2 | clean Compose acceptance evidence |
| Railway | one project per school, private service networking | 2026-08-28 Core reference smoke test |
| Browsers | current and previous major Chrome, Edge, Firefox; current Safari | certification pending browser E2E matrix |
| Server OS | supported Docker Engine on x86_64 Linux | self-hosted certification pending Gate B |

Support principles:

1. Production artifacts pin major runtimes; release evidence records exact digests and lockfiles.
2. A database major upgrade requires backup/restore and legacy-upgrade rehearsal.
3. Browser or mobile support is not claimed until critical journeys pass on that target.
4. Critical/high vulnerabilities block a release. Moderate findings require an owner and deadline.
5. Version removal requires notice, migration instructions, and a tested upgrade path.
