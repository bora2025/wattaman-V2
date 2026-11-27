-- wattanam-plugin-migration: 025_create_payment
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_payment (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "method" TEXT NOT NULL CHECK ("method" IN ('CASH', 'CARD', 'TRANSFER', 'KHQR', 'LOYALTY')),
  "amount" BIGINT NOT NULL CHECK ("amount" > 0),
  "cashUsd" BIGINT NOT NULL DEFAULT 0,
  "cashKhr" BIGINT NOT NULL DEFAULT 0,
  "changeUsd" BIGINT NOT NULL DEFAULT 0,
  "changeKhr" BIGINT NOT NULL DEFAULT 0,
  "reference" TEXT,
  "sessionId" TEXT,
  "clientKey" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
