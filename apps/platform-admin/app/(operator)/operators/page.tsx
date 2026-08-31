'use client';

import Link from 'next/link';
import CursorTable from '../../../components/CursorTable';

interface OperatorRow {
  id: string; email: string; displayName: string; status: string; mfaEnabled: boolean;
  lockedUntil: string | null; createdAt: string;
  roles: Array<{ role: { key: string; displayName: string } }>;
  _count: { sessions: number };
}

export default function OperatorsPage() {
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-bold">Platform operators</h1><p className="text-sm text-slate-500">Named operator identities, active role grants, and safe session counts.</p></div><Link className="pa-btn-secondary" href="/roles">View role definitions</Link></div>
    <CursorTable<OperatorRow> path="operators" emptyMessage="No operators found." columns={[
      { header: 'Operator', render: row => <div><Link className="font-medium text-indigo-700 hover:underline" href={`/operators/${row.id}`}>{row.displayName}</Link><div className="text-xs text-slate-500">{row.email}</div></div> },
      { header: 'Status', render: row => row.status.toLowerCase() },
      { header: 'MFA', render: row => row.mfaEnabled ? 'Enabled' : 'Enrollment required' },
      { header: 'Roles', render: row => row.roles.map(grant => grant.role.displayName).join(', ') || 'None' },
      { header: 'Sessions', render: row => row._count.sessions },
      { header: 'Locked', render: row => row.lockedUntil && new Date(row.lockedUntil) > new Date() ? 'Yes' : 'No' },
    ]} />
  </div>;
}
