# MP2 Admissions core-account boundary — 2026-09-25

## Result

Academic Management 0.1.8 no longer relies on the active legacy approved-registration subscriber
to create a legacy Student row. Approval requests a narrowly scoped core `STUDENT` account through
the additive `accounts.student.create` capability, then atomically creates the plugin-owned Student
Profile and Enrollment Interval, links the registration, and publishes the durable
`academic.registration.approved.v2` event.

## Safety properties

- Plugins never receive core `User` SQL or a generic account mutation API.
- The adapter accepts only STUDENT creation, validates bounded identity fields and a bcrypt hash,
  and returns no password data.
- `PluginAccountCommand` journals `(pluginId, commandKey, requestHash, userId)`. A PostgreSQL
  transaction advisory lock serializes the same key across replicas; an exact retry returns the
  original account, while a changed payload fails closed.
- Account creation and its command journal commit in one core transaction. A retry after a later
  plugin-write failure receives the same user and can safely finish plugin materialization.
- Duplicate email/phone identifiers fail before account creation. Contact-less imports receive a
  deterministic non-secret local placeholder derived from the request hash.
- Every capability call is audited, and the account-command table stores neither the request body
  nor password material.
- The legacy v1 subscriber remains as rollback source but is no longer registered in the running
  Class Registrations module.

## Verification

- Account service: 3/3 tests passed (create/journal, exact retry, changed retry/duplicate/plaintext
  rejection).
- Runtime capability enforcement and audit: 12/12 runtime tests passed.
- SDK capability pins: backend 3/3 and public SDK 8/8 passed.
- Academic reference plugin: 14/14 passed, including account command plus plugin-owned
  profile/enrollment/durable-event assertions.
- Academic package CLI validation: all checks passed.
- Backend build: 304 files compiled.
- Architecture ownership/data-classification gate: 1,437 discovered items owned and 83 models
  classified.

This closes the local ownership defect. Real PostgreSQL migration execution, hosted approval flow,
recovery, rollback and pilot evidence remain open.
