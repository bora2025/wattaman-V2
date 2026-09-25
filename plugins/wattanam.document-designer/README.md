# Document Designer

Official first-production-extraction package for shared card, certificate, QR, and print templates.
The package establishes namespaced data, permission, scoped asset-storage, and bounded render-model
generation contracts. Version 0.1.4 normalizes each design into a bounded page/element model,
resolves text and QR bindings only against caller-authorized records, and renders positioned
documents through the safe host for browser print/Save-as-PDF; CSV remains a separate data export.
Its bounded staff source composes Directory labels with only Human Resources' document-safe title
projection and never exposes contact, CV-history or payroll fields.
The host-owned visual editor provides a live canvas and bounded controls for page, text, image and
QR elements; template rows link directly to it without loading plugin JavaScript.
The main page manages PNG, JPEG, and WebP assets through the
host-owned scoped file interface. Drag/resize polish, visual/browser parity, legacy asset
adoption, and legacy cutover remain gated by MP1-004 through MP1-012.
See `docs/plugins/package-and-runtime.md` in Wattanam V2 for the SDK 1.1 contract.

## Develop

```bash
npx wattanam-plugin check .          # validate plugin.json, migrations, and entry points
```

Write unit tests against `backend/index.js` using `@wattanam/plugin-sdk`'s `createTestContext()`.
LaTeX editing is deliberately outside this package and will be a separately reviewed Tool plugin.

## Package and sign

```bash
npx wattanam-plugin keygen ./keys
npx wattanam-plugin pack --source . --private-key ./keys/plugin-signing-private.pem --key-id my-key-2026 --out ./dist/wattanam-document-designer-0.1.4.wtp
```

## Publish (official repository only — see the platform's publishing policy)

```bash
npx wattanam-plugin publish --package ./dist/wattanam-document-designer-0.1.4.wtp --repository-url https://marketplace.example --admin-token $MARKETPLACE_ADMIN_TOKEN --channel beta --changelog "Privacy-minimized staff document source"
```
