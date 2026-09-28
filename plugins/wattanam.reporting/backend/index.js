"use strict";
const ADAPTERS = [
  ["wattanam.attendance-manager", "student-attendance-summary"],
  ["wattanam.finance", "student-fee-balance"],
  ["wattanam.examination", "student-grade-summary"],
  ["wattanam.transportation", "student-transport-summary"],
  ["wattanam.communication", "student-communication-summary"],
];
function id(value, label) {
  const result = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(result))
    throw new Error(`${label} is invalid`);
  return result;
}
function isoDate(value) {
  const result = String(value || new Date().toISOString().slice(0, 10));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(new Date(`${result}T00:00:00.000Z`).getTime())
  )
    throw new Error("asOfIsoDate is invalid");
  return result;
}
function requireAdministrator(request) {
  const role = String(request?.principal?.role || "").toUpperCase();
  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "ADMIN"].includes(role))
    throw new Error("Reporting requires a school administrator");
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function summarize(student, models) {
  const attendance = models["student-attendance-summary"] || {},
    fees = models["student-fee-balance"] || {},
    grades = models["student-grade-summary"] || {},
    transport = models["student-transport-summary"] || {},
    communication = models["student-communication-summary"] || {};
  const balances = Array.isArray(fees.currencies) ? fees.currencies : [];
  return {
    studentId: student.studentId,
    studentNumber: student.studentNumber || "",
    studentName: student.name || "",
    attendancePresent: Number(attendance.counts?.PRESENT || 0),
    attendanceLate: Number(attendance.counts?.LATE || 0),
    attendanceAbsent: Number(attendance.counts?.ABSENT || 0),
    feeBalance: balances
      .map((item) => `${item.currency} ${item.balanceMinor}`)
      .join("; "),
    gradeEntries:
      (Array.isArray(grades.gradebooks) ? grades.gradebooks.length : 0) +
      (Array.isArray(grades.attempts) ? grades.attempts.length : 0),
    transportVehicle: transport.assignments?.[0]?.vehicle?.name || "",
    unreadMessages: Number(communication.unreadCount || 0),
  };
}
async function report(context, request) {
  requireAdministrator(request);
  const classId = id(request?.query?.classId, "classId"),
    asOf = isoDate(request?.query?.asOfIsoDate),
    roster = await context.directory.getClassRoster(classId, asOf);
  if (!Array.isArray(roster.students) || roster.students.length > 500)
    throw new Error("Class roster exceeds the reporting limit");
  const studentIds = [
    ...new Set(
      roster.students.map((student) => id(student.studentId, "studentId")),
    ),
  ];
  const byStudent = new Map(studentIds.map((studentId) => [studentId, {}]));
  for (const [owner, model] of ADAPTERS) {
    try {
      const rows = studentIds.length
        ? await context.readModels.read(owner, model, [1], studentIds)
        : [];
      for (const row of rows)
        if (byStudent.has(row.key)) byStudent.get(row.key)[model] = row.data;
    } catch {
      /* Optional plugin or projection is unavailable; preserve an empty section. */
    }
  }
  return {
    classId,
    className: roster.className || "",
    asOfIsoDate: asOf,
    rows: roster.students.map((student) =>
      summarize(student, byStudent.get(student.studentId) || {}),
    ),
  };
}
const NON_STAFF_ROLES = new Set([
  "STUDENT",
  "PARENT",
  "ADMIN",
  "WATTAMAN_REPORTER",
]);
async function staffReport(context, request) {
  requireAdministrator(request);
  const reportDate = isoDate(request?.query?.date),
    audience = await context.directory.resolveAudience({ audience: "SCHOOL" });
  const staffIds = [
    ...new Set(
      audience
        .filter(
          (person) =>
            !NON_STAFF_ROLES.has(String(person.role || "").toUpperCase()),
        )
        .map((person) => id(person.id, "staffId")),
    ),
  ];
  if (staffIds.length > 500)
    throw new Error("Staff directory exceeds the reporting limit");
  const people = staffIds.length
    ? await context.directory.lookupUsers(staffIds)
    : [];
  let projections = [];
  try {
    projections = staffIds.length
      ? await context.readModels.read(
          "wattanam.human-resources",
          "staff-attendance-summary",
          [1],
          staffIds,
        )
      : [];
  } catch {
    /* Human Resources is optional. */
  }
  const byId = new Map(projections.map((row) => [row.key, row.data]));
  return {
    date: reportDate,
    rows: people.map((person) => {
      const data = byId.get(person.id) || {},
        daily = (Array.isArray(data.recent) ? data.recent : []).filter(
          (row) => String(row.date).slice(0, 10) === reportDate,
        ),
        counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
      for (const row of daily)
        if (Object.prototype.hasOwnProperty.call(counts, row.status))
          counts[row.status] += 1;
      if (daily.length === 0) counts.ABSENT = 1;
      return {
        staffId: person.id,
        staffName: person.name || "",
        role: person.role || "",
        present: counts.PRESENT,
        late: counts.LATE,
        absent: counts.ABSENT,
        excused: counts.EXCUSED,
        recordedSessions: daily.length,
      };
    }),
  };
}
module.exports = {
  id: "wattanam.reporting",
  health() { return { status: "ready" }; },
  async activate(context) {
    const view = "wattanam.reporting.student-summary.view";
    context.permissions.register([
      { id: view, label: "View cross-module student summary reports" },
    ]);
    context.navigation.register([
      {
        id: "student-summary",
        label: "Student summary reports",
        href: "/plugins/wattanam.reporting/student-summaries",
        permission: view,
        dashboard: {
          title: "Reporting",
          description:
            "Build privacy-minimized reports from installed plugin read models.",
          priority: 160,
        },
      },
      {
        id: "staff-summary",
        label: "Staff attendance summary",
        href: "/plugins/wattanam.reporting/staff-summaries",
        permission: view,
      },
    ]);
    context.routes.register({
      method: "GET",
      path: "student-summaries",
      permission: view,
      handler: async (request) => (await report(context, request)).rows,
    });
    context.routes.register({
      method: "GET",
      path: "student-summaries/export.csv",
      permission: view,
      handler: async (request) => {
        const result = await report(context, request),
          columns = [
            "studentNumber",
            "studentName",
            "attendancePresent",
            "attendanceLate",
            "attendanceAbsent",
            "feeBalance",
            "gradeEntries",
            "transportVehicle",
            "unreadMessages",
          ],
          content = [
            columns.join(","),
            ...result.rows.map((row) =>
              columns.map((column) => csvCell(row[column])).join(","),
            ),
          ].join("\r\n");
        return {
          filename: `student-summary-${result.classId}-${result.asOfIsoDate}.csv`,
          contentType: "text/csv; charset=utf-8",
          content: `\uFEFF${content}`,
        };
      },
    });
    context.routes.register({
      method: "GET",
      path: "staff-summaries",
      permission: view,
      handler: async (request) => (await staffReport(context, request)).rows,
    });
  },
};
module.exports.report = report;
module.exports.staffReport = staffReport;
module.exports.summarize = summarize;
