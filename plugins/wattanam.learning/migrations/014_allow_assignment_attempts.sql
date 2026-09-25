-- wattanam-plugin-migration: 014_allow_assignment_attempts
ALTER TABLE plugin_wattanam_learning_assignment_submission DROP CONSTRAINT IF EXISTS "plugin_wattanam_learning_assignment_submission_assignmentId_academicStudentId_key", ADD CONSTRAINT "plugin_wattanam_learning_submission_attempt_key" UNIQUE ("assignmentId","academicStudentId","attemptNumber");
