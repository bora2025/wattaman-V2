'use strict';

// Who is an administrator, and whose classes the directory can answer for.
// The school core has three administrator roles. Academic Management's class-membership contract
// answers only for teachers, class admins, students and parents; an administrator sees every
// exam anyway, so asking for "their" classes is never needed (and fails on the core build).

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']);
const CLASS_ROLES = new Set(['TEACHER', 'CLASS_ADMIN', 'STUDENT', 'PARENT']);

function isAdmin(principal) { return ADMIN_ROLES.has(String(principal?.role || '')); }

/** The context, with directory.classesForUser answering [] for roles that have no classes. */
function withRoles(context) {
  const directory = context.directory || {};
  return {
    ...context,
    directory: {
      ...directory,
      classesForUser: async (userId, role) => (CLASS_ROLES.has(String(role || '')) ? directory.classesForUser(userId, role) : []),
    },
  };
}

module.exports = { ADMIN_ROLES, CLASS_ROLES, isAdmin, withRoles };
