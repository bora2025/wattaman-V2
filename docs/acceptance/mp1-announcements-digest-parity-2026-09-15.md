# MP-1 Announcements API and Worker Digest Parity Evidence

Date: 2026-09-15
Status: complete
Wave: MP-1 low-coupling proof

## Goal

Capture explicit evidence that API and worker roles verify and use the same plugin artifact digest, and that rollout readiness promotion is gated on required-role digest parity.

## Command executed

From backend workspace:

- npm.cmd test -- --runInBand src/plugins/plugin-artifact-cache.service.spec.ts src/plugins/plugin-rollout.service.spec.ts

## Result

- Overall: PASS
- Test suites: 2 passed, 0 failed
- Tests: 5 passed, 0 failed

## Verified assertions

- API and worker same-digest behavior passed:
  - the artifact cache test validates that API and worker independently download, verify and materialize the same SHA-256 artifact digest.
- Readiness gating behavior passed:
  - rollout promotion does not proceed until every required role reports readiness with the exact digest.

## Evidence references

- backend/src/plugins/plugin-artifact-cache.service.spec.ts
- backend/src/plugins/plugin-rollout.service.spec.ts
- docs/acceptance/lean-core/lc4-runtime-contracts.md
