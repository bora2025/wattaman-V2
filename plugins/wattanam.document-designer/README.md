# Document Designer

Official first-production-extraction package for shared card, certificate, QR, and print templates.
The initial package establishes the namespaced data and permission contracts. Rich canvas editing,
generation, storage adoption, and legacy cutover remain gated by MP1-004 through MP1-012.
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
npx wattanam-plugin pack --source . --private-key ./keys/plugin-signing-private.pem --key-id my-key-2026 --out ./dist/wattanam-document-designer-0.1.0.wtp
```

## Publish (official repository only — see the platform's publishing policy)

```bash
npx wattanam-plugin publish --package ./dist/wattanam-document-designer-0.1.0.wtp --repository-url https://marketplace.example --admin-token $MARKETPLACE_ADMIN_TOKEN --channel beta --changelog "Initial release"
```
