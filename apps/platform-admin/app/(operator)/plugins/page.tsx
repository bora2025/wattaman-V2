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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Marketplace catalog</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Plugin management</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Manage presentation, pricing, releases, and customer access for verified Wattanam plugins.</p></div><Link className="pa-btn-primary" href="/submissions">Review submissions</Link></header>
      <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5"><div className="text-sm font-bold text-indigo-950">Promote every plugin</div><p className="mt-2 text-xs leading-5 text-indigo-700">Add a cover, customer-focused description, and interface screenshots from each plugin page.</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><div className="text-sm font-bold text-emerald-950">Free activation</div><p className="mt-2 text-xs leading-5 text-emerald-700">Free products appear with a direct Activate action in customer schools.</p></div><div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5"><div className="text-sm font-bold text-amber-950">Paid conversion</div><p className="mt-2 text-xs leading-5 text-amber-700">Paid products guide schools through order, payment approval, and activation.</p></div></div>
      <CursorTable<PluginRow>
        path="plugins"
        emptyMessage="No catalog plugins found. Publish at least one approved release and refresh."
        filters={[
          { key: 'publisher', label: 'Publisher slug', placeholder: 'publisher' },
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
          { header: 'Business model', render: (row) => <div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.isPaid ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{row.isPaid ? 'Paid' : 'Free'}</span><div className="mt-2 text-xs text-slate-500">{row.license}</div></div> },
          { header: 'Releases', render: (row) => <span className="font-semibold tabular-nums">{row._count.versions}</span> },
          { header: '', render: (row) => <Link className="pa-btn-secondary whitespace-nowrap" href={`/plugins/${row.id}`}>Manage →</Link> },
        ]}
      />
    </div>
  );
}
