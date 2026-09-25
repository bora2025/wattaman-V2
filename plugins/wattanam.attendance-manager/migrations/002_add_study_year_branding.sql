-- wattanam-plugin-migration: 002_add_study_year_branding
ALTER TABLE "plugin_wattanam_attendance_manager_study_year" ADD COLUMN IF NOT EXISTS "schoolName" TEXT, ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
