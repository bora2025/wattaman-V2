# MP-2 plugin-owned roster contract

Date: 2026-09-25  
Status: local owner-side contracts and core runtime dispatch passed

## Requirement

Academic Management owns enrollment history. Attendance, Timetable, Examination, Learning, and
Finance must consume stable roster/enrollment contracts instead of querying Academic tables.

## Implementation

Academic Management now serves five owner-side routes:

- `GET contracts/classes/:id/roster?asOfIsoDate=YYYY-MM-DD`
- `GET contracts/students/:id/enrollment?asOfIsoDate=YYYY-MM-DD`
- `GET contracts/classes/:id/audience`
- `GET contracts/users/:id/classes?role=ROLE`
- `GET contracts/classes/lookup?ids=CLASS_ID`

The dated roster and enrollment routes return contract
`wattanam.academic-management.roster` version `1.0.0` and identify their source as
`plugin-enrollment-interval`; the three directory routes use bounded schema-version-1 envelopes.
The owner validates real ISO calendar dates, rejects overlapping intervals and missing profiles,
and performs row authorization inside the plugin. Administrators have global scope;
teachers/class administrators require assignment to the Class; students and parents may inspect
only their own membership relationship.

## Verification

```text
node --test backend/scripts/academic-management-reference-plugin.test.js backend/scripts/mp2-dependent-fixtures.test.js
```

Result: **17 passed, 0 failed**. This includes the owner implementation plus Attendance, Timetable,
Examination, Learning, and Finance fixture consumers.

```text
npm.cmd --prefix backend run build
```

Result: **passed**, 302 files compiled with SWC.

The core `DirectoryService` binds these routes through `PluginRuntimeService` only while Academic
Management is active. When `ACADEMIC_ROSTER_READ_OWNER=plugin`, it validates the returned contract,
uses no provider fallback, and fails closed after plugin deactivation. Runtime dispatch uses an
authenticated `SUPER_ADMIN` service principal; end-user authorization remains mandatory in each
calling core workflow, while direct calls to the owner routes retain their own row-scope checks.

```text
npm.cmd --prefix backend test -- --runInBand src/directory/directory.service.spec.ts src/plugins/plugin-runtime.service.spec.ts
```

Result: **28 passed, 0 failed**. The tests prove dispatch precedence over the Prisma migration
provider, invalid-response rejection, unavailable-after-unbind behavior, and Academic plugin
bind/unbind lifecycle.

```text
npm.cmd --prefix backend test -- --runInBand src/directory/academic-directory.provider.spec.ts src/directory/directory.service.spec.ts src/plugins/plugin-runtime.service.spec.ts
```

Result after completing all five routes: **35 passed, 0 failed**. The legacy provider contains no
SQL reference to Academic's private Class, Student Profile, or Enrollment Interval tables; a static
regression assertion protects that invariant. MP2-004 is complete at local contract scope. Hosted
install/update/recovery and pilot acceptance remain under MP2-009, not this item.
