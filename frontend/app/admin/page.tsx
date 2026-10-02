'use client';

import AuthGuard from '../../components/AuthGuard';
import CoreAdminDashboard from '../../components/CoreAdminDashboard';

export default function AdminPage() {
  return (
    <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'CLASS_ADMIN']}>
      <CoreAdminDashboard />
    </AuthGuard>
  );
}
