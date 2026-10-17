-- wattanam-plugin-migration: 002_create_organization_foundation
CREATE TABLE plugin_wattanam_organizing_management_employee (
  "id" TEXT PRIMARY KEY, "directoryUserId" TEXT UNIQUE, "employeeNumber" TEXT NOT NULL UNIQUE,
  "fullName" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "position" TEXT, "department" TEXT,
  "employmentType" TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK ("employmentType" IN ('EMPLOYER','EMPLOYEE','CONTRACTOR','INTERN')),
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("employmentStatus" IN ('ACTIVE','ON_LEAVE','INACTIVE','TERMINATED')),
  "photoUrl" TEXT, "qrIdentifier" TEXT NOT NULL UNIQUE, "startDate" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
