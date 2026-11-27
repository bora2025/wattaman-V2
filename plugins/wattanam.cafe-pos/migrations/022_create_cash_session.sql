-- wattanam-plugin-migration: 022_create_cash_session
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_cash_session (
  "id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'CLOSED')),
  "openedBy" TEXT,
  "openedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "floatUsd" BIGINT NOT NULL DEFAULT 0,
  "floatKhr" BIGINT NOT NULL DEFAULT 0,
  "closedBy" TEXT,
  "closedAt" TIMESTAMPTZ,
  "countedUsd" BIGINT,
  "countedKhr" BIGINT,
  "expectedUsd" BIGINT,
  "expectedKhr" BIGINT,
  "note" TEXT
);
