# WordPress-style clean-core artifact baseline — 2026-09-25

Status: **failing baseline recorded; enforcement tool implemented**

Plan: [WordPress-style core and plugin reform](../../architecture/wordpress-style-core-plugin-reform-plan.md)

## Purpose

LCF-005 and the WordPress-style reform require optional features to be physically absent from a
clean-core artifact. Runtime route blocking and hidden navigation are insufficient. This evidence
introduces an executable artifact gate and records the current legacy-full build as the migration
baseline.

## Commands

```text
node --test tools/verify-clean-core-artifact.test.js
npm run architecture:clean-core:report
npm run architecture:clean-core:gate
```

The report command is diagnostic and returns success so developers can inspect the transition.
The gate command returns a failure while any violation remains.

## Evidence

- Verifier fixture suite: **5 passed, 0 failed**.
- Current artifact result: **FAIL**.
- Current violations: **135**.
- Optional compiled backend modules/proxies: **23**.
- Optional static frontend routes: **112**.
- The verifier reads optional backend ownership from the authoritative root module registry.
- It detects both directory-based TypeScript output and optional module symbols embedded in a
  single JavaScript bundle.
- It reads Next.js's produced `app-paths-manifest.json`; it does not infer absence from middleware,
  environment flags or navigation visibility.

## Decision

The current application is still a `legacy-full` artifact and cannot satisfy LCF-005. The strict
gate must not be marked complete, and new-school provisioning must not switch to `core` yet.

The next implementation step is to create physically separate backend and frontend core build
artifacts, rerun this gate against them, and then add the strict command to required CI.

