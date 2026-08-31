'use client';

import CursorTable from '../../../components/CursorTable';
import Link from 'next/link';

interface PublisherRow {
  id: string; slug: string; displayName: string; status: string; createdAt: string;
  _count: { plugins: number; members: number; keys: number; submissions: number };
}

export default function PublishersPage() {
  return <div className="space-y-4"><h1 className="text-xl font-bold">Publishers</h1>
    <CursorTable<PublisherRow> path="publishers" emptyMessage="No publishers found." columns={[
      { header: 'Publisher', render: row => <div><Link className="font-medium text-indigo-700 hover:underline" href={`/publishers/${row.id}`}>{row.displayName}</Link><div className="font-mono text-xs text-slate-500">{row.slug}</div></div> },
      { header: 'Status', render: row => row.status.toLowerCase() },
      { header: 'Plugins', render: row => row._count.plugins },
      { header: 'Members', render: row => row._count.members },
      { header: 'Keys', render: row => row._count.keys },
      { header: 'Submissions', render: row => row._count.submissions },
    ]} />
  </div>;
}
