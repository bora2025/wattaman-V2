# Locking a School That Has Not Paid

Status: **implemented; hosted certification pending**, with its decisions made on 2026-09-10.
Written 2026-09-10.

Implementation completed 2026-09-10:

- all six increments are present in the school API and web application;
- 50 focused tests pass for the access decision, HTTP and WebSocket enforcement, adaptive sync,
  outage fail-open, scheduled work and streamed exports;
- backend and frontend TypeScript checks pass, and the frontend production build completes;
- the full backend run passes 342/351 tests. Its nine failures are the existing Windows/Jest
  temporary-plugin module-resolution problem in `plugin-runtime.service.spec.ts` and
  `plugin-security-fixtures.spec.ts`, not failures in this plan;
- the rendered hosted-role drill, socket/database drill and live marketplace-to-school drill below
  remain release certification evidence and must be recorded before calling the production gate
  complete.

## The request

A customer school that does not pay its Wattanam bill must not be able to use anything.

## Decisions (2026-09-10)

1. **Data export while locked: allowed, for the SUPER_ADMIN only.** Everyone else gets nothing but the
   lock screen. See Increment 5.
2. **Grace period: three days after the final notice, for every school.** Nothing to build; the
   per-plan grace period is not in this plan.
3. **Outage rule: lift the lock after seven days without a successful sync.** See Increment 6.
4. **Digests: stop while the school is locked.** See Increment 3.

## Most of this already exists

The lock is built and deployed. It works in five steps, all verified in code:

1. **The marketplace decides.** `installationControl`
   (`apps/marketplace-api/src/school-billing.service.ts:371-382`) returns `access: 'SUSPENDED'` when
   an invoice is overdue and its final OVERDUE notice is at least three days old, or when an operator
   has suspended or terminated the school (`customer-school.service.ts:357`).
2. **The school fetches the decision every hour.** `SchoolBillingControlService.sync`
   (`backend/src/marketplace/school-billing-control.service.ts:23`) stores it in
   `MarketplaceSchoolControl` and rings the administrators' bell: final notice, suspended, reactivated.
3. **Every HTTP request is refused.** `SchoolBillingAccessGuard` is a global `APP_GUARD`
   (`backend/src/app.module.ts:99`), so every controller -- plugin routes included -- answers
   `402 SCHOOL_BILLING_SUSPENDED`. The exceptions are `/health`, `/health/ready`, `/version`, `/auth`
   and `/admin/marketplace/billing-control`, so an administrator can still sign in, read the bill and
   submit a payment.
4. **The browser sends administrators to the bill.** `frontend/lib/api.ts:66` redirects any 402 to
   `/admin/platform-billing`.
5. **It lifts itself.** Once finance confirms the payment, the next sync returns `ACTIVE` and the
   administrators are told access is back.

For an unpaid invoice the timeline is: due date, then the final notice within an hour
(`dispatchDueAlerts` runs hourly, `apps/marketplace-api/src/main.ts:16`), then three days of grace,
then the lock reaches the school within one more hour.

## Where "cannot use anything" is not yet true

### Gap 1 -- Everyone except administrators is stuck at the sign-in page, with no explanation

`api.ts` sends every 402 to `/admin/platform-billing`, whatever the user's role. That page only admits
ADMIN and SUPER_ADMIN (`frontend/app/admin/platform-billing/page.tsx:20`; SCHOOL_ADMIN passes through
`AuthGuard`'s superset rule), so a teacher, student, parent, employee or scanning kiosk is pushed to
`/login?returnTo=/admin/platform-billing` (`frontend/components/AuthGuard.tsx:100-101`). Signing in
again follows `returnTo` straight back to the page that refuses them
(`frontend/app/login/page.tsx:50-54`), and round it goes. Nobody is told that the school is suspended,
or that there is nothing they personally can do about it.

### Gap 2 -- Live connections ignore the lock entirely

The three Socket.IO gateways -- bus (`backend/src/bus/bus.gateway.ts`), attendance
(`backend/src/attendance/attendance.gateway.ts`) and messages (`backend/src/parent/messages.gateway.ts`)
-- check only the sign-in token when a socket connects (`authenticateSocket`,
`backend/src/common/socket-auth.ts:31`).

The global guard does not reach them either, for connections *or* for messages. Nest builds the
WebSocket guard runner without the application config
(`node_modules/@nestjs/websockets/socket-module.js:81`, `new GuardsContextCreator(container)`), and
without that config `getGlobalMetadata` returns no global guards at all
(`node_modules/@nestjs/core/guards/guards-context-creator.js:53-56`). This is also why the global
`ThrottlerGuard`, which assumes an HTTP response object, has never broken the sockets: it never runs on
them.

So while a school is suspended, a driver's phone can keep writing bus positions to the database through
`location-update` (`bus.gateway.ts:44-58`, `busService.recordLocation`), parents keep receiving them,
and the attendance dashboards and message typing indicators stay connected.

### Gap 3 -- Scheduled jobs keep serving a suspended school

`DigestService` still sends the daily and weekly digests
(`backend/src/notification-preference/digest.service.ts:16,22`). The other scheduled jobs must keep
running: backups (`backup.service.ts:108`) and audit clean-up (`audit.service.ts:132`) protect the
school's own data, and the billing sync and entitlement refresh are how it gets unlocked.

### Gap 4 -- Unlocking can take an hour after finance confirms

The school only pulls, and only hourly. After finance clicks **Confirm received**, the school stays
locked until the next sync, unless an administrator happens to press **Sync now**.

### Gap 5 -- A locked school cannot take its own records out

The existing exports cover attendance only, one date or period at a time
(`backend/src/reports/reports.controller.ts:140-246`). There is no export of the student list or of
grades (`ScoreEntry`), and while the school is locked even the attendance exports answer 402.

### Gap 6 -- A marketplace outage keeps a paid school locked

When a sync fails, the school keeps its last known state
(`school-billing-control.service.ts:90-95`). A suspended school that pays during a marketplace outage
stays locked for as long as the outage lasts, and cannot even submit its payment, because submitting
goes through the marketplace too. (An active school stays active through an outage, which is the safe
direction.)

## Plan

### Increment 1 -- A lock screen for every role (closes Gap 1)

- **A public `/suspended` page** outside `AuthGuard`, in Khmer and English: "This school's Wattanam
  service is paused because a platform invoice is unpaid. Please contact your school administrator."
  It shows the school name and a **Sign out** button, and it deliberately shows no amounts: students
  and parents have no business seeing the school's debts.
- **One small public route**, `GET /school-access`, added to the guard's allow-list. It returns only
  `{ access: 'ACTIVE' | 'SUSPENDED' }`. The `/suspended` page polls it every minute and sends the
  person back to their own home page as soon as the school is active again.
- **`api.ts` routes a 402 by role.** Administrators (the roles the billing page admits) go to
  `/admin/platform-billing` as today; everyone else goes to `/suspended`. The role comes from the
  `localStorage.role` value `AuthGuard` already sets. The global guard runs before sign-in is checked,
  so the 402 itself cannot carry the role.
- **The sign-in page checks the school first.** After a successful sign-in on a suspended school, a
  non-administrator goes to `/suspended` instead of following `returnTo`. That is what removes the loop.

### Increment 2 -- Live connections obey the lock (closes Gap 2)

- **One source of truth.** A new `SchoolAccessService.isSuspended()` reads
  `MarketplaceSchoolControl.access`, with a few seconds of caching. The HTTP guard switches to it. The
  guard currently queries the database on every request, so this also removes that cost.
- **Refuse the connection.** All three gateways' `handleConnection` refuse and disconnect while the
  school is suspended, with a `WsException` carrying `SCHOOL_BILLING_SUSPENDED`.
- **Refuse every message.** A `SchoolAccessWsGuard` goes on each gateway with `@UseGuards`, because
  global guards will never reach them (see Gap 2). This is what stops a socket opened *before* the lock
  from writing bus positions after it.
- **No forced disconnect.** Sockets that are already open need none. Everything they could receive is
  produced by a write that is now refused, whether over HTTP or over a socket message. That matters
  because the sync may run in a different process from the sockets (`PROCESS_ROLE=worker`).

### Increment 3 -- Scheduled work pauses (closes Gap 3)

- The daily and weekly digests skip a suspended school.
- A comment next to the lock lists the jobs that must keep running, and why: backups, audit clean-up,
  the billing sync and the entitlement refresh. That way nobody later "tidies" them into the lock.
- During implementation, check whether plugins can schedule their own background work. If they can,
  the plugin runtime pauses it as well.

### Increment 4 -- Unlock within minutes (closes Gap 4)

- While the school is suspended, or while one of its payment submissions awaits confirmation, it syncs
  every five minutes instead of hourly. That is one extra signed request every five minutes, only for a
  school in that state. An active school with nothing pending keeps the hourly sync.

### Increment 5 -- The SUPER_ADMIN can take the school's records out (closes Gap 5)

- **A new route prefix, `/admin/data-export`, added to the guard's allow-list.** Its controller admits
  SUPER_ADMIN and nobody else. Allow-listing the existing `/reports` routes instead would reopen those
  reports to every role that controller admits: the lock runs before sign-in is checked, so it cannot
  tell one role from another. The allow-list only lets a request past the lock, and the controller's
  own role check still decides who gets in -- the same arrangement `/admin/marketplace/billing-control`
  already relies on.
- **Three CSV downloads, streamed so a large school does not exhaust memory:**
  - students (`Student`, with class);
  - attendance (`Attendance`, every record);
  - grades (`ScoreEntry`, with the names from `ScoreSheet` and `ScoreSubject`).

  Everything is read-only: nothing in this controller writes to the school's data.
- **Every download is audited:** who downloaded which file, and when. A whole-school export of
  children's records is exactly the kind of event the audit log exists for.
- **The billing page shows a "Download your school's records" section**, for the SUPER_ADMIN only,
  while the school is locked. The route itself is not limited to the locked state: a SUPER_ADMIN taking
  a copy of their own school's records is harmless at any time, and one rule is simpler to reason about
  than two.

### Increment 6 -- What an outage does (closes Gap 6)

- Stay locked through a short outage. If the school has had no successful sync for **seven days**,
  lift the lock, notify the administrators and log an error for Wattanam operations. After a week
  without contact, the likely cause is on Wattanam's side (an outage, a URL, a key), and the standing
  rule in ADR-0006 is that a Wattanam failure must never harm a school.
- This is safe only because hosting is managed: a school cannot cut its own server off from the
  marketplace to get unlocked. Revisit it if self-hosting is ever offered.

## Verification

- **Unit tests:**
  - the shared access check;
  - the WebSocket guard, on connection and on messages;
  - the digest skip;
  - the five-minute sync applying only while locked or while a payment is pending;
  - the seven-day outage rule, at its boundary;
  - `api.ts` routing a 402 by role;
  - `/school-access` returning nothing but the state;
  - the export controller refusing every role but SUPER_ADMIN.
- **A rendered browser check against the real stack**, as for the billing pages, with the school
  suspended:
  - an administrator lands on Platform billing;
  - the SUPER_ADMIN downloads all three files, and an ADMIN sees no download section;
  - a teacher, a student and a parent each land on `/suspended`, and signing in again keeps them there
    instead of looping;
  - unlocking returns each of them to their own home page within a minute.
- **A socket drill:** a bus `location-update` is refused on a socket opened before the lock and on one
  opened after it, and no position row is written.
- **A live drill across both apps:** the marketplace suspends the school, the school locks on its next
  sync, finance confirms a payment, and the school unlocks within five minutes.

## Not in this plan

- **A grace period per plan.** Decided against on 2026-09-10: three days after the final notice, for
  every school.
- **Deleting or hiding data.** The lock never deletes anything; everything is where the school left it
  once the bill is paid.
- **Stopping the school's Railway service.** That would also take away the billing page, so the school
  could not pay its way back.
- **Revoking plugin licences.** Suspension already blocks downloads and updates, and a school that
  settles its bill should find its plugins where it left them (the existing decision,
  `school-billing.service.ts:665-668`).
