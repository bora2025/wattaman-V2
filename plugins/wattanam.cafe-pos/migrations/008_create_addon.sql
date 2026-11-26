-- wattanam-plugin-migration: 008_create_addon
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_addon (
  "id" TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "price" BIGINT NOT NULL DEFAULT 0 CHECK ("price" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'USD' CHECK ("currency" IN ('USD', 'KHR')),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
