'use client';

import { useEffect, useState } from 'react';
import { platformJson } from '../../../lib/api';

interface Health { checkedAt: string; database: string; attention: Record<string, number> }

export default function OperationsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { platformJson<Health>('operations/health').then(setHealth).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load health')); }, []);
  return <div className="space-y-5">
    <div><h1 className="text-xl font-bold">Marketplace operations</h1><p className="text-sm text-slate-500">Central marketplace signals only; this does not inspect customer-school health.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!health && !error && <p className="text-sm text-slate-500">Loading…</p>}
    {health && <><section className="rounded-xl border bg-white p-5"><div className="text-xs uppercase text-slate-500">Database</div><div className="mt-1 text-lg font-semibold">{health.database}</div><div className="mt-1 text-xs text-slate-500">Checked {new Date(health.checkedAt).toLocaleString()}</div></section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(health.attention).map(([key, value]) => <article key={key} className="rounded-xl border bg-white p-4"><div className="text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-slate-500">{key.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}</div></article>)}</section></>}
  </div>;
}
