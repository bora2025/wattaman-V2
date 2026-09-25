-- wattanam-plugin-migration: 010_add_gradebook_owner
ALTER TABLE plugin_wattanam_examination_score_sheet ADD COLUMN "createdByDirectoryUserId" TEXT;
