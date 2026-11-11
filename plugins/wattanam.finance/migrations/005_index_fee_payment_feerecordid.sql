-- wattanam-plugin-migration: 005_index_fee_payment_feerecordid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_finance_fee_payment_feerecordid_idx ON plugin_wattanam_finance_fee_payment ("feeRecordId");
