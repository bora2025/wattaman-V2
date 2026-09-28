# WordPress-style Reporting PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Read-only composition boundary

Reporting `0.1.2` retains no database capability and owns no tables. The certification writes only
bounded, prefixed fixtures into the core `PluginReadModel` contract table, reads them through the
same owner/model/version/key shape used by the plugin, and removes those fixtures afterward.

Automated CSV output now prefixes cells beginning with spreadsheet formula control characters
(`=`, `+`, `-`, `@`, tab or carriage return) before ordinary CSV quoting. This prevents a student
name or number from becoming an executable spreadsheet formula.

## Certification command

`npm run certify:reporting:postgres` requires the exact
`REPORTING_CERTIFY_ALLOW_WRITE=reporting-readmodels-only` guard and then:

- proves the plugin declares no migrations or database capabilities;
- seeds only version-one, `report-cert-*` read-model records;
- rejects a teacher before Directory or read-model access;
- builds an administrator’s dated Academic-roster report with bulk student keys;
- consumes installed Attendance and Finance projections from PostgreSQL;
- degrades absent and disabled Examination, Transportation and Communication providers;
- excludes scanner, receipt and other source-private fields;
- verifies every provider query uses version 1 and exactly the bounded roster keys;
- verifies BOM-prefixed, formula-safe CSV output; and
- builds a staff report from Directory identities and Human Resources’ keyed projection without
  exposing contact or marker identity.

The PostgreSQL 16 PR backend job runs this certification after Parent Portal.

## Local verification

- Certification guard and bounded PostgreSQL fixture harness: 2 passed.
- Reporting source, authorization, privacy, degradation and export suites: 7 passed.

## Remaining acceptance gap

The first hosted PostgreSQL run, administrator/non-administrator browser proof, restored-backup
comparison against approved legacy totals, print/PDF accessibility, signed marketplace lifecycle,
portable backup/restore, observability, rollback-window approval and controlled pilot remain before
production cutover.
