'use client';

import CursorTable from '../../../components/CursorTable';
import Link from 'next/link';

interface PluginRow {
  id: string;
  name: string;
  license: string;
  isPaid: boolean;
  status: string;
  createdAt: string;
  publisher: { slug: string; displayName: string };
  _count: { versions: number };
}

export default function PluginsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Plugins</h1>
      <CursorTable<PluginRow>
        path="plugins"
        emptyMessage="No plugins are in the catalog yet."
        columns={[
          { header: 'Plugin', render: (row) => (
            <div>
              <Link className="font-medium text-indigo-700 hover:underline" href={`/plugins/${row.id}`}>{row.name}</Link>
              <div className="font-mono text-xs text-slate-500">{row.id}</div>
            </div>
          ) },
          { header: 'Publisher', render: (row) => row.publisher.displayName },
          { header: 'Status', render: (row) => (
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {row.status.toLowerCase()}
            </span>
          ) },
          { header: 'Licence', render: (row) => `${row.license}${row.isPaid ? ' · paid' : ' · free'}` },
          { header: 'Versions', render: (row) => row._count.versions },
        ]}
      />
    </div>
  );
}
