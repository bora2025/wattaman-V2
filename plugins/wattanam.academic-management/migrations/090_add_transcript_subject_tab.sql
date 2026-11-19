-- wattanam-plugin-migration: 090_add_transcript_subject_tab
ALTER TABLE plugin_wattanam_academic_management_transcript_subject ADD COLUMN IF NOT EXISTS "tabId" TEXT REFERENCES plugin_wattanam_academic_management_transcript_tab("id") ON DELETE CASCADE;
