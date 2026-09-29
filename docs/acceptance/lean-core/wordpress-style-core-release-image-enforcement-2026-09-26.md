# WordPress-style core release image enforcement

Date: 2026-09-26  
Status: signed beta `0.2.0` published; hosted runtime certification pending

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

## First signed production beta

On 2026-09-28/29, workflow run `36417099742` (commit `744104d`) proved the complete physical
release path through:

- backend/frontend verification and the zero-violation clean-core gate;
- immutable API, web and gateway image builds with SBOM/provenance;
- passing HIGH/CRITICAL fixable-vulnerability gates for all three digests;
- keyless Cosign signing and signature verification;
- digest-pinned school blueprint rendering and local verification; and
- retained release evidence and Trivy reports.

The production Marketplace accepted beta release `0.2.0` as record
`682ae508-518c-4f53-8712-9f2af85f98f6` with these verified immutable images:

- API `sha256:1fa473eb6bf8970cea6a3338e7accf7fa47c30a0de3231814a951b7ca93759f1`;
- web `sha256:3db0c9c0a391515cfa25e546251ea03cf32e6d0eef2c2b9f2252e421274c45e1`; and
- gateway `sha256:2c3fdcc2f4517336251255f5f68e5fe753f7498e57bf49285f2e22915c01c1d7`.

GitHub's repository-attestation API is unavailable for user-owned private repositories, so those
two optional repository-attestation steps are conditionally skipped. BuildKit provenance/SBOM,
Cosign signatures, local signature verification, vulnerability reports and the release-evidence
artifact remain mandatory. Production publication also exposed and fixed BOM/whitespace handling
for CI-injected URL and bearer-token values.

## Remaining acceptance gap

The published images and signed evidence are now proven. Those exact digests must still boot
against a clean core database, and both Railway and self-hosted drills must complete the full
new-school lifecycle before production default.
