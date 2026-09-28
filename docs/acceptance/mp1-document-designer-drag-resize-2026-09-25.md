# MP1 Document Designer Drag/Resize — Local Browser Evidence

Date: 2026-09-25
Status: focused local browser behavior and clean teardown passed; hosted parity remains open

The host-owned visual editor now supports pointer dragging and southeast-handle resizing. Movement
and dimensions are clamped to the configured page bounds, use pointer capture, and persist through
the existing validated design route. No plugin HTML or JavaScript is executed.

The production frontend build completed successfully. On 2026-09-28, the focused Playwright run
passed 12/12 scenarios: the same four journeys on phone, tablet and desktop. They cover create and
detail routing, moving an element from `(20,20)` to `(60,50)`, resizing it from `180x40` to
`210x60`, confirming those values in the PATCH payload, and adding/saving a host-rendered shape.
The dedicated runner uses an isolated random
port, production server and bounded process-tree cleanup. A purpose-built reporter emits the final
Playwright status from `onEnd`; the runner accepts only that machine-readable sentinel and exited
normally with code 0. Parser tests cover pass, failure, timeout, interruption and misleading human
output. This remains local evidence, not hosted pixel/output parity.

Commands:

```text
node --test scripts/run-plugin-ui-e2e.test.js
node scripts/run-plugin-ui-e2e.js e2e/plugin-ui/document-designer-ui.spec.ts
```
