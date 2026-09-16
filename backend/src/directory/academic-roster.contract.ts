export const ACADEMIC_ROSTER_CONTRACT_ID = 'wattanam.academic-management.roster';
export const ACADEMIC_ROSTER_CONTRACT_VERSION = '1.0.0';

export type AcademicRosterStudent = {
  studentId: string;
  userId: string;
  studentNumber: string | null;
  name: string;
  parentId: string | null;
};

export type AcademicClassRoster = {
  contract: { id: typeof ACADEMIC_ROSTER_CONTRACT_ID; version: typeof ACADEMIC_ROSTER_CONTRACT_VERSION };
  classId: string;
  className: string | null;
  asOfIsoDate: string;
  source: 'legacy-current-membership' | 'plugin-enrollment-interval';
  students: AcademicRosterStudent[];
};

export type AcademicEnrollment = {
  contract: { id: typeof ACADEMIC_ROSTER_CONTRACT_ID; version: typeof ACADEMIC_ROSTER_CONTRACT_VERSION };
  studentId: string;
  classId: string | null;
  className: string | null;
  enrolled: boolean;
  asOfIsoDate: string;
  source: 'legacy-current-membership' | 'plugin-enrollment-interval';
};

export function currentAcademicDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error('asOfIsoDate must be a valid ISO date (YYYY-MM-DD)');
  }
  return value;
}
