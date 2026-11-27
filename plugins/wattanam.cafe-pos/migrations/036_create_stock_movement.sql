-- wattanam-plugin-migration: 036_create_stock_movement
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_stock_movement (
  "id" TEXT PRIMARY KEY,
  "supplyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('RECEIVE', 'USE', 'WASTE', 'ADJUST', 'RETURN')),
  "quantity" NUMERIC(14, 3) NOT NULL,
  "orderId" TEXT,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
