-- wattanam-plugin-migration: 051_create_self_attendance_part_06
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_device (
  "id" TEXT PRIMARY KEY,
  "studentProfileId" TEXT NOT NULL,
  "directoryUserId" TEXT NOT NULL,
  "deviceIdHash" TEXT NOT NULL,
  "label" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMPTZ,
  UNIQUE ("studentProfileId", "deviceIdHash")
)
;

