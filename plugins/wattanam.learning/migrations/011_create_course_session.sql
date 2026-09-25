-- wattanam-plugin-migration: 011_create_course_session
CREATE TABLE plugin_wattanam_learning_course_session (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_course("id") ON DELETE CASCADE,
  "lessonId" TEXT REFERENCES plugin_wattanam_learning_lesson("id") ON DELETE SET NULL, "title" TEXT NOT NULL, "scheduledAt" TIMESTAMPTZ NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60 CHECK ("durationMinutes" > 0), "location" TEXT, "checkInCodeHash" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
