-- wattanam-plugin-migration: 007_harden_attendance_scanner
ALTER TABLE plugin_wattanam_organizing_management_scan_attempt
  ADD COLUMN "codeHash" TEXT,
  ADD COLUMN "principalId" TEXT,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE plugin_wattanam_organizing_management_scan_attempt
SET "qrIdentifier" = '[REDACTED]'
WHERE "qrIdentifier" <> '[REDACTED]';

CREATE INDEX plugin_wattanam_organizing_management_scan_principal_idx
  ON plugin_wattanam_organizing_management_scan_attempt("principalId", "receivedAt");
