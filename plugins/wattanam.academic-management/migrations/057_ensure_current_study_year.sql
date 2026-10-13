-- wattanam-plugin-migration: 057_ensure_current_study_year
UPDATE plugin_wattanam_academic_management_study_year
SET "isCurrent" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = (
  SELECT "id"
  FROM plugin_wattanam_academic_management_study_year
  ORDER BY "year" DESC, "createdAt" DESC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM plugin_wattanam_academic_management_study_year
  WHERE "isCurrent" = TRUE
)
;
