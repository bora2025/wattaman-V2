# WordPress-style core release image enforcement

Date: 2026-09-26  
Status: release pipeline corrected and contract-gated; first published beta run pending

## Defect corrected

The core release workflow previously used `backend/Dockerfile` and `frontend/Dockerfile` implicitly.
Those are the normal distribution images and did not prove that a release named “core” excluded
legacy optional modules.

The workflow now:

1. installs and tests backend/frontend dependencies;
2. runs the core release/Docker artifact contracts;
3. builds both physical core artifacts with `npm run build:core`;
4. runs `npm run architecture:clean-core:gate` before any image publication;
5. builds the API image explicitly from `backend/Dockerfile.core`;
6. builds the web image explicitly from `frontend/Dockerfile.core`;
7. scans each immutable API, web and gateway digest for all high/critical OS and library
   vulnerabilities, including findings without an available fix; all scans run and their available
   JSON reports are retained even when one fails;
8. signs and attests the resulting immutable digests only after all three scans pass; and
9. promotes those existing beta digests without rebuilding different images.

## Regression gate

`tools/core-release-workflow-contract.test.js` fails if:

- either release image stops selecting its core Dockerfile;
- the physical core build or clean-core scan disappears;
- image publication moves before the clean-core gate;
- a legacy `npm run build` is substituted in the core release; or
- stable promotion begins rebuilding images instead of promoting tested beta digests.
- any of the three digest-level vulnerability scans is removed, weakened to a non-blocking exit,
  moved after signing/publication, or stops retaining its JSON report.

The required PR clean-core job and the release workflow both execute this contract.

## Local verification

Sixteen checks pass across:

- core Docker packaging;
- core release and promotion workflow boundaries;
- marketplace-only school installation;
- consent-aware lifecycle UI; and
- clean-core artifact verifier fixtures.

## Remaining acceptance gap

This proves source and release configuration, not a published image. The first beta workflow must
produce signed digests, those exact images must boot against a clean core database, and both
Railway and self-hosted drills must complete the new-school lifecycle before production default.
