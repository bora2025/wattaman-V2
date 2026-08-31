'use client';

import CursorTable from '../../../components/CursorTable';

interface AuditRow {
  id: string;
  action: string;
  success: boolean;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: string;
  operator: { id: string; email: string; displayName: string } | null;
}

export default function AuditPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Audit</h1>
      <p className="text-sm text-slate-600">
        Append-only record of platform operator activity. Reading this page is itself audited.
      </p>
      <CursorTable<AuditRow>
        path="audit-events"
        emptyMessage="No audit events recorded yet."
        columns={[
          { header: 'When', render: (row) => (
            <time dateTime={row.createdAt} title={row.createdAt}>
              {new Date(row.createdAt).toLocaleString()}
            </time>
          ) },
          { header: 'Actor', render: (row) => row.operator ? row.operator.email : <span className="text-slate-400">system</span> },
          { header: 'Action', render: (row) => <span className="font-mono text-xs">{row.action}</span> },
          { header: 'Target', render: (row) => row.targetType ? `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ''}` : '—' },
          { header: 'Outcome', render: (row) => (
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {row.success ? 'success' : 'failure'}
            </span>
          ) },
        ]}
      />
    </div>
  );
}
