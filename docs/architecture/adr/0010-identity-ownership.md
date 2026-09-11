# ADR-0010: Identity Ownership

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-003**.

## Context

`User` carries both the login account and person details that belong to school domains, and `Student` and `Class` are read from all over the codebase:

- The `directory.read` capability plugins use (`backend/src/directory/directory.service.ts:59-88`) resolves audiences from the `Class` and `Student` tables. If Academic Management owns those tables, core's directory depends on a plugin.
- Deleting a user (`auth.service.ts:310-331`) directly deletes that user's attendance, staff attendance, fees, salary, messages, announcements and exams: tables in five future plugins.
- `User.department` is a foreign key to `Department`, an Academic Management table.
- The audit screen resolves names by reading seven feature tables (`audit.controller.ts:393-450`).
- Direct messaging reads `Student` to find parents (`parent/messages.service.ts:32-153`).

The plans agree on the split between accounts and profiles, but neither says where the **guardian relationship** lives: which account is the parent of which student. Today it is `Student.parentId`. Attendance (absence alerts), Finance (fee reminders), Transportation (parent tracking), Communication and Parent Portal all need it, so where it lives decides which plugins become mandatory.

## Decision

1. **Core owns the person as an account**: identity, name, login identifiers, contact endpoints (email, phone), credentials, MFA and sessions, organization membership and generic role assignments. Role names such as STUDENT or TEACHER remain core access roles; a role is not a profile.
2. **Core also owns the guardian relationship**, as a generic link between two accounts with no academic data on it. Parent Portal owns the request and approval workflow (`ParentLinkRequest`) and writes the link through a core contract. Any plugin can then notify a student's guardians with only core present.
3. **Academic Management owns** student academic profiles (student number, admission, enrollment), classes and class membership, study years, departments, and teachers' teaching assignments.
4. **Human Resources owns** employee profiles: CV, education, work experience, certifications and salary.
5. **Core exposes no academic model after cutover.** `directory.read` keeps its current shape for SDK 1.x. It answers class audiences by delegating to Academic Management's versioned roster contract when a compatible version is active, and with an explicit "unavailable" error when it is not. SDK 2.0 removes the academic parts ([ADR-0017](./0017-compatibility-windows.md) sets the window).
6. **No core table holds a foreign key to a plugin table.** `User.department` becomes a department assignment owned by Academic Management.
7. **Deleting an account publishes `identity.user.deleted.v1`** through durable events ([ADR-0015](./0015-cross-plugin-event-consistency.md)). Each plugin then deletes or anonymizes its own records under its declared retention rule; core no longer deletes them.
8. **Audit shows plugin resources through a name-resolver contract** the owning plugin registers, and shows the stored ID when that plugin is absent.

Required proof (lean-core plan 12.3): user administration works in a core-only installation, and dependent plugins resolve rosters only when a compatible Academic Management version is active.

## Consequences

- A core-only school can manage accounts, roles and guardian links, and send notifications, with no plugin installed.
- `Student.parentId` moves to a core relationship table during MP-2. `Student` is child data in the data classification, so the move goes through the adoption toolkit with reconciliation, not a plain migration.
- The announcements plugin uses `directory.read` for class audiences; point 5 keeps it working without a rebuild.
- Account deletion becomes eventually consistent across plugins. The account disappears at once and plugin data follows as each consumer processes the event; a stuck consumer shows up in the dead-letter view rather than silently leaving records behind.

## Alternatives considered

- **Guardianship in Academic Management**, as part of the student profile. Keeps core free of any student concept, but Attendance, Finance and Transportation would all need Academic Management to reach a parent, and Parent Portal could not work without it.
- **Core keeps `Student` and `Class`** (a "people core"). Simplest for the directory and its dependants, and it is what DEC-004 said. It leaves academic tables in every installation and makes the Academic Management plugin hollow. It follows only if ADR-0009 is rejected.
- **Each plugin keeps its own copy of the people it needs.** Rejected: it duplicates the personal and child data the data classification tracks, and contact details would drift apart.

## Evidence from LC-1

- 51 provisional items: 3 modules, 4 models, 2 controllers, 16 routes, 6 pages, 4 navigation entries and 16 files.
- Split plan `auth-domain-profiles` (43 items): 38 stay core, 4 schedule lookups go to Timetable, 1 parent-link route goes to Parent Portal.
- 19 core-to-feature `data-access` references reach into Academic Management, led by `audit.controller.ts` and `auth.service.ts`; one core-to-feature `relation`, `User.department -> Department`.

## On acceptance

The manifest's `LC0-003` references are removed, making the 51 owners final. The `directory` row in [module-boundaries.md](../module-boundaries.md) becomes "lean-core generic identity directory; academic audiences through Academic Management's contract". MP-2's contract work starts from points 2, 5 and 7.

## Related

[Lean-core plan 12.3](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan 5.5, 6.2](../module-to-plugin-migration-plan.md) · [data-classification.md](../data-classification.md) · [ADR-0009](./0009-lean-core-product-boundary.md)
