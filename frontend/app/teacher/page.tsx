'use client';

import AuthGuard from '../../components/AuthGuard';

export default function TeacherPortal() {
  return (
    <AuthGuard allowedRoles={['TEACHER']}>
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-bold text-slate-900">Teacher account</h1>
        <p className="mt-3 text-slate-600">
          Teaching features are supplied by installed plugins. Ask your school administrator to install and activate the features you need.
        </p>
      </main>
    </AuthGuard>
  );
}
