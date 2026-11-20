# Changelog

## 0.4.1
- Face attendance without the head turn and blink: the face is read at once (about a second per student). The setting "Face: ask for a head turn and a blink" on Attendance Stations turns the check back on; it is now off by default. Face enrolment still asks for both steps.

## 0.4.0
Automatic stations: nothing to type, nothing to press. Needs school core 0.1.36 (the automatic face station).
- **One screen for everything:** the station opens straight into automatic attendance. The camera reads faces and ID-card QR codes at the same time, USB readers (QR scanners, NFC card readers) and the phone's NFC listen as well, and whatever the student shows is recorded. Each student's class (and session) comes from their enrolment and timetable, as before.
- **No setup typing:** a new device registers itself with a name like "Wattaman · Chrome on Android · 2026-11-20". Administrators can rename it on Attendance Stations.
- **Wattaman:** can now run a station, and a Wattaman's device is approved at once for QR, NFC and face in every class (setting "Approve Wattaman stations automatically", on by default). Other roles' devices still wait for an administrator.
- Face liveness (head turn + blink) stays on; a Wattaman watches the station.

## 0.3.0
Smart Attendance is now the one place to take attendance. Needs school core 0.1.36 or newer (partner screens).
- **From Academic Management (0.35.0):** Take Attendance (by hand, with the camera or a USB scanner), Attendance Settings (session times, identifiers, holidays, alert rules), the students' Scan Attendance, Self-Attendance Windows, Self-Attendance Review, Staff Attendance and Staff Attendance Reports.
- **From Organizing Management (0.28.0):** Workforce Scan Attendance and Workforce Attendance Settings.
- The records, rules, corrections and reports stay with those plugins: these screens call their routes as **partner screens**, so nothing is copied and progress books, record books and reports keep working.
- Academic Management and Organizing Management are optional dependencies: a school installs it with Academic Management, an organization with Organizing Management. The sidebar shows the screens of the plugins that are installed.
- New permissions with the same default roles as the ones they replace (Take: Wattaman, teachers, class admins; Staff Attendance: Wattaman). Grant **Scan Attendance (students)**, the self-attendance and the workforce permissions to the roles that had the old ones. Every call still needs the Academic or Organizing permission as before.
- Students' ID-card QR codes keep working at stations.

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
