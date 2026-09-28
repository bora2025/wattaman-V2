-- wattanam-plugin-migration: 004_create_payment_reversal
CREATE TABLE plugin_wattanam_finance_payment_reversal (
  "id" TEXT PRIMARY KEY,
  "feePaymentId" TEXT NOT NULL UNIQUE REFERENCES plugin_wattanam_finance_fee_payment("id") ON DELETE RESTRICT,
  "feeRecordId" TEXT NOT NULL REFERENCES plugin_wattanam_finance_fee_record("id") ON DELETE RESTRICT,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
  "currency" CHAR(3) NOT NULL,
  "reason" TEXT NOT NULL CHECK (char_length("reason") > 0),
  "createdByDirectoryUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
