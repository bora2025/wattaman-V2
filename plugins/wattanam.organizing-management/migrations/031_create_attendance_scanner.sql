-- wattanam-plugin-migration: 031_create_attendance_scanner
ALTER TABLE plugin_wattanam_organizing_management_attendance_setting
  ADD COLUMN "minimumCheckoutMinutes" INTEGER NOT NULL DEFAULT 30 CHECK ("minimumCheckoutMinutes" BETWEEN 1 AND 1440),
  ADD COLUMN "maximumOfflineMinutes" INTEGER NOT NULL DEFAULT 15 CHECK ("maximumOfflineMinutes" BETWEEN 0 AND 1440);
