# Academic legacy removal readiness

Status: **blocked — do not delete legacy Academic code or tables**

Last audited: 2026-09-29

## Verdict

Academic Management `0.1.12` is installed, active, backup/restore tested, and its production data
adoption reconciles. That proves migration readiness; it does not yet prove that the legacy Academic
implementation can be deleted. Production still routes all nine Academic ownership boundaries to
`legacy`, hosted role/browser/API parity is open, rollback has not been exercised after an owner
switch, and the required retention window has not started.

## Implemented in the plugin

- 51 permission-gated runtime routes.
- Namespaced storage for departments, memberships, enrollment intervals, Study Year compatibility,
  classes, registrations, registration settings/fields, student profiles, and subjects.
- Department and Subject create/read/update/delete operations.
- Class create/read/update/delete, roster reads, enrollment add/remove/edit, available-student,
  batch lookup, orphan cleanup, and CSV roster import operations.
- Public admission discovery/submission plus registration review, resolution, settings, and custom
  field operations.
- Directory/read-model contracts for class audiences, rosters, user classes/departments, subjects,
  student enrollment, and academic identity commands.
- Declarative pages for Departments, Subjects, Teachers, Classes, class students, registration
  review, registration field-mode settings, and custom-field creation/removal. The latter ships in
  the next immutable Academic release (`0.1.13`) and still requires hosted acceptance before cutover.

## Deletion blockers

### 1. Production ownership has not switched

All nine `ACADEMIC_*_OWNER` variables still resolve to `legacy`. Deleting controllers, services,
Prisma models, or tables now would break production immediately. The owner switch must occur only
after hosted parity passes in the approved maintenance window.

### 2. Hosted UI and role parity is not certified

The plugin declarative UI does not yet have accepted hosted evidence for administrator, teacher and
student roles. The registration-settings administrator workflow now has local phone/tablet/desktop
browser, responsive-layout, and accessibility evidence in
[MP2 Academic registration settings browser evidence](../acceptance/mp2-academic-registration-settings-browser-2026-09-29.md),
but the same flow still requires hosted execution. In particular, compare the complete legacy workflows for:

- the rich Classes workspace and its session/timetable integrations;
- public class registration;
- custom-field editing/ordering, unread badge, and hosted acceptance of registration settings,
  approval, and rejection;
- student administration, bulk CSV import, password/account operations, and student cards;
- teacher and class-admin selection;
- Study Year behavior owned by Attendance Manager;
- class-linked assignments, exams, courses, fees, attendance, reports, cards, notifications, parent
  views, and data exports.

The plugin page descriptor offers a smaller generic UI. Backend route coverage alone is not proof
that these composed browser workflows are equivalent.

### 3. Compatibility consumers still depend on legacy endpoints and models

The repository contains 264 non-test Academic module/API/model references. Core currently registers
`ClassesModule`, `DepartmentsModule`, `ClassRegistrationsModule`, and `StudyYearsModule`. Consumers
include authentication/academic identity, Directory, assignments, attendance, courses, exams, fees,
reports, notifications, parent messaging, card aliases, audit, and data export.

Each consumer must use a stable plugin contract/read model or an intentionally retained thin
compatibility proxy before its legacy model dependency can be removed.

### 4. Operational gates remain open

- hosted administrator/teacher/student API and browser parity;
- controlled write freeze and nine-boundary plugin owner switch;
- plugin-owner checkpoint and aggregate readiness check;
- observation of health, errors, latency, jobs, and unexpected legacy traffic;
- rollback exercise followed by successful plugin reapplication;
- pilot-school, operations, security, and privacy acceptance;
- fleet rollout and the final school's 90-day rollback-retention window.

## Required removal sequence

1. Complete hosted role/API/browser parity and record evidence.
2. Switch the nine owner variables to `plugin` in a maintenance window; keep shadow writes disabled.
3. Pass the plugin-owner and aggregate gates.
4. Observe the pilot and prove no unexpected legacy reads or writes.
5. Exercise configuration rollback and reapply plugin ownership.
6. Convert required old URLs into thin, Prisma-free compatibility proxies.
7. Migrate every remaining core consumer to plugin contracts/read models.
8. Remove legacy UI navigation and pages only after equivalent plugin workflows are accepted.
9. Roll out the cutover through all supported schools.
10. Retain legacy code and tables for at least one supported core release and 90 days after the final
    school cutover.
11. Create a final recovery set and obtain explicit destructive-change approval.
12. Remove legacy modules in one release, then archive/drop legacy tables in a later release.

## Removal authorization rule

Do not interpret an installed plugin, reconciled migration, or successful local test as permission to
delete legacy Academic assets. Deletion becomes eligible only when every blocker above is closed and
the final destructive migration names each code directory, route, Prisma model, table, and retained
rollback artifact explicitly.
