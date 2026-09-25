# MP3 unified scan command — 2026-09-25

Result: **plugin command locally verified; client cutover remains open**

Attendance Manager now exposes one plugin command, `POST scan`, for camera/QR/card and USB
keyboard-wedge input. The command:

- requires a bounded caller-supplied idempotency key;
- resolves only active student identifiers;
- validates dated enrollment through Academic Management before writing;
- takes a transaction-scoped PostgreSQL advisory lock per command key;
- writes the attendance record, durable outbox event and hashed-code scan ledger atomically;
- stores no raw scan credential in the ledger;
- returns the original record on retry without a second record mutation or event;
- emits the transient UI event once, only for the accepted first attempt.

The runtime database namespace guard remains satisfied because the advisory-lock query references an
Attendance-owned table. Focused tests simulate two identical requests and prove one record write,
one scan-ledger write, one durable event and one transient event.

```text
npm test -- --runInBand \
  src/plugins/attendance-manager-plugin-source.spec.ts \
  src/plugins/plugin-runtime.service.spec.ts \
  src/plugins/plugin-sdk-contract.spec.ts
PASS: 21 tests
```

MP3-006 remains partial until every legacy web/mobile/offline scanner is switched to this command
and a real PostgreSQL concurrency test proves simultaneous retries serialize correctly.
