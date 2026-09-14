# LC-3 Plugin UI v2 evidence

Status: in progress

## Completed foundation

### LC3-001 — schema and version

- `plugin-ui-schema.ts` defines schema version 2 and a declarative `pages` bundle.
- A page owns a validated route template, permission, data sources and component tree.
- Components are selected from a frozen allow-list; plugins cannot ship browser code.
- Runtime activation parses the descriptor before registering any page.
- Schema v1 `json-settings` pages remain accepted as a migration compatibility surface.

### LC3-002 — security

The parser rejects the descriptor before activation when it contains:

- script or HTML markup;
- event handler, `srcDoc`, HTML or script keys;
- JavaScript or external/protocol-relative URLs;
- path traversal, absolute paths or duplicate separators;
- unknown component types, duplicate identifiers or excessive nesting.

The hostile fixture suite proves each rejection path.

### LC3-003 — permission-gated data sources

- Page and data-source permissions must be declared in the signed plugin manifest and namespaced
  by the plugin id.
- Components may reference only data sources declared on their own page.
- Sources contain only a supported HTTP method and a plugin-relative route template.
- Browser requests still pass through `PluginExtensionsService.dispatch`, whose route definition
  performs the authoritative grant check and audit.

### LC3-004 — routing

- Plugin API routes accept named path parameters and pass captured values through the isolated
  request `params` object.
- Invalid encoded separators, traversal, excessive paths, duplicate parameter names and ambiguous
  route shapes fail closed.
- UI pages declare every route parameter as `uuid`, `integer`, `slug` or bounded safe `string`.
- Static list/create paths take precedence over matching dynamic detail/edit templates.
- The frontend resolves a v2 page before requesting data and substitutes only validated,
  URI-encoded parameter values into its plugin-relative source route.

### LC3-005 — tables

- The UI-v2 activation parser requires every table to bind to a declared data source and define
  1–30 unique, safe columns.
- Page size is bounded to 1–100 and row selection is an explicit boolean capability.
- The generic renderer supports sortable and filterable columns, client pagination, per-page and
  persistent selection, responsive horizontal overflow and record totals.
- Initial empty, filter-empty, loading and per-source error states are distinct and accessible.
- All GET sources for a page load independently, so one failed source does not erase successful
  components.

## Verification

Run from `backend/`:

```text
npm test -- --runInBand src/plugins/plugin-ui-schema.spec.ts src/plugins/plugin-extensions.service.spec.ts src/plugins/plugin-runtime.service.spec.ts
npm run build
```

Result on 2026-09-14:

- 3 suites passed;
- 32 tests passed;
- 257 backend files compiled successfully.
- the frontend production build compiled and generated all 120 routes successfully.

## Remaining gate work

LC3-006 through LC3-016 and all four end-to-end acceptance statements remain open. The gate must
not be called complete until a signed sample v2 plugin proves the complete workflow without a core
frontend rebuild.
