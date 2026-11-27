-- wattanam-plugin-migration: 016_create_media_part
CREATE TABLE plugin_wattanam_examination_media_part (
  "mediaId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_media("id") ON DELETE CASCADE,
  "index" INTEGER NOT NULL CHECK ("index" >= 0),
  "data" TEXT NOT NULL,
  PRIMARY KEY ("mediaId", "index")
);
