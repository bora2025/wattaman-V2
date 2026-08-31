'use client';

import CursorTable from '../../../components/CursorTable';

interface EntitlementRow {
  id: string; pluginId: string; status: string; expiresAt: string; updatesThrough: string;
  plugin: { name: string }; installation: { installationId: string; label: string | null; account: { email: string } | null };
}

export default function EntitlementsPage() {
  return <div className="space-y-4"><h1 className="text-xl font-bold">Entitlements</h1>
    <CursorTable<EntitlementRow> path="entitlements" emptyMessage="No entitlements found." filters={[
      { key: 'status', label: 'Status', type: 'select', options: ['ACTIVE', 'EXPIRED', 'REVOKED', 'REFUNDED'].map(value => ({ value, label: value.toLowerCase() })) },
      { key: 'pluginId', label: 'Plugin ID', placeholder: 'publisher.plugin' },
    ]} columns={[
      { header: 'Plugin', render: row => <div className="font-medium">{row.plugin.name}<div className="font-mono text-xs text-slate-500">{row.pluginId}</div></div> },
      { header: 'School', render: row => <div>{row.installation.label || row.installation.installationId}<div className="text-xs text-slate-500">{row.installation.account?.email}</div></div> },
      { header: 'Status', render: row => row.status.toLowerCase() },
      { header: 'Expires', render: row => new Date(row.expiresAt).toLocaleDateString() },
      { header: 'Updates through', render: row => new Date(row.updatesThrough).toLocaleDateString() },
    ]} />
  </div>;
}
