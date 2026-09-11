# ADR-0012: Plugin Runtime Trust under Lean Core

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-005**. Extends [ADR-0004](./0004-plugin-trust.md); does not replace it.

## Context

[ADR-0004](./0004-plugin-trust.md) (DEC-011) set the trust model: reviewed, signed, in-process server plugins, whose capabilities are a contract for well-behaved code, not a sandbox. That was decided while plugins were small add-ons. Under lean core ([ADR-0009](./0009-lean-core-product-boundary.md)), plugin code will handle almost every school record. The LC-1 data classification marks 25 of the 82 models as child data, and most of them move to plugins.

The only runtime limit on a plugin today is the 10-second route timeout (`plugin-extensions.service.ts:48-53`). A plugin's own code can still read `process.env`, touch the filesystem, open network connections, or exhaust the shared process and database. A signature proves who signed the bytes, not that the code is safe.

## Decision

1. **Only Wattanam official plugins and explicitly approved publishers may run** until a separate ADR permits more. This matches DEC-007: Wattanam-only through Milestone E, then invited verified publishers in the F pilot. Public third-party server plugins stay closed while execution is in-process.
2. **The words are "trusted in-process code".** No document, screen or sales material calls plugins sandboxed.
3. **Every release, official ones included, passes:**
   - static analysis;
   - dependency and license scanning, with an SBOM;
   - malware review;
   - the human [security review checklist](../../plugins/security-review-checklist.md);
   - reproducible packaging where practical;
   - signing under the key custody, rotation and revocation rules (lean-core plan 12.10).
4. **Opening to third parties requires one of two things, each recorded in its own ADR:**
   - a formally accepted trusted-publisher governance model; or
   - isolated execution that passes the hostile-fixture proof in lean-core plan 12.2. Each plugin gets its own identity, filesystem and network policy, CPU, memory and time limits, mediated capabilities, crash containment and a kill switch.

## Consequences

- Official plugins can be built now on the existing runtime; isolation is not on the lean-core critical path.
- Every official plugin is as privileged as core. A defect in one is a core-grade incident, handled by safe mode, emergency disable and advisories (D-006), as ADR-0004 describes.
- Trusted code still needs per-plugin resource limits (lean-core plan 12.9): a slow query in one plugin can starve the school's single PostgreSQL. That is LC-2 work and does not wait for this decision.

## Alternatives considered

- **Open to reviewed third parties now.** Human review does not scale with the publisher pool, and those publishers' code would run beside every child record in the school.
- **Isolate before any extraction.** The safest position, but it would require rebuilding every capability behind a process or WASM boundary before any lean-core work, while the only publisher is Wattanam.

## Related

[ADR-0004](./0004-plugin-trust.md) · [DEC-007, DEC-011](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [Lean-core plan 12.2, 12.9, 12.10](../wattanam-lean-core-plugin-first-plan.md) · [threat-model.md](../threat-model.md)
