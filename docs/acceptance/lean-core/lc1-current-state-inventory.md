# LC-1 Current-State Inventory Evidence

Status: **complete (LC1-001 to LC1-014); owners stay provisional until LC-0 is accepted**  
First implementation run: 2026-09-11

## Implemented structural scanner

`tools/architecture-inventory.js` now creates a deterministic cross-layer snapshot and supports:

```text
npm run architecture:inventory
npm run architecture:inventory:write
npm run architecture:inventory:check
```

The check fails when the live repository differs from the committed snapshot and tells the
developer to review ownership before regenerating it. PR validation runs the check and its focused
test without requiring application dependencies or a database.

## Verified baseline

| Inventory category | Detected |
|---|---:|
| Nest feature modules | 39 |
| Prisma models | 82 |
| Prisma relation fields | 110 |
| Prisma model indexes/unique identifiers | 105 |
| Controllers | 39 |
| HTTP route decorators | 382 |
| API consumer calls | 675 |
| Statically matched school-API calls | 606 |
| Unmatched static school-API calls | 0 |
| Dynamic/external expressions requiring semantic review | 52 |
| Marketplace API proxy calls | 15 |
| Platform API proxy calls | 2 |
| Next.js pages | 136 |
| Frontend API proxy routes | 3 |
| Frontend import relationships | 1,140 |
| Shared component source files | 40 |
| Statically detectable frontend deep links | 214 |
| Navigation entries | 82 |
| Scheduled-job decorators | 7 |
| WebSocket gateways | 3 |
| WebSocket subscribed events | 9 |
| Dynamic plugin job registrations | 1 |
| Backend upload-handler annotations | 2 |
| Frontend file inputs | 23 |
| Download/document generation sites | 97 |
| Filesystem operation sites | 131 |
| Storage configuration/path references | 38 |
| Official plugin storage calls | 2 |
| Notification delivery call sites | 17 |
| In-app notification database mutations | 18 |
| Notification recipient-resolution calls | 13 |
| Notification preference accesses | 6 |
| Plugin notification quota references | 18 |
| Notification-related API consumers | 31 |
| Notification digest jobs | 2 |
| Report-related source files | 48 |
| Report/analytics/dashboard/print pages | 16 |
| Report/summary/grid/export API routes | 38 |
| Report-related API consumers | 51 |
| Report filter references | 273 |
| Report calculation signals | 544 |
| Export/document generation sites | 85 |
| Print pages/actions | 20 |
| Mobile screens | 16 |
| Mobile navigation registrations/calls | 22 |
| Mobile API dependencies | 39 |
| Mobile secure-storage calls | 17 |
| Mobile offline/network signals | 3 |
| Mobile native-capability references | 17 |
| Mobile configured Expo plugins | 4 |
| Mobile configured permissions | 6 |
| Mobile package dependencies | 18 |
| Official plugin directories | 1 |

Canonical machine-readable evidence:
[current-architecture-inventory.json](../../architecture/generated/current-architecture-inventory.json).

## Verification run

On 2026-09-11:

- `npm run architecture:inventory:write` completed successfully.
- `npm run architecture:inventory:check` passed against the generated snapshot.
- `node --test tools/architecture-inventory.test.js` passed 1/1 tests.
- `git diff --check` is required before handoff.

The focused test proves deterministic discovery of a root module, feature module, Prisma model
fields/relations/indexes/mappings, controller name/prefix/guards/roles, composed route and handler,
parameter decorators and referenced types, frontend page, full navigation metadata, scheduled job,
WebSocket gateway and plugin.

API-consumer discovery covers `apiFetch`, `fetchWithAuth`, native `fetch`, and Axios method calls in
the school web application, mobile source and workspace applications. It records the caller surface,
source line, HTTP method, original static/template expression, normalized school path and matching
backend route patterns. Its current surface totals are 628 school-web calls, 39 mobile calls and 8
other workspace-app calls. All 606 statically resolvable school-API calls match a current backend
route. Dynamic variable calls remain visible rather than being guessed.

Frontend dependency discovery also records each Next.js API proxy and exported HTTP handler,
relative source import with resolved target, every shared component's importers and dependencies,
and literal/template deep-link calls from JSX links, router navigation, redirects and location
changes. These relationships identify compiled UI that must move with a business plugin.

Runtime discovery records each scheduled decorator's owning class, handler, complete schedule
expression and worker/combined process ownership. It recognizes only real gateway decorators rather
than documentation comments, recording namespace, CORS, guards, lifecycle hooks, authentication,
school-billing access enforcement, message-user enforcement and subscribed event handlers. It also
captures SDK-driven `context.jobs.register(...)` calls in official plugins. The current runtime has
seven scheduled handlers, three gateways with nine subscribed events, and one plugin job.

File/storage discovery records multipart interceptors and uploaded-file parameters, browser file
inputs, content-disposition/download behavior, CSV/PDF/spreadsheet/print generation, filesystem
operations, storage-related environment variables, recognized `/data` persistence roots, and
official plugin `context.storage.*` calls. Test and drill sources are retained in this inventory
because those files must migrate with their owning module and often define recovery paths.

Notification discovery records each core, plugin-SDK and provider delivery call with its channel,
recipient expression and remaining template/message expressions. It separately records in-app
notification table mutations, directory/audience recipient resolution, notification-preference
access, plugin daily-quota controls, notification-related frontend/mobile/API consumers, and the
scheduled daily and weekly digest jobs. This preserves both implementation and test call sites so
their future plugin owner can be assigned together rather than moving only the production sender.

Report discovery builds the ownership surface from report/analytics/dashboard/print pages,
report/summary/totals/grid/export API routes, their web/mobile consumers and explicitly named report
source files. Within that surface it records query-string, URL-search-parameter and controller-query
filters; collection, database, aggregate and named-metric calculation signals; export/document
generation; and dedicated print pages plus print actions. The calculation list is intentionally a
structural review queue: LC1-011 assigns each item to an owner before extraction, instead of this
scanner guessing business meaning from an arithmetic expression.

Mobile discovery records screen files and exported components, stack registration and imperative
navigation targets, all API dependencies already matched to school routes, secure-store operations,
network/offline signals, Expo/native capability use, configured Android/iOS permissions, Expo
plugins and package dependencies. The three current network-behavior signals are request timeout and
authentication-refresh behavior; no explicit offline cache, mutation queue, connectivity observer or
reconciliation strategy was detected. That absence is now machine-visible and must be addressed or
explicitly accepted when mobile business screens move behind plugin entitlements.

## LC1-011 ownership manifest

Implemented 2026-09-11. [`ownership-manifest.json`](../../architecture/ownership-manifest.json) is the
reviewed source of truth, derived from the two architecture plans. The scanner resolves every
discovered item against it and writes the result into the snapshot under `ownership`:

- **Owners.** A closed set of 14: `lean-core`, the 12 official plugins of the migration plan's target
  map, and `platform-control-plane` (Marketplace API and Platform Admin, which are never installed in a
  school and appear only because the scanners read their API calls).
- **Models.** All 82 Prisma models are listed by name, and a listed model that no longer exists is an
  error.
- **Rules.** Ordered rules for files, HTTP routes and pages, where the first match wins. There is no
  catch-all: a new backend area, page, route file or model with no rule is a gap rather than silent core.
- **Derivation.** An unmatched component or `frontend/lib` helper takes the owner of the files that
  import it when they all agree. A non-page file in a route folder takes the owner of the nearest page
  above it. Anything else stays a gap.
- **Mixed modules.** A route rule can override its controller file's owner. Every item in a mixed module
  names its split plan, so the split is documented rather than guessed.
- **Provisional owners.** A `decision` reference marks an owner that applies the plans' recommendation
  until LC0-003, LC0-011, LC0-012 or MP1-002 is accepted.

### Result

| Measure | Value |
|---|---:|
| Items resolved to exactly one owner | 1,293 of 1,293 |
| Gaps (unowned items) | 0 |
| Manifest errors | 0 |
| Rules matching nothing | 0 |
| Split plans | 8 |
| Provisional owners | 232 (LC0-003: 51 · LC0-011: 46 · LC0-012: 131 · MP1-002: 4) |

Counts are current as of the LC1-012 scan. Its backend, mobile and plugin import scan brought more files
under ownership; the first LC1-011 run owned 1,176 items.

Items by category: 40 Nest modules (39 feature modules plus the root), 82 models, 39 controllers,
382 routes, 136 pages, 82 navigation entries, 7 scheduled jobs, 3 WebSocket gateways, 1 plugin job,
3 frontend API proxies, 1 official plugin, 489 source files and 28 mobile configuration entries.

Records owned through the file that contains them, none unowned: 105 notification records, 1,027 report
records, 293 file-storage records, 114 mobile records, 675 API consumer calls and 214 deep links.

| Owner | Modules | Models | Routes | Pages | Navigation | Jobs/gateways |
|---|---:|---:|---:|---:|---:|---|
| `lean-core` | 18 | 21 | 88 | 25 | 14 | 5 jobs |
| `wattanam.academic-management` | 4 | 7 | 37 | 8 | 8 | |
| `wattanam.attendance` | 5 | 6 | 45 | 20 | 19 | 1 gateway |
| `wattanam.communication` | 2 | 4 | 21 | 7 | 4 | 2 jobs, 1 gateway, 1 plugin job |
| `wattanam.document-designer` | 1 | 1 | 6 | 12 | 6 | |
| `wattanam.examination` | 2 | 8 | 30 | 11 | 5 | |
| `wattanam.finance` | 1 | 3 | 11 | 8 | 6 | |
| `wattanam.human-resources` | 2 | 7 | 33 | 13 | 13 | |
| `wattanam.learning` | 2 | 13 | 59 | 14 | 2 | |
| `wattanam.parent-portal` | 1 | 1 | 10 | 8 | 2 | |
| `wattanam.reporting` | 0 | 0 | 1 | 1 | 1 | |
| `wattanam.timetable` | 1 | 7 | 27 | 7 | 1 | |
| `wattanam.transportation` | 1 | 4 | 14 | 2 | 1 | 1 gateway |

The root composition module is counted in `lean-core`'s 18. `platform-control-plane` owns 8 source
files and 1 API proxy.

### Split plans for mixed modules

| Split plan | Area | Items by owner |
|---|---|---|
| `attendance-staff` | `backend/src/attendance` | Attendance 16 · Human Resources 10 |
| `auth-domain-profiles` | `backend/src/auth` | core 24 · Timetable 4 · Parent Portal 1 |
| `mobile-scanner` | mobile `ScannerScreen` | Attendance 1 (employee self-scan leaves for Human Resources) |
| `notification-digests` | `backend/src/notification-preference` | core 7 · Communication 3 |
| `parent-messaging` | `backend/src/parent` | Parent Portal 14 · Communication 12 |
| `reports-by-domain` | `backend/src/reports` | Attendance 18 · Human Resources 10 · core 2 · Reporting 1 · Academic Management 1 |
| `session-config-staff` | `backend/src/session-config` | Attendance 10 · Human Resources 3 |
| `timetable-teacher-attendance` | `backend/src/timetable` | Timetable 27 · Attendance 6 |

### Judgement calls to review with LC-0

- `/admin/reports` is the student attendance report, so it belongs to Attendance, because each domain
  owns its report. Reporting owns only the cross-feature dashboard summary and the `/reporter` home.
- Timetable teacher attendance goes to Attendance, following migration plan section 4. It is flagged
  LC0-012 because section 10.1 recommends Human Resources for staff attendance.
- Staff attendance, employee self-service and staff session settings go to Human Resources (LC0-012).
- The daily and weekly digest jobs go to Communication, because they count messages and announcements.
- `/parent/bus` goes to Transportation (migration plan 5.3). Every other `/parent` page goes to Parent
  Portal.
- Shared UI stays as a core UI kit rather than being copied into two plugins: the question-type fields
  that Learning and Examination both use, rich text, and date and money formatting.
- `/admin`, `/teacher` and `/student` are core portal shells whose cards become plugin contributions
  (LC2-011).

### Scanner corrections made for LC1-011

- The official plugin's manifest is `plugin.json`, not `manifest.json`, so the scanner had recorded no
  identity for it. It now records `wattanam.announcements` 0.1.0.
- An earlier ownership draft added keys to `counts`, which broke the structural test's exact count
  comparison and left the drift check failing. Ownership now has its own summary under
  `ownership.summary`.
- Resolved frontend import targets and report files are now part of the owned file list. That surfaced
  helpers the draft never saw, each of which is now owned.

### Verification run (LC1-011)

On 2026-09-11:

- `node tools/architecture-inventory.js --ownership` exits 0: no gap, manifest error or stale rule.
- `npm run architecture:inventory:write` wrote schema version 10, and `npm run architecture:inventory:check`
  passes against it.
- `node --test tools/architecture-inventory.test.js` passes 4/4:
  - the original structural test;
  - a fixture proving route overrides, split plans, component, helper and route-folder derivation, and
    provisional decisions;
  - a fixture proving that gaps are reported instead of guessed, and that unknown owners, split-plan
    mismatches, missing models and stale rules are rejected;
  - the repository test that every discovered item has exactly one owner.
- PR validation already runs that test file, so an unowned item now fails CI.

## LC1-012 dependency graph

Implemented 2026-09-11. The snapshot's `dependencies` section records every reference that crosses from
one owner to another, and classifies it against the target architecture.

### What the graph reads

- **Imports.** It reads 1,140 frontend imports and 1,130 relative imports from the backend, the school
  mobile app and plugins. The backend, mobile and plugin imports come from a new `sourceImports` scanner.
  An import from a composition root (`backend/src/app.module.ts` or `apps/mobile/App.tsx`) is recorded
  as `composition`. A frontend or mobile import is recorded as `ui-import`, a backend import as `import`,
  and a spec, e2e or mock import as `test-import`.
- **Prisma table access.** A new `prismaDataAccess` scanner found 853 production calls. A call counts
  only when its middle name is a real model delegate and its method a Prisma operation, whatever the
  client variable is called.
- **Foreign keys.** The model holding the key depends on the model it points at.
- **API calls.** Every web and mobile call matched to a backend route.
- **Links.** Frontend links resolve to a page. A link to a dynamic route resolves only when every page
  it could reach has the same owner.
- **Navigation entries.** Each entry points from its navigation file to the page it links to.
- **SDK capabilities.** Each capability a plugin declares in its manifest is an edge to core, and is the
  target direction for every plugin.

### How references are classified

- `core-to-feature` is forbidden by the lean-core plan (section 5). Each group names the checklist item
  that removes it, such as the module registry, the navigation registry, plugin contributions, contracts,
  read models or identity decisions.
- `feature-to-core` is allowed, and in the target it goes through SDK contracts.
- Feature-to-feature references are checked against the manifest's `dependsOn` and `optionalDependsOn`
  (migration plan section 11). They are classified as `declared-dependency`,
  `declared-optional-dependency` or `undeclared-dependency`.
- A reference from a mixed module to another owner of its own split plan is tagged with the plan. It
  disappears when the split is carried out, so it is left out of cycle detection.
- Test imports stay visible but are never findings.

### Result

| Measure | Value |
|---|---:|
| Cross-owner references | 1,326 (1,322 production, 4 test) |
| Owner pairs | 55 |
| References inside a split plan | 97 |
| Core-to-feature production references | 179 |
| Undeclared feature-to-feature dependencies | 22 of 31 feature pairs |
| Feature cycles after the split plans | 1, across 10 plugins |
| Links that could not be resolved to one owner | 2 |

By classification: 873 feature-to-core, 183 core-to-feature (179 production and 4 test imports),
163 undeclared, 89 declared and 18 declared-optional.

By kind: 577 UI imports, 240 table accesses, 146 API calls, 143 backend imports, 68 navigation entries,
65 links, 37 foreign keys, 31 composition imports, 15 SDK capabilities and 4 test imports.

References inside split plans, by plan: `reports-by-domain` 50, `attendance-staff` 25,
`notification-digests` 6, `auth-domain-profiles` 5, `timetable-teacher-attendance` 5,
`parent-messaging` 3, `session-config-staff` 2 and `mobile-scanner` 1.

### Core-to-feature references

| Kind | References | What removes it |
|---|---:|---|
| Navigation | 68 | Navigation registry built from plugin contributions (LC2-008, LC2-009) |
| Table access | 43 | A versioned contract or read model (LC4-009, LC4-012); LC0-003 for identity |
| Composition | 31 | A module and screen registry (LC2-003 to LC2-005) |
| API call | 18 | Plugin dashboard and search contributions, or a contract (LC2-011, LC2-012, LC4-009) |
| Link | 11 | Plugin navigation and dashboard contributions (LC2-008, LC2-011) |
| UI import | 4 | UI contributions rendered by the core shell (LC2-011, LC3-001) |
| Backend import | 3 | A versioned contract or event (LC4-009, LC4-010) |
| Foreign key | 1 | A stable ID without a cross-namespace key (migration plan 10.2; LC0-003) |

By target: Academic Management 41, Attendance 38, Human Resources 24, Communication 17, Examination 15,
Timetable 10, Learning 9, Finance 8, Document Designer 7, Parent Portal 5, Reporting 3 and
Transportation 2.

Findings worth acting on before any extraction:

- **Core deletes feature records.** Deleting a user in `backend/src/auth/auth.service.ts` also deletes
  attendance, fee, staff-attendance, salary, message, exam and assignment records directly. After the
  split, this must become a user-deleted lifecycle event that each plugin handles (LC4-010).
- **Core reads feature tables.** The audit portal-activity endpoint (`backend/src/audit/audit.controller.ts`)
  reads classes, students, departments, holidays, announcements, exams and assignments.
- **Core imports feature code.** The core plugin host imports `parent.module.ts`
  (`backend/src/plugins/plugins.module.ts`), and `plugin-realtime.service.ts` imports the messages gateway.
- **A core table points into a plugin.** `User.department` is a foreign key to Academic Management's
  `Department` (LC0-003).

### Feature-to-feature dependencies

Of the 31 feature pairs, 5 are declared requirements, all on Academic Management: from Attendance,
Examination, Finance, Learning and Timetable. 4 are declared optional, all Parent Portal adapters. The
remaining 22 are undeclared. The largest are:

- Attendance to Human Resources: 60 references, 48 of them inside the `attendance-staff` and
  `reports-by-domain` split plans.
- Academic Management to Learning (17), Attendance (13) and Examination (7): pages calling their APIs,
  and services reading or deleting their records.
- Document Designer to Academic Management: 14 API calls, as card pages load class and student lists.
- Communication to Academic Management: 6 references.

Each undeclared pair needs either a declared dependency or a contract or event instead.

**The cycle.** Even after leaving out split-plan references, the ten plugins other than Reporting and
Transportation form one strongly connected group. The main cause is Academic Management reaching back into
the plugins that depend on it. Academic Management has to publish contracts and lifecycle events instead
(MP2-004, MP2-005, LC4-010) before a dependency-ordered install is possible (migration plan section 11).

**Declared but unused.** Parent Portal to Examination and to Transportation, and Transportation to
Academic Management. These are optional adapters that do not exist yet.

### Scanner changes for LC1-012

- The new `sourceImports` (1,130) and `prismaDataAccess` (853) sections, with their counts. Official
  plugins now also record their declared capabilities and dependencies. Schema version is 11.
- Scanning backend imports brought more files under ownership: 489 source files and 1,293 items in all.
  Rules were added for `backend/src/app.service.ts`, `backend/src/h5p/` (Learning, per migration plan
  section 4), the mobile app shell, Jest mocks and `packages/`.
- The snapshot grew from 1.6 MB to 2.3 MB, mostly from the per-reference evidence (about 266 KB) and the
  two new scanner sections.

Limits: raw SQL (`$queryRaw`) and Prisma delegates passed around in variables are not attributed. Spec
files are left out of table access, because their doubles would repeat the production edges.

### Verification run (LC1-012)

On 2026-09-11:

- `npm run architecture:inventory:write` wrote schema version 11, and `npm run architecture:inventory:check`
  passes against it.
- `node tools/architecture-inventory.js --ownership` exits 0: 1,293 items, no gap, error or stale rule.
- `node --test tools/architecture-inventory.test.js` passes 6/6. The two new tests are:
  - a fixture covering every reference kind and classification, split-plan tagging that keeps a staff
    read out of the cycle, a real Academic and Attendance cycle, and an unused declared dependency;
  - the repository test: every endpoint is owned, every reference from the composition roots is
    composition, the official plugin reaches core through its declared capabilities, and every
    core-to-feature finding names its resolution.

## LC1-013 data classification

Implemented 2026-09-11. [`data-classification.json`](../../architecture/data-classification.json) is the
machine-checked companion of [data-classification.md](../../architecture/data-classification.md) (A-002).
It keeps A-002's tiers and field-by-field judgements and adds the lean-core categories: personal, child,
financial, credential and location. The snapshot's `dataClassification` section holds the result.

### How it classifies

- **Fields** carry A-002's tier (2 personal, 3 sensitive, 4 credential; `unbounded`, `inherits`; and
  `business` for sensitive school data about no individual) and their categories. A field sent to a third
  party names the channel (email or SMS).
- **Subjects** say whose data a model holds: student, applicant, guardian, staff or any user account.
  A model is personal when it has a subject or a tier 2, 3, unbounded or inherits field. It is child data
  when a subject is a student, an applicant or any user account: students have accounts, and A-002
  treats them as minors by default.
- **Checks.** Every Prisma model must be listed. A field whose name suggests sensitive data (email,
  phone, address, photo, birth, location, amount, password, token and so on) must be classified, or
  listed under `unflagged` with the reason it is not; booleans, ids and timestamps are ignored. A model
  holding student-linked records, whether by a foreign key to `Student` or a `studentId` column, must
  come out as child data. A-002's change rule is now enforced instead of relying on discipline.
- **Outbound flows.** A new `outboundCalls` scanner finds outbound `fetch(` calls and object-storage
  clients in the backend and in the web app's server-side route handlers. Calls inside comments are
  skipped, and a URL does not count as a comment. Each call and each external notification channel
  must map to a declared destination.

### Result

| Measure | Value |
|---|---:|
| Models classified | 82 of 82 |
| Fields classified | 135 (tier 2: 46 · tier 3: 75 · tier 4: 8 · business: 2 · inherits: 2 · unbounded: 2) |
| Fields sent to a third party | 5 |
| Gaps, errors, unused rules | 0, 0, 0 |

Models by category: 35 personal, 25 child, 9 credential, 5 location and 4 financial.

| Owner | Categories | Whose data | External destinations |
|---|---|---|---|
| `lean-core` | child, credential, financial, personal | user accounts, staff | email, SMS, marketplace, update repository, object storage, image proxy, provider checks |
| `wattanam.academic-management` | child, credential, location, personal | students, applicants | |
| `wattanam.attendance` | child, credential, location, personal | students, staff | |
| `wattanam.communication` | child, personal | user accounts | email, SMS |
| `wattanam.document-designer` | none | | |
| `wattanam.examination` | child, personal | students | |
| `wattanam.finance` | child, financial, personal | students | |
| `wattanam.human-resources` | financial, location, personal | staff | |
| `wattanam.learning` | child, credential, personal | students | |
| `wattanam.parent-portal` | child, personal | guardians, students | |
| `wattanam.timetable` | credential, personal | staff | |
| `wattanam.transportation` | child, location, personal | students | |

This table is the starting point for each plugin's privacy declaration (lean-core plan 12.11).
Transportation counts as child data because a bus position reveals where the children on the bus are.
Timetable holds staff identities and QR codes, in a second copy of staff identity separate from `User`.

External flows found in the code:

| Destination | Calls | From | Data |
|---|---:|---|---|
| Email provider (SendGrid) | 6 | core 4, Communication 2 | recipient and message text that can name a student |
| SMS provider (Twilio) | 4 | core 3, Communication 1 | phone number and message text that can name a student |
| Wattanam marketplace | 10 | core | installation identity, orders, and platform-bill payment submissions |
| SendGrid and Twilio account checks | 2 | core | the school's own provider credentials, during installation preflight |
| Image proxy | 1 | core | the requested URL only |
| Object storage (S3) | 1 | core | plugin files, which may hold any plugin's data |
| Update repository | 1 | core | release metadata only |

The web app's server-side proxy to the school's own API is also recorded, as an internal flow.

### Classified beyond A-002

A-002 is silent on these, so each carries a note saying so, and A-002 should catch up:

- `PasswordResetToken.tokenHash` is a tier 4 credential, by A-002's own tier 4 rule.
- `CourseSession.checkInCode` is a tier 4 credential: the code students type to mark themselves present.
- `MarketplaceProxyLink.accountEmailMasked` is tier 2 personal: the linking administrator's masked email.
- `MarketplaceSchoolControl.billingJson` and `warningsJson` are financial `business` data: the synced
  platform bill, overdue amounts, payment submissions and Wattanam's receiving bank accounts.
- `PluginEntitlementCache.signedTokenJson` is a credential. A-002 calls it "tier 4-adjacent".

Reviewed as not sensitive, following A-002: the school's own published contact details
(`FeeSettings`, `SiteSetting`), the public class price, fixed bus-stop positions, a course session's
venue, and the intake form's field switches (`ClassRegistrationSettings`).

Limits: the name check cannot recognise every personal field (a new `name` column in a person model is
caught only through review), and outbound calls made through an SDK other than `fetch` or `S3Client`
are not scanned.

### Verification run (LC1-013)

On 2026-09-11:

- `npm run architecture:inventory:write` wrote schema version 12, and `npm run architecture:inventory:check`
  passes against it.
- `node --test tools/architecture-inventory.test.js` passes 8/8. The two new tests are:
  - a fixture proving that subjects and fields produce the right categories, that a student-linked
    model tagged as staff data is rejected, that an unreviewed sensitive field, an unlisted model, an
    unmapped call and an unmapped channel are gaps, and that a commented `fetch(` is ignored while a
    URL before a real call does not hide it;
  - the repository test: no gap, error or unused rule, A-002's key judgements encoded faithfully, every
    student-linked model child data, and every declared external destination reached.

## LC1-014 CI gate

Implemented 2026-09-11. `npm run architecture:inventory:gate` fails CI when an item is new and unreviewed,
not merely changed:

- an unowned module, controller, route, page, navigation entry, job, gateway, API proxy or file;
- an unowned or unclassified model;
- a sensitive-looking field that is neither classified nor reviewed;
- an outbound flow or notification channel with no destination;
- an error or a stale entry in either manifest.

It passes with a one-line summary. When it fails, it exits 1 with a report grouped by what to fix. Each
group names the manifest to edit and the exact entry to add. A new file's line also says what the file
holds, for example `(controller, 2 routes)`, and a page's own file is not listed twice.

PR validation runs the gate first, as its own step ("Reject unowned or unclassified architecture items"),
so a failing pull request stops with that report. The drift check and the repository tests follow as the
next step.

The other two commands now say where a change stands:

- **Drift check.** When the snapshot is out of date, the message says either "Everything is owned and
  classified: review the change, then run write", or "The gate also fails (...): run the gate to see what
  to fix".
- **Write.** `npm run architecture:inventory:write` still writes the snapshot, but it exits 1 and prints
  the gate report when CI would reject the result, so an unfinished snapshot does not look finished.

### Review workflow

1. **CI fails at the gate step.** Run `npm run architecture:inventory:gate` locally to see the grouped list.
2. **Anything with no owner.** Add a rule to [`ownership-manifest.json`](../../architecture/ownership-manifest.json)
   following the target map in the [migration plan](../../architecture/module-to-plugin-migration-plan.md).
   A module that mixes owners gets a split plan rather than a guessed owner. An owner that depends on a
   pending decision carries its `decision` reference.
3. **A new model, sensitive field or outbound flow.** Classify it in
   [`data-classification.json`](../../architecture/data-classification.json) using A-002's tiers, and say
   whose data it is. A model holding student records must come out as child data.
4. **Regenerate and commit.** Run `npm run architecture:inventory:write` and commit the manifest changes
   together with the regenerated snapshot, in the same pull request.
5. **Review.** Reviewers read the manifest diff, which shows the owner, split, decision or classification
   chosen, and the snapshot diff, which shows what was discovered. Ownership choices follow the LC-0
   decisions. Data-classification changes need a privacy reviewer.
6. **CI fails only at the drift step.** Everything is already owned and classified: review the change,
   regenerate and commit.

The gate checks ownership and classification only. The LC1-012 dependency findings are current-state
findings, not gate failures. A ratchet that rejects new core-to-feature references belongs to LC-2's
policy check that rejects business imports from core.

### Verification run (LC1-014)

On 2026-09-11:

- `node --test tools/architecture-inventory.test.js` passes 10/10. The two new tests are:
  - a fixture that passes cleanly, then gains an unreviewed controller with two routes, a page, a model, a
    sensitive-looking field and an outbound call, and produces the exact grouped report;
  - the repository test: the gate passes.
- `npm run architecture:inventory:gate` on the repository exits 0: "1293 discovered items owned and 82
  models classified".
- End to end, a temporary unowned controller was added under `backend/src/zz-gate-probe/`:
  - the gate exited 1, naming `backend/src/zz-gate-probe/probe.controller.ts (controller, route)` and the
    manifest to edit;
  - the drift check exited 1 with "The gate also fails (3 ownership gaps)";
  - the probe was then removed, and `git status` shows no trace of it.
- `npm run architecture:inventory:check` passes. The snapshot needed no change, because LC1-014 adds no
  scanner.

## After LC-1

LC-1 is complete: LC1-001 to LC1-014 are implemented and verified. What follows is outside it:

- **LC-0 acceptance.** Accepting the pending decisions turns the 232 provisional owners final.
- **Acting on the findings.** The dependency findings belong to LC-2 and LC-4 work and to MP-2's Academic
  Management contracts. The classification feeds each plugin's privacy declaration and A-006's retention
  rules. LC-1 records them and changes no code.

No module was moved, disabled or deleted by this increment.
