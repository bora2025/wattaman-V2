# Railway clean-core hosted preflight — 2026-09-28

Status: **fail-closed as designed; clean core Railway environment required**

## Result

The reusable `npm run certify:railway:core-preflight -- --out <report>` command reads the linked
Railway API's non-secret deployment metadata, checks gateway health and installation state, and
requires the exact `WATTANAM_DISTRIBUTION=core` value. It never emits the full service-variable
document.

The linked `wattanam-bora-school-3` deployment was online and healthy, its installation status was
`installed`, and Railway reported a successful digest-addressed API deployment. The gate correctly
failed because the service is configured as `legacy-full`, not `core`. Therefore this environment
is not accepted as WordPress-style clean-core evidence and was not mutated.

Machine result: `wordpress-style-railway-core-hosted-preflight-result-2026-09-28.json`.

## Required next execution

Provision or designate a separate clean customer-school project with `WATTANAM_DISTRIBUTION=core`,
deploy the certified core images, complete fresh installation, then rerun this preflight before the
free/paid plugin, lifecycle, recovery and upgrade drills. Do not convert the existing production
school merely to obtain a passing test.
