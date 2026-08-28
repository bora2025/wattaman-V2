# Gate C SDK 1.0 Freeze and Compatibility Policy — 2026-08-28

## Result

**C-006** (freeze SDK 1.0 and compatibility policy) is complete. `docs/plugins/package-and-runtime.md` is now the definitive, accurate SDK 1.0 contract reference — rewritten from a badly stale document (it still described routes as `SUPER_ADMIN`-only and announcements as "remains in core until a cutover test," both long since superseded by C-003/C-004) into the frozen contract: all twelve capabilities with exact `context.*` signatures, the permission model, the lifecycle/data-preservation guarantees, and an explicit compatibility/freeze policy with a changelog. A new test (`plugin-sdk-contract.spec.ts`) pins the exact capability list and version constants in CI.

## What changed

- **`docs/plugins/package-and-runtime.md`** rewritten top to bottom against the actual current code (not the design intent from before this session's work): the capability table now lists all twelve (`api.routes`, `database.read/write`, `directory.read`, `events.publish/subscribe`, `jobs.schedule`, `navigation.register`, `notifications.send`, `permissions.register`, `realtime.notify`, `settings.read/write`, `storage.read/write`, `ui.pages`) with their exact method signatures and cross-references to the acceptance doc that proved each one live; the permission model section describes the real grant/audit system built in C-003; the lifecycle section describes the real advisory-lock/data-preservation/core-upgrade-gate behavior certified in C-001/C-002/C-005; the reference-plugin section describes the real, fully-cutover announcements plugin from C-004; the administrative-endpoints list is complete including `GET /plugin-api/my-extensions`.
- **New "Compatibility and freeze policy" section**: states plainly what freezing 1.0 means — the twelve capabilities, their signatures, and the manifest/migration/permission/lifecycle rules won't change within the 1.x line; additive extensions (new capability, new optional field, new method on an existing capability) are allowed within 1.x with a pinning-test + doc update; anything that removes or changes an existing signature requires `2.0.0` and a documented migration path. Explicitly separates the **technical** freeze (an engineering commitment, made now) from the **commercial support-window duration** (a Product Owner decision gated on DEC-011, still `proposed` — not something engineering can unilaterally promise a number for).
- **Changelog**: records SDK `1.0.0`'s final, frozen capability set as of this freeze date.
- **`backend/src/plugins/plugin-sdk-contract.spec.ts`** (new): pins `PLUGIN_CAPABILITIES` (exact list, sorted) and `PLUGIN_SDK_VERSION`/`PLUGIN_RUNTIME_VERSION` (`'1.0.0'`). A future accidental capability addition/removal or version bump now fails this test, forcing a deliberate, reviewed change to both the test and the doc's changelog — the actual enforcement mechanism behind "frozen," not just a documentation promise.

## Verification

```text
Full backend suite: 32 passed, 32 total (150 tests, +2 from this change)
Backend build (swc): 173 files compiled
TypeScript build: passed (tsc --noEmit)
```

This is a documentation-and-contract-pinning change; no runtime behavior changed, so no live-database verification was needed — the underlying capabilities themselves were already each individually live-verified in their own acceptance docs (linked from the rewritten reference doc).

## Open items

- The commercial support-window length for SDK 1.0 (how long it stays supported once/if a 2.0 ships) is explicitly left open pending DEC-011 approval — this is correct scoping, not an oversight.
- C-007 (plugin review checklist + malicious-fixture suite) and C-008 (plugin CLI, typed SDK package, local harness, templates, publish tooling) both depend on this freeze and remain open.
