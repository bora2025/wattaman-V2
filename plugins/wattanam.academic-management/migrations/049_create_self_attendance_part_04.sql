-- wattanam-plugin-migration: 049_create_self_attendance_part_04
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_window (
  "id" TEXT PRIMARY KEY,
  "classId" TEXT NOT NULL,
  "session" INTEGER NOT NULL CHECK ("session" BETWEEN 1 AND 4),
  "sessionType" TEXT NOT NULL CHECK ("sessionType" IN ('CHECK_IN', 'CHECK_OUT')),
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'CLOSED')),
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "qrValiditySeconds" INTEGER NOT NULL DEFAULT 45 CHECK ("qrValiditySeconds" BETWEEN 15 AND 300),
  "locationRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radiusMeters" INTEGER CHECK ("radiusMeters" IS NULL OR "radiusMeters" BETWEEN 10 AND 10000),
  "maxAccuracyMeters" INTEGER NOT NULL DEFAULT 100 CHECK ("maxAccuracyMeters" BETWEEN 5 AND 5000),
  "registeredDeviceRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "maxOfflineMinutes" INTEGER NOT NULL DEFAULT 1440 CHECK ("maxOfflineMinutes" BETWEEN 0 AND 10080),
  "createdById" TEXT NOT NULL,
  "closedById" TEXT,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" > "startsAt"),
  CHECK (
    NOT "locationRequired"
    OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "radiusMeters" IS NOT NULL)
  )
)
;

