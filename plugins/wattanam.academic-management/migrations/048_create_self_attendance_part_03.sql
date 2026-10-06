-- wattanam-plugin-migration: 048_create_self_attendance_part_03
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_signing_key (
  "id" TEXT PRIMARY KEY,
  "algorithm" TEXT NOT NULL,
  "publicKeyPem" TEXT NOT NULL,
  "privateKeyPem" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMPTZ
)
;

