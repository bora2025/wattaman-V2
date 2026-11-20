# Changelog

## 0.2.1
- Faces are compared only with enrolments of the same face model; Face Enrolment marks who must enrol again after a model change ("🔄 Enrol again").
- With the school core's MediaPipe face station: liveness is a head turn and a blink, in a random order.

## 0.2.0
Needs a school core with the face / nfc / storage devices and device credentials (Customer-School feat/station-bridges).
- Face attendance: the school page's face station (camera, face model, head-turn liveness) sends a face vector; matching with accept / review / margin thresholds; uncertain matches wait for the teacher at the station.
- Face Enrolment: consent first (who gave it, relation, paper or digital); three samples; re-enrol; delete; withdrawing consent deletes the face at once; class coverage.
- Phone NFC (Web NFC, Chrome on Android) at stations.
- Offline stations: captures are kept on the device and sent later with their own time (24 hours by default).
- Terminals: face / card terminals send events with a device key (POST /api/plugin-device/wattanam.smart-attendance/terminal/events); new key; turning a terminal off stops its key.
- Settings: face thresholds, liveness, offline hours. Monitor: face distance and the source.
- Migration 009 is declared destructive: it widens three CHECK constraints (no data changes).

## 0.1.2
- The sidebar shows Attendance Station, Station Monitor, Attendance Stations and NFC Cards (the entries were declared but not registered).

## 0.1.1
- NFC Cards: the success message stays after a card is given (the list refresh cleared it).

## 0.1.0
- Attendance stations: device registration and approval, methods (QR, NFC), check-in / check-out mode, classes.
- Station screen: host camera QR scanning, USB QR scanners and USB NFC card readers, instant identification,
  attendance result from Academic Management, recent list, sounds.
- NFC card registry: issue by tapping, one card in use per student, lost / returned / replaced.
- Station Monitor: every capture of a day with its result; cool-down setting.
