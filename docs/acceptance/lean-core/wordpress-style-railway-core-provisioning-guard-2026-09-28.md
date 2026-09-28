# Railway clean-core provisioning guard — 2026-09-28

Status: **implementation and local contracts passed; signed image publication pending**

## Result

`tools/provision-railway-school.js` no longer hard-codes `legacy-full` after validating a clean-core
release blueprint. Operators may request `--distribution core` explicitly for an isolated
certification school. The requested value must be `core` or `legacy-full`, must match any
distribution declared by the API and web blueprint services, is recorded in dry-run output and the
provisioning journal, and is applied consistently to API, web and the web public-build variable.

The production default remains `legacy-full` until final release approval. A core blueprint invoked
without the explicit core choice fails before creating any Railway resource. Six focused deployment
contracts pass, including default preservation, mismatch rejection and the digest-pinned blueprint
contract.

## Remaining blocker

No signed release-evidence document currently supplies registry-qualified API, web and gateway image
references pinned as `repository@sha256:<digest>`. Local Docker image IDs are not portable registry
references and must not be substituted. Publish the signed core beta images first; then render the
release blueprint, dry-run provisioning, explicitly approve the resulting project plan, and execute
the separate Railway certification school.
