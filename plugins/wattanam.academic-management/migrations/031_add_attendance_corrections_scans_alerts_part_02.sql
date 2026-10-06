-- wattanam-plugin-migration: 031_add_attendance_corrections_scans_alerts_part_02
CREATE TABLE IF NOT EXISTS "plugin_wattanam_academic_management_attendance_correction" (
  "id" TEXT PRIMARY KEY,
  "recordId" TEXT NOT NULL REFERENCES "plugin_wattanam_academic_management_attendance_record"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousValue" JSONB NOT NULL,
  "newValue" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)
;

