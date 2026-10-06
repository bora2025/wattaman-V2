-- wattanam-plugin-migration: 033_add_attendance_corrections_scans_alerts_part_04
CREATE TABLE IF NOT EXISTS "plugin_wattanam_academic_management_attendance_scan" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "codeHash" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('CAMERA', 'USB')),
  "principalId" TEXT NOT NULL,
  "clientTimestamp" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('ACCEPTED', 'REJECTED', 'DUPLICATE')),
  "recordId" TEXT REFERENCES "plugin_wattanam_academic_management_attendance_record"("id") ON DELETE SET NULL,
  "errorCode" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb
)
;

