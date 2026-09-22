-- wattanam-plugin-migration: 006_create_lesson
CREATE TABLE plugin_wattanam_timetable_lesson (
  "id" TEXT PRIMARY KEY,
  "timetableId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_document("id") ON DELETE CASCADE,
  "teacherId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_teacher("id"),
  "subjectId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_subject("id"),
  "classId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_class("id"),
  "perWeek" INTEGER NOT NULL DEFAULT 1 CHECK ("perWeek" BETWEEN 1 AND 168),
  "lessonType" TEXT NOT NULL DEFAULT 'SINGLE' CHECK ("lessonType" IN ('SINGLE','DOUBLE','TRIPLE')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
