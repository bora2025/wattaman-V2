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

### LC3-006 — forms

- Forms bind only to declared POST, PUT or PATCH sources; optional initial values bind only to a
  declared GET source.
- The activation parser allows text, email, number, date, datetime, select, textarea and checkbox
  fields, with bounded field/choice counts and validated required/disabled/min/max/length options.
- Conditional fields may depend only on another declared field and compare primitive values.
- The generic renderer performs client validation, strips hidden fields from submission, converts
  numeric inputs, prompts for declared confirmation and disables controls while saving.
- API-wide and field-specific server errors are displayed accessibly; success feedback is announced
  and the page's GET sources refresh after mutation.

### LC3-007 — actions

- Action descriptors reference only declared non-GET data sources and define bounded labels,
  optional request bodies, confirmation text and destructive presentation.
- Single actions support create/update/delete-style POST, PUT, PATCH and DELETE mutations.
- Bulk actions consume selections from a declared GET source and execute each selected identity
  independently, with URI-safe optional path substitution and configurable body identity field.
- The renderer exposes live completed/total/failed progress, retains partial-failure counts, blocks
  concurrent action runs and refreshes all page reads after completion.
- Empty bulk selections are rejected before mutation and destructive actions remain explicit.

### LC3-008 — dashboards

- Metrics resolve a validated value path, optionally display a trend, and support number, percent,
  currency or text presentation contracts.
- Key/value cards accept only bounded labels and safe nested data paths.
- Status indicators map primitive server values to neutral, success, warning, danger or info states.
- Bar, line and pie charts use host-owned Recharts components, bounded item counts and validated
  category/value paths; plugins never supply executable chart code.
- Every dashboard component provides loading, empty and source-error handling. Charts include a
  textual screen-reader representation of every plotted value.

### LC3-009 — files

- The storage SDK now exposes canonical-base64 binary read/write behind `storage.read` and
  `storage.write`; the existing provider namespace and per-file limit remain authoritative.
- File descriptors require an autoload listing source, write source and parameterized non-autoload
  download source; an optional DELETE source must use the same declared identity parameter.
- Upload size is bounded to 10 MB at the UI contract and again by the configured storage limit.
- Only PNG, JPEG, WebP, PDF, plain text and CSV are accepted. SVG, HTML and executable content
  types fail activation.
- The renderer validates browser file type/size, reports upload/delete errors, downloads with the
  server-provided safe filename and previews through short-lived object URLs. Text previews use a
  sandboxed frame; image/PDF previews never execute plugin-provided browser code.
- Binary storage tests prove byte-exact round trips and cross-plugin isolation.

### LC3-010–012 — output, realtime and scanner input

- Print descriptors bind declared fields to an autoload GET source and bound output to 10,000 rows.
  The host owns print layout, safe filenames, UTF-8 CSV quoting and PDF generation.
- Realtime declarations accept only safe event suffixes. The browser joins its authenticated user
  room, listens only on `plugin:<pluginId>:<event>`, debounces bursts and removes listeners on exit.
- Scanner declarations bind camera and keyboard modes to one write source. The host validates code
  length, suppresses rapid duplicates, owns camera teardown and reports server acceptance/errors.

### LC3-016 — permission parity

`listForPrincipal` now checks the v2 page permission using the same persisted role grant used for
navigation and dispatch. A parity test proves a denied role receives neither navigation nor page
metadata and receives a permission error if it calls the route directly.

### LC3-013 — localization and regional formatting

- A page may carry bounded BCP-47 translation dictionaries and must name a default language that
  exists in the descriptor.
- The host maps Wattanam's Khmer selection to `km`, uses Khmer/English fallback keys for component,
  field, action and status labels, and never accepts markup in translated values.
- Number, currency, date and datetime fields use `Intl` with the installation's configured locale,
  IANA timezone and ISO currency. Safe English/Khmer defaults apply while installation metadata is
  loading.
- Schema tests cover English/Khmer acceptance and missing-default rejection; backend and the full
  120-route frontend production build pass.

## Verification

Run from `backend/`:

```text
npm test -- --runInBand src/plugins/plugin-ui-schema.spec.ts src/plugins/plugin-extensions.service.spec.ts src/plugins/plugin-runtime.service.spec.ts
npm run build
```

Result on 2026-09-14:

- 3 suites passed;
- 6 focused suites and 46 tests passed at the LC3-012 checkpoint;
- 257 backend files compiled successfully.
- the frontend production build compiled and generated all 120 routes successfully.

## Remaining gate work

LC3-014, LC3-015 and all four end-to-end acceptance statements remain open. The gate must
not be called complete until a signed sample v2 plugin proves the complete workflow without a core
frontend rebuild.
