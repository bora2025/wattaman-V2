# MP1 Document Designer Visual-Parity Contract — Local Evidence

Date: 2026-09-28  
Status: local semantic and browser rendering contract passed; hosted pixel comparison remains open

Document Designer 0.1.6 closes the known local projection gaps between legacy `CardDesign` data
and the safe schema-v2 host renderer. The bounded projection now retains:

- page dimensions, background, frame color/width and rounded canvas;
- element geometry, rotation and layer order;
- text binding/static value, color, size, weight, style, alignment and an allowlisted font family;
- converted image identity, fit, opacity and radius;
- QR/photo geometry and borders;
- rectangle/circle/line fill, border, opacity, line style and validated gradient.

All numeric values remain bounded. Fonts and colors are allowlisted/validated, converted images
must use scoped-storage UUIDs, person photos remain same-origin or canonical embedded raster data,
and arbitrary CSS/HTML/script is never accepted.

Verification:

```text
node --test scripts/document-designer-reference-plugin.test.js
# 11 passed, 0 failed

node packages/plugin-cli/bin/cli.js check plugins/wattanam.document-designer
# ALL CHECKS PASSED

node node_modules/typescript/bin/tsc --noEmit
# exit 0

npm run build
# production build and TypeScript passed

node scripts/run-plugin-ui-e2e.js e2e/plugin-ui/document-designer-ui.spec.ts
# 12 passed on phone/tablet/desktop; WATTANAM_PLAYWRIGHT_RESULT=passed; exit 0
```

This evidence proves deterministic property preservation and safe host rendering locally. It does
not substitute for screenshot/pixel comparison using representative production templates on a
restored hosted school, which remains part of MP1-009.
