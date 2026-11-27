-- wattanam-plugin-migration: 019_create_order_item
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_order_item (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "variantId" TEXT,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "variantName" TEXT,
  "addons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "unitPrice" BIGINT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "lineTotal" BIGINT NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT TRUE,
  "note" TEXT,
  "stationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW' CHECK ("status" IN ('NEW', 'PREPARING', 'READY', 'SERVED', 'VOID')),
  "voidReason" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMPTZ
);
