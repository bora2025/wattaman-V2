-- wattanam-plugin-migration: 038_create_loyalty_entry
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_loyalty_entry (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('EARN', 'REDEEM', 'ADJUST', 'REVERSE')),
  "points" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
