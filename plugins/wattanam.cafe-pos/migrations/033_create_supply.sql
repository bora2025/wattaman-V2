-- wattanam-plugin-migration: 033_create_supply
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_supply (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'pcs',
  "quantity" NUMERIC(14, 3) NOT NULL DEFAULT 0,
  "lowAt" NUMERIC(14, 3) NOT NULL DEFAULT 0,
  "cost" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'USD' CHECK ("currency" IN ('USD', 'KHR')),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
