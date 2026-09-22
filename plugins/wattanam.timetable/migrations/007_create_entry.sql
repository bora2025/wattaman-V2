-- wattanam-plugin-migration: 007_create_entry
CREATE TABLE plugin_wattanam_timetable_entry (
  "id" TEXT PRIMARY KEY,
  "timetableId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_document("id") ON DELETE CASCADE,
  "lessonId" TEXT REFERENCES plugin_wattanam_timetable_lesson("id") ON DELETE SET NULL,
  "classId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_class("id"),
  "teacherId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_teacher("id"),
  "subjectId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_subject("id"),
  "classroomId" TEXT REFERENCES plugin_wattanam_timetable_classroom("id") ON DELETE SET NULL,
  "day" INTEGER NOT NULL CHECK ("day" BETWEEN 1 AND 7),
  "period" INTEGER NOT NULL CHECK ("period" BETWEEN 1 AND 24),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("timetableId", "classId", "day", "period"),
  UNIQUE ("timetableId", "teacherId", "day", "period"),
  UNIQUE ("timetableId", "classroomId", "day", "period")
);
