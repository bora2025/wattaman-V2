-- wattanam-plugin-migration: 009_add_attempt_directory_user
ALTER TABLE plugin_wattanam_examination_attempt ADD COLUMN "directoryUserId" TEXT;
