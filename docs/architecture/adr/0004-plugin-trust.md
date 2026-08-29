# ADR-0004: Plugin Trust Model

Status: **Proposed** — implemented as the Version 1 default; formal acceptance is blocked on **DEC-011** at Gate **C0**.

## Context

A plugin system needs a trust boundary. The two broad options are a **sandbox** (plugins run isolated, untrusted, with the platform mediating every side effect — e.g. a WASM runtime or a separate process with no filesystem/network access) or **reviewed, signed, in-process code** (plugins run with the same privileges as core code, but only after a human review and a cryptographic signature check gate their installation). These have very different engineering cost and very different security postures.

## Decision

**Reviewed, signed, in-process server plugins. Capabilities are contracts, not a sandbox.**

- A plugin is a signed `.wtp` package (`plugin.json` + `checksums.json` + `signature.json` + payload) verified with **Ed25519** before install; a tampered, unsigned, or wrong-key package is rejected (`PLG-003`).
- Once installed, plugin backend code **runs in-process** inside the same Node.js runtime as core — there is no process boundary, no WASM sandbox, no filesystem/network jail. A plugin's JavaScript can call `process.env`, `child_process`, or raw network APIs exactly as core code can.
- The `PluginRuntimeContext` object handed to a plugin's `activate()` is the *only* sanctioned interface — a fixed, audited set of 16 capability strings across 12 documented capabilities (`api.routes`, `database.read/write`, `directory.read`, `events.publish/subscribe`, `jobs.schedule`, `navigation.register`, `notifications.send`, `permissions.register`, `realtime.notify`, `settings.read/write`, `storage.read/write`, `ui.pages`). This is a **contract for what a well-behaved plugin should use**, not an enforcement boundary a malicious plugin cannot bypass — a plugin's own code can still reach outside it, because nothing stops in-process JavaScript from doing so.
- Trust is therefore placed **before installation**, in the review-and-signing step, not at runtime. [security-review-checklist.md](../plugins/security-review-checklist.md) says this explicitly: "a plugin is trusted in-process code with no sandbox — review-before-signing covers what no automated test can" (direct `process.env`/`child_process`/network calls in a plugin's own code).
- The malicious-fixture suite (`plugin-security-fixtures.spec.ts`, C-007) proves what automated tests *can* catch given this model: path traversal, decompression bombs, duplicate zip entries, and — architecturally — that no SSRF or ambient secret access is possible **through the SDK's own runtime context** (proven by asserting the exact context object has no `fetch`/`http`/`process.env` key). It does not and cannot prove a plugin's arbitrary code never calls those things directly; that gap is covered by human review, not a test.

## Consequences

- **No sandbox escape is possible because there is no sandbox to escape** — but this also means a signed, reviewed plugin that later turns out to be malicious has full runtime privilege, identical to a core code vulnerability. The compensating controls are: signature verification (can't install an unsigned/tampered package), the review checklist (a human looked at the code before it was signed), safe mode (`PLUGIN_SAFE_MODE` — skip loading, keep admin access), and the emergency-disable/advisory process (D-006) for a plugin found malicious after the fact.
- This keeps the plugin runtime simple and fast (no IPC/serialization boundary crossing for every capability call) at the cost of requiring real trust in the signing/review process — DEC-007's "Wattanam-only through Milestone E; invited verified publishers in F pilot; no open upload in V1" exists specifically to keep that review process meaningful (a large anonymous submitter pool would make thorough human review infeasible at this trust model).
- Granular per-route permission grants (C-003 — grantable to TEACHER/STUDENT/PARENT, not just SUPER_ADMIN) limit what a *legitimate* plugin's declared routes can be reached by, but this is an authorization control on top of the trust model, not a substitute for it — it doesn't limit what the plugin's own backend code can do internally.

## Alternatives considered

- **WASM or V8 isolate sandboxing**: rejected for Version 1 — would require rebuilding every capability (`database.read/write`, `storage`, `events`) as a serialized IPC call across the sandbox boundary, a substantial engineering investment, for a publisher pool (DEC-007: invited-only through the F pilot) small enough that human review is a viable primary control instead.
- **Separate OS process per plugin**: rejected — same IPC-boundary cost as WASM sandboxing, plus process-lifecycle management (crash isolation, resource limits) the team would need to build and operate; deferred as a possible post-V1 hardening step if the publisher pool grows past what review-before-signing can support.

## Related

[DEC-011](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [package-and-runtime.md](../plugins/package-and-runtime.md) · [security-review-checklist.md](../plugins/security-review-checklist.md) · [module-boundaries.md](../module-boundaries.md) · threat-model.md (A-004)
