# MP1 Document Designer Clean-Core Marketplace Install — Local Evidence

Date: 2026-09-28  
Status: signed artifact and marketplace install pipeline passed locally; hosted clean-school proof remains open

The certification uses the actual `plugins/wattanam.document-designer` 0.1.6 source rather than a
synthetic manifest or placeholder buffer. It:

1. generates an isolated Ed25519 publisher key;
2. packs the complete plugin source into a deterministic `.wtp` archive;
3. verifies every archive checksum, migration checksum, entry point, publisher signature and core
   compatibility with the production `PluginPackageVerifier`;
4. exposes those exact bytes as the signed marketplace release artifact;
5. computes consent from the verified manifest;
6. downloads and checksum-verifies the artifact through `MarketplaceCommerceService`;
7. passes the exact archive and release-scoped trusted key to plugin installation;
8. persists the trusted publisher key and activates `wattanam.document-designer`.

The test begins with no existing plugin-installation rows or source-directory activation path. It
therefore proves the local signed-package and marketplace acquisition boundary required for a clean
core. Database migration/lifecycle behavior is covered separately by the real-PostgreSQL
certification.

Verification:

```text
npm test -- --runInBand src/marketplace/document-designer-clean-core-install.spec.ts
# 1 suite passed; 2 tests passed
```

The second test continues with the same real signed release through production `PluginsService`
install, activation, deactivation, removal, signed reinstall and reactivation. Removal clears the
registry/artifact directory but reports `dataPreserved: true`; the plugin-owned template fixture
survives and both installs reapply the immutable migration without cleanup. This is local lifecycle
evidence for MP1-010, not a hosted restart/backup drill.

This is not the hosted MP1-008 acceptance. A newly provisioned Railway school must still link to
the production-shaped marketplace, install this release through the school UI/API, restart, and
show the plugin-owned navigation and page before MP1-008 can be marked complete.
