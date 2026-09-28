# Parent Portal

Version 0.1.2 serializes request resolution before invoking audited account commands, preventing a
losing concurrent approval from undoing the winning guardian assignment.

Parent-link approval and parent-facing composition over optional versioned plugin read models. It
stores only workflow state and stable Directory IDs; it never reads another plugin's tables.

Newly created parent accounts receive an opaque unknown password and must use the core password
reset flow. The plugin never returns or stores a plaintext credential.
