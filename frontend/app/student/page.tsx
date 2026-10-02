'use client';

import AuthGuard from '../../components/AuthGuard';

export default function StudentPortal() {
  return (
    <AuthGuard allowedRoles={['STUDENT']}>
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-bold text-slate-900">Student account</h1>
        <p className="mt-3 text-slate-600">
          Student features are supplied by installed plugins. Ask your school administrator which features are available.
        </p>
      </main>
    </AuthGuard>
  );
}
