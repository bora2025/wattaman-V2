# ADR-0015: Cross-Plugin Event Consistency

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-008**.

## Context

Plugin events today run on an in-process Node `EventEmitter` (`backend/src/plugins/plugin-events.ts`). Names must be versioned (`name.v1`), which is a good start, but delivery is fire-and-forget:
- nothing is persisted;
- a subscriber failure is only logged;
- an event raised in the API process never reaches the worker;
- a crash loses whatever was in flight.

That is fine for hints, but not for what LC-1 found crossing future plugin boundaries, which is mostly direct writes. Deleting a class clears attendance, fees, exam attempts and parent requests (`classes.service.ts:237-244`), and deleting a user clears records in five plugins (`auth.service.ts:310-331`). LC-1 counts 22 undeclared feature-to-feature dependencies and one cycle across 10 plugins. Once the tables have separate owners, each of those writes becomes a message between plugins.

## Decision

1. **Durable events go through a transactional outbox.** A plugin writes its event row in the same database transaction as the state change it describes. A dispatcher on the existing database-backed job runner delivers it at least once.
2. **Consumers are idempotent.** Each consumer records the event IDs it has processed and ignores repeats.
3. **Ordering is guaranteed only per subject key** (per student, per invoice), never globally.
4. **Failures retry with backoff, then dead-letter.** After the retry limit, an event moves to a dead-letter list operators can see, fix and replay. A plugin's health reports its dead letters.
5. **Events have owners and schemas.** The publishing plugin owns each event name, its schema and its maximum payload size. A consumer declares the versions it accepts, and a publisher keeps emitting a version until the compatibility window closes ([ADR-0017](./0017-compatibility-windows.md)).
6. **No transaction spans plugins.** A cross-plugin workflow is a sequence of local transactions with compensating actions.
7. **Queries use contracts, not events.** A plugin that needs another's data calls a versioned service contract; Reporting reads published read models (migration plan 6.2).
8. **The in-memory bus stays, for hints only.** `events.publish` keeps its current behaviour for SDK 1.x and is documented as best-effort. Durable delivery is a separate capability, and nothing whose loss corrupts data may use the in-memory bus.

Required proof (lean-core plan 12.4): duplicate, delayed and out-of-order events never duplicate fees, attendance, notifications or any other irreversible record.

## Consequences

- Cascades such as class and account deletion become eventually consistent. A dependent plugin's records disappear when its consumer runs, and a stuck consumer is visible rather than silent.
- Every official plugin needs an outbox table and a processed-events table in its namespace. The SDK should provide both, so plugins cannot get them subtly wrong.
- No new infrastructure: the outbox runs on the school's existing PostgreSQL and job runner.

## Alternatives considered

- **Keep the in-memory bus for everything.** Events are lost on restart and never cross the API/worker boundary.
- **An external broker** (Redis streams, RabbitMQ, Kafka). Stronger delivery guarantees, but it adds a stateful service to every school's Railway project that must be backed up and operated. That buys little at volumes one PostgreSQL handles easily.
- **Distributed transactions across plugins.** They tie every plugin's availability and schema to every other plugin's, which defeats the point of separating them.

## Related

[Lean-core plan 12.4](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan 6.2](../module-to-plugin-migration-plan.md) · [ADR-0010](./0010-identity-ownership.md) · [LC-1 dependency graph](../../acceptance/lean-core/lc1-current-state-inventory.md)
