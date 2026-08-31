'use client';

import CursorTable from '../../../components/CursorTable';
import Link from 'next/link';

interface SubmissionRow {
  id: string; status: string; riskLevel: string; submittedAt: string; decidedAt: string | null;
  publisher: { displayName: string }; pluginVersion: { pluginId: string; version: string; channel: string };
  _count: { reviews: number };
}

export default function SubmissionsPage() {
  return <div className="space-y-4"><h1 className="text-xl font-bold">Plugin submissions</h1>
    <CursorTable<SubmissionRow> path="submissions" emptyMessage="No submissions found." columns={[
      { header: 'Plugin', render: row => <div><Link className="font-medium text-indigo-700 hover:underline" href={`/submissions/${row.id}`}>{row.pluginVersion.pluginId}</Link><div className="text-xs text-slate-500">{row.pluginVersion.version} · {row.pluginVersion.channel.toLowerCase()}</div></div> },
      { header: 'Publisher', render: row => row.publisher.displayName },
      { header: 'Status', render: row => row.status.toLowerCase().replaceAll('_', ' ') },
      { header: 'Risk', render: row => row.riskLevel },
      { header: 'Reviews', render: row => row._count.reviews },
      { header: 'Submitted', render: row => new Date(row.submittedAt).toLocaleString() },
    ]} />
  </div>;
}
