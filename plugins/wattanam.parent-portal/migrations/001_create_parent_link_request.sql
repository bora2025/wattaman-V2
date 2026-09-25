-- wattanam-plugin-migration: 001_create_parent_link_request
CREATE TABLE plugin_wattanam_parent_portal_link_request (
  "id" TEXT PRIMARY KEY,
  "studentDirectoryUserId" TEXT NOT NULL,
  "parentEmail" TEXT NOT NULL,
  "parentName" TEXT,
  "parentPhone" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  "rejectReason" TEXT,
  "resolvedByDirectoryUserId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ,
  CHECK (("status"='PENDING' AND "resolvedAt" IS NULL AND "resolvedByDirectoryUserId" IS NULL) OR ("status"<>'PENDING' AND "resolvedAt" IS NOT NULL AND "resolvedByDirectoryUserId" IS NOT NULL))
);
CREATE UNIQUE INDEX plugin_wattanam_parent_portal_one_pending_per_student
  ON plugin_wattanam_parent_portal_link_request ("studentDirectoryUserId") WHERE "status"='PENDING';
CREATE INDEX plugin_wattanam_parent_portal_link_request_status_created
  ON plugin_wattanam_parent_portal_link_request ("status", "createdAt" DESC);

