-- wattanam-plugin-migration: 081_add_transcript_subject_coefficient
ALTER TABLE "plugin_wattanam_academic_management_transcript_subject" ADD COLUMN IF NOT EXISTS "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK ("coefficient" >= 0 AND "coefficient" <= 10);
