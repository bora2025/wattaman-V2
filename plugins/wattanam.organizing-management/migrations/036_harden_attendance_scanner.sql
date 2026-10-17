-- wattanam-plugin-migration: 036_harden_attendance_scanner
UPDATE plugin_wattanam_organizing_management_scan_attempt
SET "qrIdentifier" = '[REDACTED]'
WHERE "qrIdentifier" <> '[REDACTED]';
