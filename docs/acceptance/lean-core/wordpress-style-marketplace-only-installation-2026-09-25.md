# WordPress-style marketplace-only installation evidence

Date: 2026-09-25  
Scope: customer-school plugin acquisition boundary

## Accepted boundary

A customer school may browse the linked Marketplace catalog and request installation by plugin id
and version. It may activate, deactivate, roll back, remove and grant permissions for an installed
plugin. It must not upload, inspect or install a local `.wtp` package.

Package ingestion remains available in the central Marketplace for two controlled workflows:

- an authenticated publisher submits a package for review;
- an authenticated platform operator publishes an approved release.

These central workflows do not make a raw-package endpoint available to a customer school.

## Enforced evidence

`tools/marketplace-only-plugin-install-contract.test.js` verifies all of the following on every PR:

1. `PluginsController` exposes lifecycle operations but no multipart interceptor, uploaded-file
   parameter, package inspection route or direct call to `PluginsService.install()`.
2. the school Plugin Manager loads the Marketplace catalog and installs by catalog id/version, and
   contains no file input, `FormData`, `.wtp` selection or local-package action;
3. the school Marketplace install endpoint requires JWT authentication plus `SUPER_ADMIN`, accepts
   only plugin id, version, a consent digest and the optional activation choice, and cannot accept
   package bytes;
4. publisher and operator package uploads remain protected respectively by `requireSession` and
   `requireAdmin` in the central Marketplace API;
5. first-run HTTP setup has no plugin-package field or verifier, and unattended setup rejects the
   retired `INSTALL_INITIAL_PLUGIN_FILES` input with instructions to link Marketplace after core
   installation.

The existing package verifier, signed artifact download and entitlement checks still execute behind
the Marketplace install service. This gate controls acquisition entry points; it does not bypass or
replace cryptographic verification.

## Verification

Run:

```text
node --test tools/marketplace-only-plugin-install-contract.test.js
```

This closes `LCF-003`. A real clean Railway installation, Marketplace link and plugin install remain
required by `LCF-008`; this source/CI contract is not presented as hosted proof.

## 2026-09-28 hardening

The last local-ingestion seam was removed from first-run preflight. Previously the unattended CLI
could pass base64 package archives for compatibility inspection without installing them. That was
still inconsistent with the marketplace-only boundary and could consume untrusted archive input
before a school was linked. `InstallDto`, `InstallationPreflightService`, `InstallationModule` and
the CLI now have no package-verification dependency or package bytes. The contract suite explicitly
guards this boundary.
