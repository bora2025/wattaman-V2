-- wattanam-plugin-migration: 009_widen_capture_checks
ALTER TABLE plugin_wattanam_smart_attendance_capture
  DROP CONSTRAINT IF EXISTS plugin_wattanam_smart_attendance_capture_method_check,
  DROP CONSTRAINT IF EXISTS plugin_wattanam_smart_attendance_capture_source_check,
  DROP CONSTRAINT IF EXISTS plugin_wattanam_smart_attendance_capture_result_check,
  ADD CONSTRAINT plugin_wattanam_smart_attendance_capture_method_check CHECK ("method" IN ('QR', 'NFC', 'FACE')),
  ADD CONSTRAINT plugin_wattanam_smart_attendance_capture_source_check CHECK ("source" IN ('CAMERA', 'USB', 'PHONE', 'TERMINAL')),
  ADD CONSTRAINT plugin_wattanam_smart_attendance_capture_result_check CHECK ("result" IN ('MATCHED', 'UNKNOWN', 'DUPLICATE', 'OUT_OF_SCOPE', 'METHOD_NOT_ALLOWED', 'REVIEW', 'LOW_CONFIDENCE', 'SPOOF_SUSPECTED'));
