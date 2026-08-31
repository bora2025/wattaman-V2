'use client';

import Link from 'next/link';
import CursorTable from '../../../components/CursorTable';

interface RequestRow {
  id: string; type: string; status: string; submittedAt: string; slaDueAt: string;
  account: { displayName: string; email: string };
  installation: { installationId: string; label: string | null };
  plugin: { id: string; name: string; isPaid: boolean } | null;
  assignedOperator: { id: string; displayName: string } | null;
}

export default function PluginRequestsPage() {
  return <div className="space-y-4"><div><h1 className="text-xl font-bold">School plugin requests</h1><p className="text-sm text-slate-500">Approval controls marketplace eligibility; the school still installs and activates locally.</p></div>
    <CursorTable<RequestRow> path="plugin-requests" emptyMessage="No school plugin requests found." filters={[
      { key: 'status', label: 'Status', type: 'select', options: ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'CANCELLED', 'ENTITLEMENT_ISSUED'].map(value => ({ value, label: value.toLowerCase().replaceAll('_', ' ') })) },
      { key: 'type', label: 'Request type', type: 'select', options: ['FREE_APPROVAL', 'PURCHASE_ASSISTANCE', 'PRIVATE_PLUGIN_ACCESS', 'TRIAL', 'FEATURE_REQUEST'].map(value => ({ value, label: value.toLowerCase().replaceAll('_', ' ') })) },
      { key: 'assigned', label: 'Assignment', type: 'select', options: [{ value: 'me', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }] },
    ]} columns={[
      { header: 'Request', render: row => <div><Link className="font-medium text-indigo-700 hover:underline" href={`/plugin-requests/${row.id}`}>{row.plugin?.name || 'New feature request'}</Link><div className="text-xs text-slate-500">{row.type.toLowerCase().replaceAll('_', ' ')}</div></div> },
      { header: 'School', render: row => <div>{row.installation.label || row.installation.installationId}<div className="text-xs text-slate-500">{row.account.email}</div></div> },
      { header: 'Status', render: row => row.status.toLowerCase().replaceAll('_', ' ') },
      { header: 'Assigned', render: row => row.assignedOperator?.displayName || 'Unassigned' },
      { header: 'SLA due', render: row => <span className={new Date(row.slaDueAt) < new Date() && !['REJECTED', 'CANCELLED', 'ENTITLEMENT_ISSUED'].includes(row.status) ? 'font-semibold text-red-700' : ''}>{new Date(row.slaDueAt).toLocaleString()}</span> },
    ]} />
  </div>;
}
