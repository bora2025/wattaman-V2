# Transportation plugin extraction worksheet

Status: namespaced foundation and guarded local API/UI slice implemented; adoption, hosted parent
tracking/device proof and lifecycle certification remain open.

## Ownership boundary

`wattanam.transportation` owns routes, stops, vehicles, driver and rider assignments, location
history, live location publication and transport reports. Core Directory and Academic Management
own identities and dated class rosters; the plugin stores only stable identifiers. Parent Portal
consumes the plugin's explicitly authorized child-to-vehicle read model and never reads
Transportation tables directly.

## Implemented foundation

Version 0.1.1 defines five dependency-ordered namespaced tables with coordinate, capacity, status,
speed, heading and dated rider-assignment constraints. Four granular permissions separate viewing,
management, location capture and parent tracking. Vehicle creation validates route and driver
references; rider assignment validates a current Academic roster member; history is bounded; and
location capture persists transactionally before publishing a realtime event. Four declarative
pages cover vehicles, routes, a parameterized tracking view and a parent view. Route and stop
update/delete operations preserve dependency safety by refusing to delete an assigned route. The parent endpoint
derives the caller's children from dated class rosters and returns only their assigned active
vehicles. Focused manifest, migration, route/UI binding, validation and behavior tests pass locally.

## Remaining gates

1. Complete the remaining richer driver workflow and hosted operator UI parity.
2. Certify the privacy-safe parent/child projection in hosted browser/mobile sessions.
3. Execute the implemented five-dataset preflight, backup-bound adoption/reconciliation and rollback
   toolkit against a restored recovery backup and production-shaped PostgreSQL.
4. Certify location write concurrency and realtime behavior on production-shaped PostgreSQL.
5. Certify maps, browser/mobile location capture, accessibility and retention/privacy controls.
6. Certify marketplace lifecycle, backup/restore, restored-backup adoption and controlled pilot.
7. Cut over legacy Bus routes only after parity and rollback proof.
