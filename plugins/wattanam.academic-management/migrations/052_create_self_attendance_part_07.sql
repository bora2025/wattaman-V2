-- wattanam-plugin-migration: 052_create_self_attendance_part_07
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
)
;

