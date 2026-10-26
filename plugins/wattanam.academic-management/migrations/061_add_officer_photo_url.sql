-- wattanam-plugin-migration: 061_add_officer_photo_url
ALTER TABLE "plugin_wattanam_academic_management_officer_profile"
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT,
  DROP CONSTRAINT IF EXISTS "academic_management_officer_photo_url",
  ADD CONSTRAINT "academic_management_officer_photo_url"
  CHECK (
    "photoUrl" IS NULL
    OR (
      LENGTH("photoUrl") <= 2048
      AND "photoUrl" ~ '^https://'
    )
  );
