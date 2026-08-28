DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PaymentWebhookEvent" LIMIT 1) THEN
    RAISE EXCEPTION 'webhook evidence migration requires explicit adoption of existing events';
  END IF;
END $$;

ALTER TABLE "PaymentWebhookEvent"
  ADD COLUMN "rawPayload" TEXT NOT NULL,
  ADD COLUMN "signature" TEXT NOT NULL,
  ADD COLUMN "eventType" TEXT NOT NULL,
  ADD COLUMN "orderId" TEXT NOT NULL;

CREATE INDEX "PaymentWebhookEvent_orderId_receivedAt_idx" ON "PaymentWebhookEvent"("orderId", "receivedAt");
