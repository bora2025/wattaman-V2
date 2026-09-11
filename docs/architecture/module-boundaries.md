# Core/Plugin/Shared/Deprecated Module Classification (A-007)

Status: **accepted target classification.** Product owner Bora accepted ADR-0009–0019 on
2026-09-11. ADR-0009 replaces DEC-004: core is the permanent platform foundation, while academic
structure, attendance and other school business capabilities become official plugins. The checked
[ownership manifest](./ownership-manifest.json) is authoritative for individual files, routes,
models and split plans.

## What the columns mean

- **CORE** — stays in `backend/src` permanently as platform infrastructure required by every school.
- **SHARED** — lives in `backend/src`, but is deliberately exposed to plugins as SDK surface (a capability, like `notifications.send` wrapping `NotificationService`) rather than being plugin-exclusive. Removing it would break both core features and any plugin using that capability.
- **OFFICIAL PLUGIN TARGET** — business functionality currently compiled into the application that
  must move to its accepted official-plugin owner through the staged extraction plan.
- **DEPRECATED** — superseded or slated for removal. None found in this pass — noted honestly rather than manufacturing an entry to fill the category.

## The proven extraction playbook (from C-004)

Moving a PLUGIN-ELIGIBLE module to `plugins/<id>/` now has a working precedent, not just a theory: namespaced migrations replacing the core tables, a thin Prisma-free proxy controller preserving the old URLs (or a frontend update, if starting fresh), a `directory.read`-style capability if the feature needs cross-table recipient resolution, and a `legacy-adopt.js`-shaped backup→copy→verify→grant cutover script. See `docs/acceptance/gate-c-announcements-cutover-2026-08-28.md` for the full worked example and `docs/plugins/package-and-runtime.md` for the SDK contract any extraction would build against.

## Classification

| Module (`backend/src/*`) | Class | Why |
|---|---|---|
| `auth` | CORE | Generic identity, authentication, sessions, roles and recovery per ADR-0010 |
| `installation`, `backup`, `audit` | CORE | Platform installation, safety and compliance infrastructure |
| `attendance`, `session-config`, `holidays`, `card-aliases` | OFFICIAL PLUGIN TARGET | `wattanam.attendance`; staff and lesson/course attendance split per ADR-0019 |
| `classes`, `study-years`, `departments`, `class-registrations` | OFFICIAL PLUGIN TARGET | `wattanam.academic-management` per ADR-0010 |
| `plugins` | CORE | Plugin host and lifecycle infrastructure |
| `database`, `config`, `common`, `health` | CORE | Infrastructure every module (core or plugin-supporting) depends on |
| `site-settings` | CORE | Installation-wide configuration, same tier as `installation` |
| `marketplace` | CORE | The school-side marketplace client (entitlement cache, installation registration) — part of the "plugin host" ecosystem DEC-004 names, not itself a feature |
| `directory` | SHARED | Generic identity directory; academic roster resolution moves behind Academic Management contracts |
| `notification` | SHARED | Own core callers (e.g. absence alerts) plus the `notifications.send` capability plugins use |
| `notification-preference` | SHARED | Per-user channel preferences read by both core notification paths and plugin-driven sends |
| `parent` (`MessagesGateway` specifically) | SHARED | The realtime Socket.IO room infrastructure (`user-<id>` rooms) is reused by the `realtime.notify` capability; the parent-teacher messaging *feature* built on top of it is itself PLUGIN-ELIGIBLE (see below) |
| `assignments` | PLUGIN-ELIGIBLE | Homework/assignment tracking — a distinct LMS feature, not "academic structure" in the identity/roster sense |
| `bus` | PLUGIN-ELIGIBLE | Transport routes/stops/live location — optional feature, not core |
| `card-templates` | PLUGIN-ELIGIBLE | Physical ID card visual design — cosmetic, optional |
| `class-registrations` | PLUGIN-ELIGIBLE | Public self-registration marketing/intake flow |
| `courses` | PLUGIN-ELIGIBLE | Full LMS (lessons, enrollment, quizzes-in-course) — substantial, self-contained subsystem |
| `exam` | PLUGIN-ELIGIBLE | Formal exam/question-bank/attempt tracking |
| `fees`, `salary`, `staff-cv` | PLUGIN-ELIGIBLE | Finance/HR — not attendance, not identity, not academic structure |
| `h5p` | PLUGIN-ELIGIBLE | Interactive-content standard integration — clearly optional/rich-content |
| `posts` | PLUGIN-ELIGIBLE | Lightweight content/CMS feature |
| `reports` | PLUGIN-ELIGIBLE | Analytics/reporting views over other features — naturally follows whichever of its source features move |
| `scoring` | PLUGIN-ELIGIBLE | Grade/scoresheet management — assessment feature, not core roster/attendance |
| `timetable` | PLUGIN-ELIGIBLE | Scheduling subsystem (subjects/classrooms/teacher timetables) |
| `parent` (messaging feature, distinct from the gateway noted above) | PLUGIN-ELIGIBLE | Parent-teacher direct messaging is a feature built *on* the shared realtime infrastructure, not the infrastructure itself |
| `announcements` | CORE | Not a feature module anymore — this is the ~40-line Prisma-free proxy controller C-004 left behind to preserve old URLs after moving the real feature to `plugins/announcements/`. It's the post-extraction remnant, not something further extractable |
| `observability` | CORE | Structured request logging and the `/metrics` endpoint — infrastructure every module (core or plugin-supporting) runs under, same tier as `database`/`config`/`common`/`health` |
| `storage` | SHARED | The `StorageBackend` interface (local/S3/dual-write) backing `PluginStorageService` — own core caller (plugin file storage today) plus the same SDK-exposed-capability shape as `directory`, extended to cover binary data |
| `updates` | CORE | Core/plugin update orchestration (preflight, backup, maintenance mode, health gate) — the platform's own upgrade mechanism, which by definition can't be a plugin without a way to update itself |
| — | DEPRECATED | None identified in this pass |

## Target workspace boundaries

This repo gained its first real standalone-package convention this session (`packages/plugin-sdk`, `packages/plugin-cli` — C-008), which clarifies where things belong:

- **`packages/`** is for publishable, framework-independent *developer tooling* (typed SDK, CLI, harness) — never business-domain code. Nothing in the classification above moves here.
- **CORE and SHARED** infrastructure stays in `backend/src` permanently; business-specific callers
  and data are split out according to the ownership manifest.
- **OFFICIAL PLUGIN TARGET** and the older table label **PLUGIN-ELIGIBLE** both mean accepted
  extraction work. Their destination is `plugins/<publisher>.<name>/`, following the announcements
  precedent and using the public SDK, CLI and certification workflow without an internal shortcut.

## Change rule

Same as `technical-inventory.md`: a new module's classification is decided when it's created, not retrofitted later. Update this table in the same change that adds a new `backend/src/*` directory.
