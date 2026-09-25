# Parent Portal

Parent-link approval and parent-facing composition over optional versioned plugin read models. It
stores only workflow state and stable Directory IDs; it never reads another plugin's tables.

Newly created parent accounts receive an opaque unknown password and must use the core password
reset flow. The plugin never returns or stores a plaintext credential.

