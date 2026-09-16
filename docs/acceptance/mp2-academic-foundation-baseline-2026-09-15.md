# MP-2 Academic Foundation Baseline

Date: 2026-09-15
Status: kickoff baseline captured
Wave: MP-2 academic foundation
Checklist: [MP-2 Academic Foundation Checklist](../architecture/mp2-academic-foundation-checklist.md)

## Purpose

Record the pre-extraction baseline that MP-2 work will be measured against.

## Commands executed

From repository root:

- npm.cmd run architecture:inventory:gate
- PowerShell string search equivalent for ownership-manifest assertions (rg unavailable in this shell)

## Results

Architecture inventory gate:

- PASS
- Discovered ownership records: 1,352
- Classified Prisma models: 82

Academic ownership baseline in `docs/architecture/ownership-manifest.json`:

- `Class` model owner mapped at line 235 with owner entry at line 236.
- `Student` model owner mapped at line 238 with owner entry at line 239.
- `StudyYear` model owner mapped at line 250 with owner entry at line 251.
- `Department` model owner mapped at line 253 with owner entry at line 254.
- `wattanam.academic-management` owner appears in 17 rule/model locations, including route and frontend ownership mappings.

## Baseline interpretation

- MP-2 can start from a clean ownership gate baseline.
- Academic target ownership is already represented in manifests and now needs extraction and contract execution evidence.
- Remaining MP-2 closure depends on contract publication, dependent fixtures, lifecycle drills, and restore/pilot evidence.

## Next action

Start MP2-001 and MP2-004 in parallel:

- split identity/profile boundaries for academic domain records
- define and test roster/enrollment contract surfaces for dependent plugins
