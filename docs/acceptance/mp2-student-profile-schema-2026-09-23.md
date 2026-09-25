# MP-2 Student profile schema foundation

Date: 2026-09-23  
Status: local additive schema and journaled adoption pass; cutover remains open

Academic Management version 0.1.1 adds migration `009_create_student_profile`. The namespaced table
owns academic profile attributes while referring to core identity only by a stable `userId` value.
It deliberately has no foreign key to legacy `User`, `Student`, or `Class` tables. Enrollment stays
in the separate interval table.

The migration is additive, contains one immutable statement and is registered in the signed-package
manifest by SHA-256. It does not redirect reads or writes and does not delete or alter legacy data.

The read-only `academic-student-profiles-adoption-preflight.js` now scans stable-ID chunks, emits no
PII, produces a deterministic SHA-256 fingerprint, verifies the target is installed and empty, and
fails closed for duplicate identity/QR mappings, unsupported sex values and invalid birth dates.

The backup-bound `academic-student-profiles-adopt.js` uses an atomic journal and stable-ID chunks.
It requires an exact school-slug confirmation and the preflight source fingerprint, refuses an
unrelated non-empty target, supports a zero-write dry run, resumes an interrupted committed chunk,
uses idempotent upserts, and finishes only after exact source/target count and fingerprint
reconciliation. Legacy Student rows remain authoritative and untouched; read/write cutover is a
separate gate.

The controlled `academic-student-profiles-rollback-drill.js` verifies the same backup digest and
reconciled journal identity before returning compatibility routing to legacy. It records the
`rolled_back` state without deleting either dataset and fails closed for an absent, incomplete, or
mismatched journal. This is local recovery-tooling evidence, not yet a restored-database drill.

The Academic Identity provider now supplies a reversible runtime seam. It defaults to legacy
Student reads, rejects invalid ownership configuration, and in explicit plugin mode constructs the
existing API profile shape from the namespaced Student profile, current enrollment and Class data.
Parent assignment can be placed in atomic shadow-write mode: it locks and compares both copies,
validates the parent account, and changes both stores in one transaction; drift aborts before either
write. This supports a rollback window without silently allowing the stores to diverge.

The unified Academic Management cutover-readiness report now includes Student Profiles. It compares
exact source/target counts and fingerprints, verifies the profile adoption journal identity and
backup digest, and shares the existing plugin-active and maintenance-lock gates. An absent target is
never queried, and any mismatch keeps `ready` false.

The declarative Academic UI now exposes complete class-roster operations without a core rebuild:
add, select and remove students, explicitly confirmed orphan cleanup, and a row-linked Student edit
page backed by class-scoped GET/PATCH routes. Update and delete enforce both class ID and Student ID,
preventing a record from being mutated through another class URL. The generic table contract gained
validated internal row routes, and optional select fields can explicitly clear their value.

Local verification on 2026-09-23:

- plugin CLI manifest and all nine migration checksums: pass;
- Academic reference plugin: 6/6 pass;
- Student profile preflight: 3/3 pass;
- Student profile adoption safety/resume/reconciliation: 3/3 pass;
- Student profile rollback safety and journal validation: 3/3 pass;
- Academic identity provider routing/shadow-write suites: 28/28 pass;
- Unified Academic cutover readiness (including Student Profiles): 3/3 pass;
- Academic route/reference suite: 6/6 pass;
- Plugin UI schema, including the full Academic descriptor: 26/26 pass;
- frontend production build: pass;
- backend production build: pass.

Full completion still requires a restored-backup drill against real PostgreSQL, hosted
cutover/rollback evidence for the routing seam, lifecycle certification and pilot approval.
