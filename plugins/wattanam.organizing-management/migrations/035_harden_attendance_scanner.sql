-- wattanam-plugin-migration: 035_harden_attendance_scanner
ALTER TABLE plugin_wattanam_organizing_management_scan_attempt
  ADD COLUMN "codeHash" TEXT,
  ADD COLUMN "principalId" TEXT,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;
