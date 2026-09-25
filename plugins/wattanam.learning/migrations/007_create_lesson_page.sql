-- wattanam-plugin-migration: 007_create_lesson_page
CREATE TABLE plugin_wattanam_learning_lesson_page (
  "id" TEXT PRIMARY KEY, "lessonId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_lesson("id") ON DELETE CASCADE, "title" TEXT NOT NULL,
  "pageType" TEXT NOT NULL DEFAULT 'CONTENT' CHECK ("pageType" IN ('CONTENT','QUESTION','BRANCH')), "content" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "order" INTEGER NOT NULL DEFAULT 0 CHECK ("order" >= 0), "nextPageId" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
