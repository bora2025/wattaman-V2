-- wattanam-plugin-migration: 005_create_organization_foundation
CREATE TABLE plugin_wattanam_organizing_management_attendance_setting (
  "id" TEXT PRIMARY KEY, "workDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  "checkInTime" TIME NOT NULL DEFAULT '08:00', "lateAfterTime" TIME NOT NULL DEFAULT '08:15', "checkOutTime" TIME NOT NULL DEFAULT '17:00',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (jsonb_typeof("workDays") = 'array')
);
