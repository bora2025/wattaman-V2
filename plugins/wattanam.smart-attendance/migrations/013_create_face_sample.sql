-- wattanam-plugin-migration: 013_create_face_sample
CREATE TABLE IF NOT EXISTS plugin_wattanam_smart_attendance_face_sample (
  "id" TEXT PRIMARY KEY,
  "personType" TEXT NOT NULL DEFAULT 'STUDENT' CHECK ("personType" IN ('STUDENT', 'STAFF')),
  "personId" TEXT NOT NULL,
  "consentId" TEXT NOT NULL REFERENCES plugin_wattanam_smart_attendance_face_consent("id") ON DELETE CASCADE,
  "modelVersion" TEXT NOT NULL,
  "vector" REAL[] NOT NULL,
  "quality" REAL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL
);
