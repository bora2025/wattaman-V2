# Student Portal QR Self-Attendance Plan

## Status

- Planning only
- Implementation has not started
- Proposed route: `/student/attendance-scan`
- Proposed API: `POST /api/attendance/student/self-scan`

## Objective

Allow an authenticated student to record their own attendance from the student portal by scanning a school-controlled QR code. The workflow should be as easy as staff self-attendance while remaining secure, duplicate-safe, fast, and reliable on slow or unavailable internet connections.

## Existing Architecture Findings

- Student attendance is stored in the existing `Attendance` model.
- The database already enforces one record per student, class, date, and session with the unique key `studentId_classId_date_session`.
- Wattaman scanning already provides class lookup, session detection, scheduled-day-off handling, late detection, duplicate protection, GPS fields, and real-time updates.
- The employee portal already has a self-scan interface and endpoint.
- The current employee self-scan endpoint does not validate the scanned QR value, and the interface provides a Quick Scan action. This behavior must not be copied into student self-attendance.
- The existing offline attendance queue and network-quality indicator can be adapted for the student workflow.

## Recommended User Flow

1. A teacher, Wattaman operator, or authorized administrator opens an attendance window for a class and session.
2. The system displays a short-lived, automatically rotating QR code.
3. A student signs in to the student portal and opens **Scan Attendance**.
4. The student scans the displayed QR code.
5. The client safely stores the scan locally before attempting synchronization.
6. The server verifies the student account, QR signature, class, session, time window, duplicate state, and configured location rules.
7. The student receives a clear result: recorded, late, already recorded, saved offline, expired QR, wrong class, or rejected.
8. Teachers see successful attendance updates in real time.

## Signed Attendance QR

The QR must be created by the school system and digitally signed. It should not contain the student ID because the authenticated portal account identifies the student.

Recommended token claims:

| Claim | Purpose |
| --- | --- |
| `version` | Supports future token-format changes |
| `organizationId` | Prevents use by another organization |
| `classId` | Restricts attendance to the intended class |
| `session` | Identifies the attendance session |
| `sessionType` | Identifies check-in or check-out |
| `attendanceWindowId` | Connects the scan to an active attendance window |
| `nonce` | Detects replay and duplicate submission |
| `issuedAt` | Records when the QR was created |
| `expiresAt` | Limits QR validity |
| `locationId` | Optionally restricts the QR to a classroom or campus |

Recommended online QR validity is 30–60 seconds, with automatic rotation. Tokens should use asymmetric signing so the public verification key can be used safely where offline verification is needed without exposing the signing key.

## Student Scanner Interface

Create `/student/attendance-scan` and add **Scan Attendance** to the student sidebar and dashboard quick actions.

The scanner should provide:

- Fullscreen mobile-first QR camera
- Fast QR detection, continuous autofocus, rear-camera preference, camera switching, and flashlight where supported
- Student name, photo, class, and detected/current session
- Live network-quality indicator
- GPS status when location validation is enabled
- Pending synchronization count
- Success and error feedback with sound and vibration where supported
- Recent results for the current device session
- Clear offline state: `Saved on this device — waiting to sync`
- No Quick Scan or attendance action that bypasses QR verification

Result states should include:

- `RECORDED`
- `LATE`
- `ALREADY_RECORDED`
- `SAVED_OFFLINE`
- `EXPIRED_QR`
- `INVALID_QR`
- `WRONG_CLASS`
- `NO_ACTIVE_SESSION`
- `DAY_OFF`
- `LOCATION_REJECTED`
- `REQUIRES_REVIEW`

## Backend Design

### Student endpoint

```http
POST /api/attendance/student/self-scan
```

Example request:

```json
{
  "attendanceToken": "signed-attendance-token",
  "scannedAt": "2026-08-23T01:00:00.000Z",
  "latitude": 11.5564,
  "longitude": 104.9282,
  "deviceId": "persistent-registered-device-id",
  "clientRequestId": "unique-idempotency-key"
}
```

The endpoint must:

1. Require authentication and the `STUDENT` role.
2. Resolve the student only from the authenticated user ID.
3. Never accept a student ID supplied by the client.
4. Verify the attendance-token signature and supported version.
5. Verify issue time, expiration, organization, active window, class, and session.
6. Confirm the student currently belongs to the token's class.
7. Apply scheduled-day-off and late rules.
8. Apply configured GPS/geofence and device rules.
9. Validate the supplied scan time against the signed token and server receipt time.
10. Create the attendance record atomically.
11. Treat both `clientRequestId` and the existing attendance unique key as idempotency safeguards.
12. Return `ALREADY_RECORDED` instead of failing for rapid or repeated scans.
13. Create an audit event for accepted and rejected attempts.
14. Publish successful records through the existing attendance real-time gateway.

### Attendance-window endpoints

Protected endpoints will be required for authorized staff:

- Start an attendance window for a class/session
- Obtain or rotate the current signed QR token
- Read live counts and recent attempts
- Close an attendance window
- Review exceptional offline submissions

The exact route names should follow existing controller conventions during implementation.

## Data Model Changes

Continue writing successful attendance to the existing `Attendance` table so all current reports remain compatible.

Add an attendance window entity containing:

- Organization, class, and session
- Start and end times
- Status: open or closed
- QR rotation configuration
- Optional location/geofence configuration
- Creator and close-author identifiers
- Created, updated, and closed timestamps

Add a self-scan audit entity containing:

- Authenticated student and attendance-window identifiers
- `clientRequestId`, QR nonce, and token version
- Original scan time and server receipt time
- Online/offline submission state
- Device identifier and network-quality snapshot
- Latitude, longitude, accuracy, and location decision
- Result and rejection reason
- Linked attendance record when successful

Add a source field or equivalent audit relationship so reports can distinguish:

- `WATTAMAN_SCAN`
- `TEACHER_MANUAL`
- `STUDENT_SELF_SCAN`
- `STUDENT_OFFLINE_SYNC`

Schema changes require a reviewed Prisma migration and rollback plan.

## Offline and Slow-Network Strategy

The scanner must store the scan locally before making a network request.

1. Generate a stable `clientRequestId`.
2. Save the signed QR token, original scan time, coordinates, accuracy, and device ID in IndexedDB.
3. Attempt immediate submission when the connection is healthy.
4. Queue immediately when offline or when the connection is classified as poor.
5. Retry automatically with exponential backoff and jitter.
6. Retain the record after browser/PWA restart.
7. Remove it only after a definitive server acknowledgement.
8. Avoid duplicate local queue entries using `clientRequestId`.
9. Preserve rejected records long enough to show a useful result to the student.

Recommended policies:

- Maximum offline submission age: configurable, initially 24 hours
- Expired-at-sync tokens: validated against original trusted scan time and signed validity window
- Large device-clock differences: reject or send for staff review
- Location unavailable while required: save as `REQUIRES_REVIEW` rather than silently accepting

Offline acceptance has unavoidable fraud tradeoffs. The server should retain enough evidence for review and should never trust an arbitrary client timestamp without comparing it to the signed QR window and reasonable clock limits.

## Security and Abuse Controls

- Short-lived rotating signed QR tokens
- Strict student-role authorization
- Student identity derived from the JWT only
- Class and session membership validation
- Atomic duplicate protection
- Replay detection using window, nonce, and client request ID
- Rate limiting by student, device, and IP address
- Configurable GPS/geofence with accuracy limits
- Optional registered-device policy
- Maximum accepted offline age
- Server-side audit logging for accepted and rejected attempts
- Sanitized logs that do not expose full signed tokens
- Configurable teacher review for suspicious/offline submissions

A live QR can still be shared through a photograph or video call during its validity window. Short rotation, GPS validation, registered devices, and exception review reduce this risk but cannot eliminate it entirely.

## Teacher/Admin Attendance Display

Provide an authorized screen that can:

- Select class and session
- Start and stop an attendance window
- Display a rotating high-contrast QR code
- Show the remaining token lifetime
- Display live present, late, duplicate, rejected, and pending-review counts
- Show recent student confirmations
- Close the window manually
- Provide an emergency offline-display mode with stricter expiration and review rules

## Reporting

Existing student attendance reports should continue reading the `Attendance` table.

Extend administrative reports with:

- Attendance source
- Original scan time
- Server synchronization time
- Online/offline state
- Attendance-window identifier
- Location validation result
- Device identifier where policy permits display
- Review status and reviewer
- Rejection reason for audit reports

Students should see their own result and attendance history but must not see other students' attempts or device/location details.

## Delivery Phases

### Phase 1: Policy and technical design

- Confirm QR owner roles, token lifetime, offline maximum age, GPS radius, and device policy.
- Finalize threat model, token claims, API contracts, and audit retention.
- Prepare database migration and rollback design.

### Phase 2: Secure backend foundation

- Implement attendance windows and signed-token generation.
- Implement student self-scan validation and atomic attendance creation.
- Add idempotency, audit events, rate limits, and real-time notifications.
- Add backend unit and integration tests.

### Phase 3: Teacher/admin QR display

- Implement attendance-window controls.
- Implement automatic QR rotation and live counts.
- Add authorization and operational error handling.

### Phase 4: Student portal scanner

- Implement the navigation entry and mobile scanner.
- Add fast detection, camera controls, accessible feedback, and network quality.
- Add clear result states and recent scan history.

### Phase 5: Offline resilience

- Adapt the IndexedDB queue for student scans.
- Add retry/backoff, restart recovery, pending indicators, and reconciliation.
- Test offline, slow, interrupted, and duplicated submissions.

### Phase 6: Reports and review workflow

- Add attendance source and audit reporting.
- Add review actions for suspicious or exceptional offline scans.
- Verify existing attendance reports remain correct.

### Phase 7: Verification and rollout

- Run lint, type checks, backend tests, production builds, security checks, and Docker builds.
- Test on real Android and iOS devices under good, slow, intermittent, and offline networks.
- Pilot with one class behind a feature flag.
- Monitor duplicate, rejection, queue, and synchronization metrics.
- Expand only after pilot acceptance.

## Required Test Cases

### Functional

- Valid student scans a valid QR for their assigned class.
- Present/late status follows session configuration.
- Check-in and check-out behavior follows the agreed attendance model.
- Day-off and no-active-session states are handled correctly.
- Teacher live count updates after a successful scan.

### Authorization and security

- Non-student roles cannot use the endpoint unless explicitly authorized.
- A student cannot submit another student's identifier.
- Modified, unsigned, expired, wrong-class, and closed-window tokens are rejected.
- Rapid parallel submissions create exactly one attendance record.
- Replayed `clientRequestId` and nonce are idempotent or rejected appropriately.
- Rate limits operate without blocking normal classroom usage.

### Offline and slow internet

- A scan is stored before the request starts.
- A queued scan survives reload, PWA closure, and device reconnection.
- Slow requests do not freeze QR detection or generate repeated scans.
- Synchronization creates exactly one server record.
- An expired token is evaluated using the original scan evidence and configured policy.
- Queue records remain when the server is temporarily unavailable.
- Permanent rejection is shown clearly and is not retried forever.

### Compatibility

- Existing Wattaman, teacher, employee, and manual attendance flows remain operational.
- Existing attendance reports continue producing correct totals.
- The network-quality indicator remains visible inside the fullscreen scanner.
- Service worker upgrades deliver the new scanner reliably.

## Acceptance Criteria

- A student can record only their own attendance.
- Valid attendance is recorded once even after rapid or repeated scans.
- Invalid, expired, modified, and wrong-class QR codes cannot record attendance.
- A legitimate offline scan is stored durably and synchronizes exactly once.
- Slow internet does not freeze the scanner or lose a scan.
- Network quality and pending synchronization are always visible and understandable.
- Teachers receive live attendance updates.
- Every accepted or rejected self-scan is auditable.
- Existing attendance workflows and reports continue working.

## Decisions Required Before Implementation

1. Which roles may open and close student attendance windows?
2. Should students scan for check-in only, or both check-in and check-out?
3. What should the default QR rotation and validity duration be?
4. Is GPS required, optional, or disabled, and what campus radius is acceptable?
5. Is one registered device per student required?
6. What is the maximum offline submission age?
7. Should questionable offline/location scans be rejected or sent for staff review?
8. How long should detailed scan audit records be retained?
9. Which class will be used for the initial pilot?

