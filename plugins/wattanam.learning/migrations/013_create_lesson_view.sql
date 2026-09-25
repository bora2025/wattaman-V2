-- wattanam-plugin-migration: 013_create_lesson_view
CREATE TABLE plugin_wattanam_learning_lesson_view (
  "id" TEXT PRIMARY KEY, "lessonId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_lesson("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "directoryUserId" TEXT, "firstOpenedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOpenedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "openCount" INTEGER NOT NULL DEFAULT 1 CHECK ("openCount" > 0),
  "watchedSeconds" INTEGER NOT NULL DEFAULT 0 CHECK ("watchedSeconds" >= 0), "videoDurationSec" INTEGER CHECK ("videoDurationSec" IS NULL OR "videoDurationSec" >= 0),
  "videoCompleted" BOOLEAN NOT NULL DEFAULT FALSE, "completedAt" TIMESTAMPTZ, UNIQUE ("lessonId","academicStudentId")
);
