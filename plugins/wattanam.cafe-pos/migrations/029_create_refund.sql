-- wattanam-plugin-migration: 029_create_refund
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_refund (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL CHECK ("amount" > 0),
  "method" TEXT NOT NULL CHECK ("method" IN ('CASH', 'CARD', 'TRANSFER', 'KHQR', 'LOYALTY')),
  "cashUsd" BIGINT NOT NULL DEFAULT 0,
  "cashKhr" BIGINT NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "sessionId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
