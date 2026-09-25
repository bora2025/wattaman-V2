'use strict';

const ENTRY = 'plugin_wattanam_examination_score_entry';
const SUBJECT = 'plugin_wattanam_examination_score_subject';
const TAB = 'plugin_wattanam_examination_score_tab';
const SHEET = 'plugin_wattanam_examination_score_sheet';
const ATTEMPT = 'plugin_wattanam_examination_attempt';
const EXAM = 'plugin_wattanam_examination_exam';

async function publishStudentGradeSummary(context, studentId) {
  const [gradebookRows, attemptRows] = await Promise.all([
    context.database.query(
      `SELECT e."score",s."name" AS "subject",s."maxScore",t."label" AS "period",g."name" AS "gradebook",g."studyYearId",e."updatedAt" FROM ${ENTRY} e JOIN ${SUBJECT} s ON s."id"=e."subjectId" JOIN ${TAB} t ON t."id"=e."scoreTabId" JOIN ${SHEET} g ON g."id"=t."scoreSheetId" WHERE e."academicStudentId"=$1 AND e."score" IS NOT NULL ORDER BY e."updatedAt" DESC LIMIT 200`,
      [studentId],
    ),
    context.database.query(
      `SELECT a."score",a."grade",a."status",a."submittedAt",a."gradedAt",e."title",e."totalMarks" FROM ${ATTEMPT} a JOIN ${EXAM} e ON e."id"=a."examId" WHERE a."academicStudentId"=$1 AND a."status"='GRADED' ORDER BY a."gradedAt" DESC NULLS LAST LIMIT 100`,
      [studentId],
    ),
  ]);
  const gradebooks = gradebookRows.map((row) => ({
    subject: row.subject, period: row.period, gradebook: row.gradebook,
    studyYearId: row.studyYearId || null, score: row.score == null ? null : Number(row.score),
    maximumScore: row.maxScore == null ? null : Number(row.maxScore), updatedAt: row.updatedAt || null,
  }));
  const attempts = attemptRows.map((row) => ({
    title: row.title, score: row.score == null ? null : Number(row.score),
    maximumScore: row.totalMarks == null ? null : Number(row.totalMarks), grade: row.grade || null,
    submittedAt: row.submittedAt || null, gradedAt: row.gradedAt || null,
  }));
  await context.readModels.publish('student-grade-summary', 1, studentId, {
    studentId, gradebooks, attempts, generatedAt: new Date().toISOString(),
  });
}

module.exports = { publishStudentGradeSummary };
