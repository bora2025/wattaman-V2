-- wattanam-plugin-migration: 015_create_media
-- Pictures (drag and drop backgrounds) and recordings (dictation) of exam questions. Uploaded in parts
-- (each screen request is at most 256 KiB); a question refers to one as "media:<id>".
CREATE TABLE plugin_wattanam_examination_media (
  "id" TEXT PRIMARY KEY,
  "examId" TEXT REFERENCES plugin_wattanam_examination_exam("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('IMAGE','AUDIO')),
  "mime" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL CHECK ("bytes" > 0),
  "parts" INTEGER NOT NULL CHECK ("parts" BETWEEN 1 AND 64),
  "createdByDirectoryUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
