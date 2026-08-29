# Wattanam V2 Version 1 Support Matrix

Status: technical baseline. Commercial support windows require Product Owner approval at Gate A0.

| Component | Supported baseline | Verification |
|---|---|---|
| Node.js | 20.x LTS runtime images | API, web, and marketplace Dockerfiles |
| PostgreSQL | 16.x (Compose) and 18.x (Railway) for school installations | Full custom backup/clean-restore acceptance on PostgreSQL 16 and Railway PostgreSQL 18 |
| PostgreSQL client | 18.x in school API image | can dump supported PostgreSQL 16 and 18 servers; release restore drills remain version-matrix gates |
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

## Proposed support windows (pending Gate A0 approval)

The table above is what's technically verified today; it doesn't say for how long. These windows are an engineering proposal, not yet approved — they exist so A-005 has a concrete artifact to accept or amend rather than an open blank.

| Component | Proposed window | Rationale |
|---|---|---|
| Node.js major version | Supported until 6 months past its upstream End-of-Life date, minimum 18 months from this product's adoption of it | Matches Node's own LTS cadence (~30 months per major) without forcing a customer upgrade faster than upstream forces one |
| PostgreSQL major version | Both currently-supported majors (16.x, 18.x) stay supported until the older is within 6 months of its own upstream EOL, then a 12-month deprecation notice begins | A database major upgrade is the highest-friction upgrade a school can face; 12 months of notice plus a rehearsed adoption path (principle 2) gives real lead time |
| NestJS/Next.js/Prisma majors | Supported until the *next-but-one* major is adopted internally (i.e., always support at minimum the previous major for one full internal upgrade cycle) | Gives plugin/integration authors one full cycle of overlap instead of a hard cutover; matches the SDK's own additive-vs-breaking compatibility policy ([package-and-runtime.md](../plugins/package-and-runtime.md)) |
| Browsers | Current and previous major of Chrome/Edge/Firefox, current major of Safari, evergreen (rolling) — no fixed retirement date, tracked by the vendor's own release cadence | Matches how the vendors themselves version; a fixed date would drift out of sync with actual browser-market reality |
| Mobile (Expo/React Native) | Current Expo SDK major plus one prior major, for 12 months after a new Expo SDK major ships | Matches Expo's own upgrade cadence and app-store submission requirements, which force periodic SDK bumps regardless of this product's preference |
| Backup/restore RPO/RTO | RPO 24h, RTO 4h (matching §13.2's initial reliability targets) until a paid tier promises better | Ties this table to the one other place in the plan a concrete number is already proposed, rather than inventing a second, possibly inconsistent number |
| Critical/high vulnerability response | Patch or mitigate within 7 days of disclosure for critical, 30 days for high | Matches common industry SLA norms for a small team without a dedicated 24/7 security function; faster targets would not be credible given current staffing |
| Moderate vulnerability response | Owner assigned within 5 business days; fix scheduled within the next planned release, no later than 90 days | Matches principle 4's "owner and deadline" requirement with concrete numbers instead of leaving both open-ended |

These are proposals an engineer can defend, not commitments already made to a customer — Gate A0 either accepts them, tightens them, or replaces them, and only then do they become an enforceable SLA.
