# Smart Attendance

Official Wattanam plugin and **the one place to take attendance** (since 0.3.0): by hand, by QR code,
NFC card or face, at stations, terminals and phones. Architecture and phases:
`architecture/smart-attendance-plugin-plan.md` (§17 for the move).

- **Take Attendance** (teachers), **Attendance Settings**, the students' **Scan Attendance** with
  **Self-Attendance Windows** and **Review**, **Staff Attendance** and its reports: the screens moved here from
  Academic Management 0.35.0. **Workforce Scan Attendance** and **Workforce Attendance Settings**: from
  Organizing Management 0.28.0.
- These screens are **partner screens**: the records, rules, corrections and reports stay with Academic
  Management (schools) or Organizing Management (organizations), and the screens call their routes, which
  those plugins open to Smart Attendance. Each call needs the user's permission in that plugin as before.
- A school installs it with Academic Management, an organization with Organizing Management (both are
  optional dependencies); the sidebar shows the screens of the installed ones.

- **Stations.** A device opens *Attendance Station* and asks for approval; an administrator approves it
  on *Attendance Stations* and chooses what it accepts (QR, NFC), check-in / check-out, and its classes.
- **QR codes.** The school page's camera (the host scanner) or a USB 2D scanner. Codes are matched against
  hashed ID-card codes published by Academic Management.
- **NFC cards.** USB card readers in keyboard mode (they type the card number and Enter). Cards are given
  out on *NFC Cards*; card numbers are stored only as an HMAC under a per-school key, plus the last four.
- **Records stay in Academic Management.** Each recognised capture is sent as the durable event
  `wattanam.smart-attendance.presence.captured` v1; Academic Management applies the school's rules (class,
  study day, holidays, sessions, late) and answers with `attendance.station-result` v1. The station shows
  the person at once and the result about a second later.
- **Capture log.** Every scan or tap is kept (recognised or not) and shown on *Station Monitor*. A second
  scan of the same student within the cool-down (default 60 s) records nothing new.

Needs Academic Management 0.34.0 or newer for the student list and the station intake; with an older one the stations say so and record nothing.
- **Faces.** The school page runs the camera and the face model (its face station) and sends only a face
  vector. A face is enrolled on *Face Enrolment* only after the consent is recorded; withdrawing it deletes
  the face. Matches that are close but not certain wait for the teacher at the station.
- **Phone NFC** (Chrome on Android) and **offline stations** (captures kept on the device, sent later).
- **Terminals.** Face or card terminals post events with a device key issued on *Attendance Stations*
  (`POST /api/plugin-device/wattanam.smart-attendance/terminal/events`, header `Authorization: Bearer <key>`).

Version 0.3 needs school core 0.1.36 or newer: the face, nfc and storage devices, device credentials and partner screens.
