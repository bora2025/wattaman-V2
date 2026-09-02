'use client';

import { useEffect, useState } from 'react';
import { platformJson } from '../lib/api';

function label(value: string) {
  return value.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());
}

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-500">—</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  return <span className="break-words">{String(value)}</span>;
}

function ObjectBlock({ value }: { value: Record<string, unknown> }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
    {Object.entries(value).map(([key, item]) => <div key={key} className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label(key)}</dt>
      <dd className="mt-1 text-sm text-slate-800">
        {Array.isArray(item) ? <ArrayBlock values={item} /> : item && typeof item === 'object' ? <ObjectBlock value={item as Record<string, unknown>} /> : <Scalar value={item} />}
      </dd>
    </div>)}
  </dl>;
}

function ArrayBlock({ values }: { values: unknown[] }) {
  if (!values.length) return <span className="text-slate-500">None</span>;
  return <div className="space-y-2">{values.map((item, index) => <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    {item && typeof item === 'object' ? <ObjectBlock value={item as Record<string, unknown>} /> : <Scalar value={item} />}
  </div>)}</div>;
}

/** Generic read-only detail renderer. Its inputs come from endpoint-specific Prisma select lists,
 * so it cannot expose fields the API did not deliberately select. */
export default function RecordInspector({ path, title }: { path: string; title: string }) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { platformJson<Record<string, unknown>>(path).then(setRecord).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load record')); }, [path]);
  return <div className="space-y-4">
    <h1 className="text-xl font-bold">{title}</h1>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!record && !error && <p className="text-sm text-slate-500">Loading…</p>}
    {record && <section className="rounded-xl border border-slate-200 bg-white p-5"><ObjectBlock value={record} /></section>}
  </div>;
}
