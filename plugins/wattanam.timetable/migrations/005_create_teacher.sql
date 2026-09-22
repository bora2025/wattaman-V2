-- wattanam-plugin-migration: 005_create_teacher
CREATE TABLE plugin_wattanam_timetable_teacher (
  "id" TEXT PRIMARY KEY,
  "timetableId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_document("id") ON DELETE CASCADE,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "khmerName" TEXT,
  "short" TEXT NOT NULL,
  "sex" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "photo" TEXT,
  "color" TEXT,
  "classTeacherId" TEXT REFERENCES plugin_wattanam_timetable_class("id") ON DELETE SET NULL,
  "qrCode" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
