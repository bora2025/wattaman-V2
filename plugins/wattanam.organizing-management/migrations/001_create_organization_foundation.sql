-- wattanam-plugin-migration: 001_create_organization_foundation
CREATE TABLE plugin_wattanam_organizing_management_organization_profile (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "organizationType" TEXT NOT NULL DEFAULT 'COMPANY' CHECK ("organizationType" IN ('COMPANY','SHOP','STORE','NONPROFIT','OTHER')),
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
