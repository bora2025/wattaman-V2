-- wattanam-plugin-migration: 011_create_face_consent
CREATE TABLE IF NOT EXISTS plugin_wattanam_smart_attendance_face_consent (
  "id" TEXT PRIMARY KEY,
  "personType" TEXT NOT NULL DEFAULT 'STUDENT' CHECK ("personType" IN ('STUDENT', 'STAFF')),
  "personId" TEXT NOT NULL,
  "givenBy" TEXT NOT NULL,
  "relation" TEXT NOT NULL,
  "method" TEXT NOT NULL CHECK ("method" IN ('PAPER', 'DIGITAL')),
  "documentRef" TEXT,
  "note" TEXT,
  "givenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedBy" TEXT NOT NULL,
  "withdrawnAt" TIMESTAMPTZ,
  "withdrawnBy" TEXT
);
