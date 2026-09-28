# WordPress-style realtime SDK alignment

Date: 2026-09-26

## Finding and correction

Communication and Transportation used a mock-only `realtime.notify(...)` method that does not
exist in Plugin SDK 1.1 or the production runtime. The supported capability is
`notifyUser(userId, event, payload)`, which namespaces socket events by plugin and prevents a
plugin from broadcasting or impersonating a core event.

- Communication delivery now targets the outbox receiver through `notifyUser`, with message and
  stable outbox event identifiers in the payload.
- Transportation location delivery now derives current assigned student and parent identities from
  plugin assignments plus the dated Academic roster, deduplicates recipients, and invokes
  `notifyUser` after the location transaction commits.
- No plugin source retains a call to the nonexistent `realtime.notify` API.
- Communication now contributes its primary dashboard card through the extension registry.

## Verification

- Communication source and behavior suites pass, including stable receiver-targeted delivery.
- Transportation behavior suite passes 9 tests, including post-commit delivery only to the assigned
  student and parent.
- The production runtime and SDK expose the same `notifyUser` signature used by both plugins.

## Remaining acceptance gap

Hosted multi-user WebSocket delivery, reconnect/deduplication behavior, outbox retry under outage,
and browser/mobile notification evidence remain required.

