-- wattanam-plugin-migration: 002_create_product
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_product (
  "id" TEXT PRIMARY KEY,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "description" TEXT,
  "price" BIGINT NOT NULL DEFAULT 0 CHECK ("price" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'USD' CHECK ("currency" IN ('USD', 'KHR')),
  "cost" BIGINT,
  "sku" TEXT,
  "barcode" TEXT,
  "photo" TEXT,
  "taxable" BOOLEAN NOT NULL DEFAULT TRUE,
  "trackStock" BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
