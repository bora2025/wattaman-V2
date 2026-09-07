CREATE TABLE "CustomerSchoolDomain" (
    "id" TEXT NOT NULL,
    "customerSchoolId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerSchoolDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerSchoolDomain_hostname_key" ON "CustomerSchoolDomain"("hostname");
CREATE INDEX "CustomerSchoolDomain_customerSchoolId_isPrimary_idx" ON "CustomerSchoolDomain"("customerSchoolId", "isPrimary");
CREATE UNIQUE INDEX "CustomerSchoolDomain_one_primary_per_school" ON "CustomerSchoolDomain"("customerSchoolId") WHERE "isPrimary" = true;

ALTER TABLE "CustomerSchoolDomain"
ADD CONSTRAINT "CustomerSchoolDomain_customerSchoolId_fkey"
FOREIGN KEY ("customerSchoolId") REFERENCES "CustomerSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
