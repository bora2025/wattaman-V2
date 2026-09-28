# Core image signature verification

Date: 2026-09-28
Scope: WordPress-style Phase 5 release and Railway provisioning boundary

## Accepted implementation

- Release evidence records the GitHub repository, workflow ref, run ID and run attempt.
- The workflow lowercases `GITHUB_REPOSITORY` before constructing OCI/GHCR references, allowing
  mixed-case GitHub repository names without producing invalid image paths.
- Manual release inputs are validated before dependency installation or image building: the version
  must be stable SemVer (the workflow adds `-beta`) and release notes must be non-empty and bounded.
- Blueprint rendering accepts only the approved `core-release.yml` workflow on `main`.
- The release workflow verifies all three keyless signatures after signing and before publishing
  Marketplace metadata.
- Railway execution independently verifies API, web and gateway GHCR digest signatures with
  `cosign` immediately before the first Railway mutation.
- Verification pins both the certificate identity and GitHub Actions OIDC issuer.
- Missing `cosign`, a non-GHCR reference, a missing signature, or a different workflow identity
  fails closed.
- Self-hosted preflight binds PostgreSQL/API/web/gateway images and `APP_VERSION` to the same
  blueprint before signature verification, preventing mixed-release environment files.

## Verification

```text
node --test tools/publish-core-release.test.js tools/release-evidence.test.js tools/verify-core-image-signatures.test.js tools/core-deployment-blueprint-contract.test.js tools/core-release-workflow-contract.test.js tools/provision-railway-school.test.js
```

Result: 17 focused tests passed, 0 failed. The complete tooling suite passed 123 tests, including
the publication boundary and self-hosted environment-binding contracts.

## Remaining production evidence

This gate proves the implementation contract. Phase 5 remains open until the first workflow run
publishes the signed beta images, the operator verifies them during a real Railway provisioning
run, and the resulting clean-core school passes the hosted acceptance scenario.
