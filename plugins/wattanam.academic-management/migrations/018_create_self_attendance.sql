-- plugin: wattanam.academic-management
-- migration: 018_create_self_attendance

ALTER TABLE plugin_wattanam_academic_management_attendance_record
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'TEACHER_MANUAL',
  ADD COLUMN IF NOT EXISTS "attendanceWindowId" TEXT,
  ADD COLUMN IF NOT EXISTS "originalScanAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "synchronizedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';

CREATE UNIQUE INDEX IF NOT EXISTS academic_management_attendance_staff_record_unique
  ON plugin_wattanam_academic_management_attendance_record ("personId", "date", "session")
  WHERE "personType" = 'STAFF';

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_signing_key (
  "id" TEXT PRIMARY KEY,
  "algorithm" TEXT NOT NULL,
  "publicKeyPem" TEXT NOT NULL,
  "privateKeyPem" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMPTZ
);

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
);

CREATE INDEX IF NOT EXISTS academic_management_attendance_window_class_status
  ON plugin_wattanam_academic_management_attendance_window ("classId", "status", "startsAt", "endsAt");

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_device (
  "id" TEXT PRIMARY KEY,
  "studentProfileId" TEXT NOT NULL,
  "directoryUserId" TEXT NOT NULL,
  "deviceIdHash" TEXT NOT NULL,
  "label" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMPTZ,
  UNIQUE ("studentProfileId", "deviceIdHash")
);

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_self_scan (
  "id" TEXT PRIMARY KEY,
  "clientRequestId" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL,
  "tokenVersion" INTEGER,
  "nonce" TEXT,
  "attendanceWindowId" TEXT REFERENCES plugin_wattanam_academic_management_attendance_window("id") ON DELETE SET NULL,
  "studentProfileId" TEXT,
  "directoryUserId" TEXT NOT NULL,
  "classId" TEXT,
  "session" INTEGER,
  "scannedAt" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncState" TEXT NOT NULL CHECK ("syncState" IN ('ONLINE', 'OFFLINE', 'REVIEW')),
  "deviceIdHash" TEXT,
  "networkQuality" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "locationDecision" TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK ("locationDecision" IN ('NOT_REQUIRED', 'ACCEPTED', 'UNAVAILABLE', 'INACCURATE', 'OUTSIDE_GEOFENCE')),
  "result" TEXT NOT NULL CHECK ("result" IN (
    'RECORDED', 'LATE', 'ALREADY_RECORDED', 'EXPIRED_QR', 'INVALID_QR',
    'WRONG_CLASS', 'NO_ACTIVE_SESSION', 'DAY_OFF', 'LOCATION_REJECTED',
    'REQUIRES_REVIEW', 'CLOSED_WINDOW', 'UNAUTHORIZED', 'DEVICE_REJECTED'
  )),
  "rejectionReason" TEXT,
  "recordId" TEXT REFERENCES plugin_wattanam_academic_management_attendance_record("id") ON DELETE SET NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK ("reviewStatus" IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED')),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS academic_management_attendance_self_scan_window_received
  ON plugin_wattanam_academic_management_attendance_self_scan ("attendanceWindowId", "receivedAt");
CREATE INDEX IF NOT EXISTS academic_management_attendance_self_scan_student_received
  ON plugin_wattanam_academic_management_attendance_self_scan ("studentProfileId", "receivedAt");
CREATE INDEX IF NOT EXISTS academic_management_attendance_self_scan_review
  ON plugin_wattanam_academic_management_attendance_self_scan ("reviewStatus", "receivedAt");

