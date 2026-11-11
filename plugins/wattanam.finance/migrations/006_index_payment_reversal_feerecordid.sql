-- wattanam-plugin-migration: 006_index_payment_reversal_feerecordid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_finance_payment_reversal_feerecordid_idx ON plugin_wattanam_finance_payment_reversal ("feeRecordId");
