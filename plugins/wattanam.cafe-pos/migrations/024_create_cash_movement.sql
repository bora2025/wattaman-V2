-- wattanam-plugin-migration: 024_create_cash_movement
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_cash_movement (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('IN', 'OUT')),
  "currency" TEXT NOT NULL DEFAULT 'USD' CHECK ("currency" IN ('USD', 'KHR')),
  "amount" BIGINT NOT NULL CHECK ("amount" > 0),
  "reason" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
