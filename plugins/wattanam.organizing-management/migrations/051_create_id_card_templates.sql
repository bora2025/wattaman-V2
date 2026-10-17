-- wattanam-plugin-migration: 051_create_id_card_templates
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "qrRotatedAt" TIMESTAMPTZ,
  ADD COLUMN "qrRotatedById" TEXT;
