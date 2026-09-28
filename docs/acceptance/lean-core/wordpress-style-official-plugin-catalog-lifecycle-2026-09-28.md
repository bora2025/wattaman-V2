# Official Plugin Catalog Signed-Package Lifecycle — Local Evidence

Date: 2026-09-28  
Status: catalog-wide local package/lifecycle gate passed; PostgreSQL, hosted and pilot gates remain separate

The catalog-wide certification discovers every schema-v1 plugin under `plugins/` and uses its real
source tree. For all 13 current official plugins it:

1. generates an isolated Ed25519 publisher key;
2. builds a complete signed `.wtp` archive;
3. verifies archive membership, checksums, migration checksums, entry files, signature and core
   compatibility using `PluginPackageVerifier`;
4. rejects duplicate plugin IDs and verifies every required dependency exists at a compatible
   version;
5. installs and activates packages through production `PluginsService` in dependency order;
6. creates a separately signed preceding patch-version artifact for every real package, deactivates
   the catalog in reverse dependency order, rolls every plugin back in dependency order, and
   verifies durable data remains;
7. deactivates again and updates every plugin to its current release in dependency order;
8. deactivates and removes them in reverse dependency order;
9. verifies removal reports data preservation and retains a per-plugin durable-data sentinel; and
10. reinstalls and reactivates every exact current signed artifact in dependency order.

The test is automatically included in the backend Jest suite used by PR validation. It is
data-driven, so adding a new official plugin automatically adds it to the gate.

Verification:

```text
npm test -- --runInBand src/plugins/all-plugin-package-lifecycle.spec.ts
# 1 suite passed; 1 test passed; all 13 discovered plugins certified
```

This proves signed package and registry lifecycle portability—including version rollback and
forward update—without a source-directory activation shortcut. The preceding-version artifacts
reuse the current source/migration lineage with a lower patch version; therefore this is a lifecycle
test, not a claim that historical feature migrations were replayed. Migration execution is mocked
here because each plugin's real-PostgreSQL certification is tracked independently. It does not
claim hosted installation, browser parity, real backup restore or pilot acceptance.
