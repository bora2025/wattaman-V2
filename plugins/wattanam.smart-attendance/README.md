# Smart Attendance

Official Wattanam plugin for **attendance stations**: a tablet or PC at a gate or in a classroom where
students scan the QR code on their ID card or tap their NFC card. Architecture and phases:
`architecture/smart-attendance-plugin-plan.md`.

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

Version 0.2 needs a school core with the face, nfc and storage devices and device credentials.
