# Communication plugin extraction worksheet

Status: namespaced messaging/posts foundation implemented locally; legacy adoption, rich UI and
lifecycle certification remain open.

## Boundary

`wattanam.communication` owns direct messages and public/news posts. `wattanam.announcements`
remains a separately versioned plugin under ADR-0018; marketplace bundles may include both without
merging their storage or runtime identities. Core owns accounts and inbox infrastructure. Academic
Management owns dated rosters used to authorize parent/child messaging.

## Implemented foundation

Version 0.1.1 defines three namespaced tables without cross-boundary foreign keys. Four granular
permissions separate reading and sending messages from reading and managing posts. Message writes
resolve both identities through Directory and enforce the safeguarding rules: no self messaging,
no parent-to-parent or student-to-student messaging, and parent/student messaging only for a child
relationship proven by the current dated Academic roster. Teacher/admin communication remains
allowed. Inbox, conversation and post feeds are bounded. Message and delivery-outbox rows commit in
one transaction; a retry job publishes stable event IDs with bounded exponential backoff. Two
host-rendered pages provide message composition, inbox, post authoring and post management through
same-permission routes.

## Remaining gates

1. Add friendly recipient discovery and parameterized conversation/read-receipt UI.
2. Certify outbox retry, reconnect and read-receipt behavior on hosted realtime infrastructure.
3. Execute the implemented Message/Post preflight, backup-bound adoption/reconciliation and rollback
   toolkit against a restored recovery backup and production-shaped PostgreSQL.
4. Certify safeguarding, retention, export/deletion and abuse controls with privacy/security review.
5. Execute real PostgreSQL, browser/mobile, marketplace lifecycle, backup/restore and pilot proofs.
6. Cut over legacy `/messages` and `/posts` only after parity and rollback proof.
