-- wattanam-plugin-migration: 092_add_class_level
ALTER TABLE plugin_wattanam_academic_management_class ADD COLUMN IF NOT EXISTS "level" TEXT;
