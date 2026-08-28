# Gate C Plugin Migration Rollback and Lifecycle Lock Evidence — 2026-08-28

## Result

C-001 and C-002 are implemented and verified against a real, disposable PostgreSQL 16 instance (Docker, not mocked) using the actual production classes (`PluginsService`, `PluginMigrationsService`) — not a simulation. All 14 live checks pass. Every prior claim about plugin migration transactionality had only ever been proven against a mocked `tx` object; this is the first time it was proven against real Postgres.

## What changed

- **Deterministic restart recovery** (`PluginsService.reconcileOrphanDestination`): a crash between `fs.rename(staging, destination)` and the transaction that records it used to leave a permanently stuck plugin — retrying the install hit "already present" forever, with the registry showing nothing installed. It now checks whether the on-disk directory corresponds to a *committed* registry row of that exact id/version/package; if not, it's a crash orphan and is removed so the retry proceeds normally.
- **Lock** (`PluginsService.withPluginLock`): every lifecycle mutation (install, activate, deactivate, remove) now runs inside a transaction that first takes `pg_advisory_xact_lock(hashtext(pluginId))`. Concurrent requests for the *same* plugin id serialize; different plugin ids never block each other. The lock is transaction-scoped, so it releases automatically on commit, rollback, or a dropped connection — it can never be left stuck by a crash.
- **Timeout**: each locked transaction has an explicit `{ timeout: 30_000, maxWait: 10_000 }` instead of relying on Prisma's implicit default, so a hung migration or filesystem move fails closed instead of holding the lock (and blocking every later request for that plugin) indefinitely.
- **Progress state**: before an *update* to an already-installed plugin with migrations begins, its registry row is committed to `status: 'migrating'` in its own short transaction (separate from the locked work transaction) so a concurrent reader sees real progress instead of a row that appears frozen until success or a crash. A brand-new plugin has no row to mark, so it correctly shows nothing until it either succeeds or leaves no trace.
- **Failure state**: `install()` and `activate()` now write `status: 'failed'` with the real error message back to the registry after a locked transaction rolls back — for `activate()` in every case; for `install()`, only when a row already exists (a first-ever install failure has nothing to mark, which is the correct outcome: it leaves zero trace, exactly like an installed-and-then-removed plugin would).
- Zero behavioral change to the actual migration SQL validation, checksum, or namespace rules in `PluginMigrationsService` — this work is entirely in the surrounding lifecycle orchestration.

## Live PostgreSQL verification (Docker, postgres:16-alpine, disposable)

Ran the real `PluginsService`/`PluginMigrationsService` classes (stubbing only package-signature verification and runtime code loading, which are unrelated to this evidence) against a fresh container with the backend's five checked-in migrations applied via `prisma migrate deploy`.

```text
== C-001: failing plugin migration on real PostgreSQL ==
PASS install() rejects when the second migration violates a real constraint
PASS PluginMigration history has zero rows (migration 001's row rolled back too)
PASS the table created by migration 001 does not exist (DDL rolled back)
PASS the staged plugin directory was removed from disk
PASS a first-ever install that never commits leaves no trace at all (nothing to mark failed)

== C-001/C-002: a failed UPDATE to an already-installed plugin marks it failed without touching its working state ==
PASS the working v1 installs cleanly first
PASS the v2 update rejects on the same real constraint violation
PASS the existing row now visibly shows status=failed with the real error
PASS the working version's already-applied migration 001 history is untouched
PASS the working v1 files on disk were never touched by the failed v2 attempt

== C-002: advisory-lock serialization on real PostgreSQL ==
PASS two concurrent lifecycle calls for the SAME plugin id serialize on the lock (no overlap, either order)
PASS two concurrent lifecycle calls for DIFFERENT plugin ids do not block each other

== C-002: orphaned destination from a simulated crash self-heals ==
PASS install() self-heals the orphan and completes instead of throwing "already present"
PASS the orphaned file from the simulated crash is gone

ALL CHECKS PASSED (14/14)
```

The "deliberately failing" migration (`INSERT ... VALUES ('dup'), ('dup')` against a primary-key column) was constructed to pass every static check in `validateSql()` — correct namespace, single statement, no forbidden operations — and fail only at real Postgres execution time (`23505 unique_violation`), so this genuinely exercises the database's own transactional rollback rather than the application's pre-flight validation.

One deliberate finding worth stating plainly: Postgres advisory locks make no FIFO fairness guarantee between waiters. In the serialization run above, the shorter operation (B, 50ms) happened to acquire the lock before the longer one (A, 300ms) despite A being submitted first — this is correct, expected Postgres behavior. What the acceptance criterion actually requires, and what was verified, is *mutual exclusion* (no overlap), not submission order.

## Automated unit verification (mocked, part of the regular suite)

```text
Full backend suite: 24 passed, 24 total (108 tests, +16 from this change)
Backend build (swc): 160 files compiled
TypeScript build: passed (tsc --noEmit)
```

New file `plugins.service.spec.ts` (previously this service had zero unit test coverage) covers: the lock helper's exact SQL and transaction options; all four `reconcileOrphanDestination` branches; install's happy path, active-plugin rejection, migration-failure cleanup and failure-state write-back, orphan self-heal, and the migrating-progress marker; activate's happy path, missing-entry-file rejection (never committing `active`), and runtime-load-failure handling; and deactivate/remove's unload-before-lock ordering and active-plugin removal guard.

## Open items

- `createRecoveryPoint()`'s backup mechanism itself (the "recovery archive restores" clause of C-001) was not re-verified in this session — no `pg_dump`/`pg_restore` binaries were available on the host to run it outside a container. It is separately verified under OPS-003 (`docs/implementation-baseline.md`), and `install()` unmodified-by-this-change already calls it before any migration runs.
- The advisory lock protects the database transaction and the file move inside it, but `runtime.load()`/`runtime.unload()` (in-memory plugin activation state) run outside the lock, after it releases. Two concurrent `activate()`/`deactivate()` calls for the same plugin will serialize their DB status flip correctly but could still race on the in-memory runtime load/unload sequence itself. Not corrected in this change.
- The install-time `assertDependencies` pre-check runs once, before the lock, exactly as it did before this change — it is not re-validated inside the locked transaction. This is not a regression, just not tightened.
- No load test exists proving the lock behaves correctly under more than two concurrent callers, or under real network latency (this was verified against a local container with negligible latency).
