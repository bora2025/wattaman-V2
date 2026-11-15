-- wattanam-plugin-migration: 082_add_transcript_subject_parent
ALTER TABLE "plugin_wattanam_academic_management_transcript_subject" ADD COLUMN IF NOT EXISTS "parentId" TEXT REFERENCES "plugin_wattanam_academic_management_transcript_subject"("id") ON DELETE SET NULL;
