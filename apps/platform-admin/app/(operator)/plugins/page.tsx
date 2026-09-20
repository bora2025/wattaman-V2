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
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Empty table usually means no approved plugin releases are published yet. Publish signed <code className="font-mono">.wtp</code> packages to <code className="font-mono">/admin/v1/plugin-releases</code> first, then refresh this page.
      </div>
      <CursorTable<PluginRow>
        path="plugins"
        emptyMessage="No catalog plugins found. Publish at least one approved release and refresh."
        filters={[
          { key: 'publisher', label: 'Publisher slug', placeholder: 'publisher' },
          { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'].map(value => ({ value, label: value.toLowerCase().replaceAll('_', ' ') })) },
          { key: 'paid', label: 'Pricing', type: 'select', options: [{ value: 'true', label: 'Paid' }, { value: 'false', label: 'Free' }] },
        ]}
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
