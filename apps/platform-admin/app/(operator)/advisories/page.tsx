'use client';

import CursorTable from '../../../components/CursorTable';

interface AdvisoryRow {
  id: string; pluginId: string; title: string; severity: string; affectedVersions: string;
  fixedVersion: string | null; recommendedAction: string; publishedAt: string; withdrawnAt: string | null;
  plugin: { name: string };
}

export default function AdvisoriesPage() {
  return <div className="space-y-4"><h1 className="text-xl font-bold">Security advisories</h1>
    <CursorTable<AdvisoryRow> path="advisories" emptyMessage="No advisories found." columns={[
      { header: 'Advisory', render: row => <div className="font-medium">{row.title}<div className="text-xs text-slate-500">{row.plugin.name} · {row.affectedVersions}</div></div> },
      { header: 'Severity', render: row => row.severity.toLowerCase() },
      { header: 'Action', render: row => row.recommendedAction.toLowerCase() },
      { header: 'Fixed version', render: row => row.fixedVersion || 'Not fixed' },
      { header: 'State', render: row => row.withdrawnAt ? 'Withdrawn' : 'Open' },
      { header: 'Published', render: row => new Date(row.publishedAt).toLocaleDateString() },
    ]} />
  </div>;
}
