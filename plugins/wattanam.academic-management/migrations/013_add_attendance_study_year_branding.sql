-- wattanam-plugin-migration: 002_add_study_year_branding
ALTER TABLE "plugin_wattanam_academic_management_study_year" ADD COLUMN IF NOT EXISTS "schoolName" TEXT, ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;


