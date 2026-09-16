-- wattanam-plugin-migration: 002_create_user_department
CREATE TABLE "plugin_wattanam_academic_management_user_department" (
  "userId" TEXT PRIMARY KEY,
  "departmentId" TEXT NOT NULL REFERENCES "plugin_wattanam_academic_management_department"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
