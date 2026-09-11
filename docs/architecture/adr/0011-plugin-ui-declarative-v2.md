# ADR-0011: Plugin UI Extension Model — Declarative UI v2

Status: **Proposed** — drafted 2026-09-11 for Gate LC-0 (**LC0-004**). Awaiting product-owner approval.

## Context

A plugin can contribute exactly one kind of page today: a `json-settings` page at schema version 1 (`plugin-extensions.service.ts:8,90`), and the frontend renderer refuses anything else (`frontend/app/plugins/[pluginId]/[[...path]]/page.tsx:30`). Plugin API routes match on the exact path string, so `/items/:id` cannot be expressed (`plugin-extensions.service.ts:22-35`).

Meanwhile 111 of the 136 frontend pages belong to future plugins, and many are far richer than a settings form: the timetable grid, score sheets and gradebook, camera/QR/USB scanning, the card designer, certificate and budget print views, and live bus tracking. Moving a module's backend while its pages stay compiled into `frontend/` would be feature flagging, not an installable plugin.

## Decision (proposed)

1. **The first production UI model is declarative UI v2**: a versioned component schema that the core frontend renders. It covers:
   - tables with sort, filter, pagination and row selection;
   - forms with validation, conditional fields and confirmation;
   - list, detail, create and edit routing;
   - summary cards, charts and dashboards;
   - file fields through scoped storage;
   - camera/QR and keyboard-wedge scanner inputs;
   - realtime refresh and progress;
   - print layouts and CSV/PDF export.

   Every component supports the installation's locale, timezone and currency, Khmer and English, keyboard and screen-reader use, and responsive layouts.
2. **No plugin JavaScript executes in the core browser origin.** A plugin sends the browser a schema (data), never code.
3. **Parameterized routes are part of the same contract.** Plugin routes gain declared path parameters and request/response schemas, which core validates, and they cannot escape the plugin's namespace.
4. **A feature stays in core until the schema can express it.** Extraction is not complete while compiled pages for it remain in `frontend/`. Where one interface needs something no generic component offers, core adds a reviewed component to the schema; the plugin still ships no code.
5. **A sandboxed, separate-origin UI for third parties is out of scope.** If it is ever needed, it gets its own security ADR: an iframe on a separate origin, a permissioned message bridge, CSP, origin checks, quotas and revocation.
6. **The mobile app renders the same schema natively** and declares which schema version it supports, so the server never sends a screen an installed app cannot draw ([ADR-0017](./0017-compatibility-windows.md)).

Required proof (lean-core plan 12.1): install a packaged plugin without rebuilding the frontend, and exercise its complete responsive UI, authorization, localization, accessibility, print/export and removal flow.

## Consequences

- UI v2 is on the critical path of every extraction wave; nothing beyond announcements moves before it exists.
- Plugin UI cannot bring cross-site scripting into the school's origin, and reviewing a plugin's UI means reviewing a schema, not a JavaScript bundle.
- The richest interfaces carry the risk. The card designer (drag-and-drop layout), the LaTeX editor, H5P content and the timetable grid will likely need dedicated core components. Their plugins (Document Designer, Learning, Timetable) are likely to be completed last and may keep compiled pages longer.
- Every plugin depends on the component library shipped in core frontend releases, so component changes follow the SDK compatibility window.

## Alternatives considered

- **Load plugin JavaScript bundles into the core origin** (module federation or script injection). The most flexible option, but plugin code would run with the user's session and full DOM access. Server-side trust already rests on human review ([ADR-0004](./0004-plugin-trust.md)); this would extend that same trust to the browser for every future publisher.
- **A sandboxed iframe on a separate origin now.** More expressive than a schema and safer than injection, but it needs a second origin per school on Railway, an authenticated message bridge and a full security review before the first plugin can ship. Kept as the future path in point 5.
- **Compile plugin pages into the frontend at install time.** Every install would need a frontend rebuild and redeploy of that school's service, which breaks install-without-rebuild and the managed Railway upload model.

## Related

[Lean-core plan 12.1](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan 6.1](../module-to-plugin-migration-plan.md) · [package-and-runtime.md](../../plugins/package-and-runtime.md) · [ADR-0017](./0017-compatibility-windows.md)
