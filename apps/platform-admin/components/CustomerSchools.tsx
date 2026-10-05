'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { platformJson } from '../lib/api';

type OwnedSchool = {
  id: string; name: string; slug: string; status: string; createdAt: string;
  installation: { installationId: string; lastSeenAt: string | null } | null;
};

export default function CustomerSchools({ accountId }: { accountId: string }) {
  const [schools, setSchools] = useState<OwnedSchool[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    platformJson<{ customerSchools: OwnedSchool[] }>(`customers/${encodeURIComponent(accountId)}`)
      .then(customer => setSchools(customer.customerSchools))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load customer schools'));
  }, [accountId]);

  return <section className="pa-card space-y-3">
    <div><h2 className="font-semibold">Customer schools</h2><p className="text-sm text-slate-600">Open a school to generate its enrollment token and manage claim, installation, domains, billing, and lifecycle.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {schools === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
    {schools?.map(school => <article key={school.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div><Link className="font-semibold text-indigo-700 hover:underline" href={`/schools/${school.id}`}>{school.name}</Link><div className="font-mono text-xs text-slate-500">{school.slug}</div></div>
      <div className="text-right text-xs"><div className="uppercase text-slate-600">{school.status.replaceAll('_', ' ')}</div><div className={school.installation ? 'text-emerald-700' : 'text-amber-700'}>{school.installation ? 'Claimed installation' : 'Not claimed'}</div></div>
    </article>)}
    {schools?.length === 0 && <p className="text-sm text-slate-500">No school is assigned to this customer account.</p>}
  </section>;
}
