-- wattanam-plugin-migration: 002_create_card
CREATE TABLE IF NOT EXISTS plugin_wattanam_smart_attendance_card (
  "id" TEXT PRIMARY KEY,
  "personType" TEXT NOT NULL DEFAULT 'STUDENT' CHECK ("personType" IN ('STUDENT', 'STAFF')),
  "personId" TEXT NOT NULL,
  "uidHmac" TEXT NOT NULL,
  "uidLast4" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'LOST', 'REPLACED', 'RETURNED')),
  "issuedBy" TEXT,
  "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ,
  "endedBy" TEXT
);
