-- wattanam-plugin-migration: 046_create_self_attendance_part_01
ALTER TABLE plugin_wattanam_academic_management_attendance_record
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'TEACHER_MANUAL',
  ADD COLUMN IF NOT EXISTS "attendanceWindowId" TEXT,
  ADD COLUMN IF NOT EXISTS "originalScanAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "synchronizedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
;

