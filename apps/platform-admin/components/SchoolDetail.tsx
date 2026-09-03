'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OperatorProfile, platformJson } from '../lib/api';

interface School {
  id: string; name: string; slug: string; status: string; region: string | null; timezone: string | null;
  locale: string | null; currency: string | null; plan: string | null; contactName: string | null;
  contactEmail: string | null; railwayProjectId: string | null; gatewayOrigin: string | null; notes: string | null;
  installation: { id: string; installationId: string; label: string | null; lastSeenAt: string | null } | null;
  enrollmentTokens: Array<{ id: string; createdAt: string; expiresAt: string; consumedAt: string | null; revokedAt: string | null }>;
}

export default function SchoolDetail({ schoolId }: { schoolId: string }) {
  const [school, setSchool] = useState<School | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [reason, setReason] = useState('Provision new customer school installation');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => platformJson<School>(`schools/${encodeURIComponent(schoolId)}`).then(setSchool).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load school')), [schoolId]);

  useEffect(() => { load(); platformJson<OperatorProfile>('me').then(profile => setCanManage(profile.permissions.includes('schools.manage'))).catch(() => undefined); }, [load]);

  async function mintToken() {
    setBusy(true); setError(''); setToken('');
    try {
      const result = await platformJson<{ token: string }>(`schools/${schoolId}/enrollment-tokens`, { method: 'POST', body: JSON.stringify({ lifetimeDays: 7, internalReason: reason }) });
      setToken(result.token); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create enrollment token'); }
    finally { setBusy(false); }
  }

  if (error && !school) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!school) return <p className="text-sm text-slate-500">Loading…</p>;
  const liveToken = school.enrollmentTokens.find(item => !item.consumedAt && !item.revokedAt && new Date(item.expiresAt) > new Date());

  return <div className="space-y-4">
    <div><Link className="text-sm text-indigo-700 hover:underline" href="/schools">← Customer schools</Link><h1 className="mt-2 text-xl font-bold">{school.name}</h1><p className="font-mono text-xs text-slate-500">{school.slug}</p></div>
    <section className="pa-card"><dl className="grid gap-4 text-sm md:grid-cols-3">
      <Item label="Lifecycle" value={school.status.toLowerCase().replace('_', ' ')} /><Item label="Contact" value={[school.contactName, school.contactEmail].filter(Boolean).join(' · ') || '—'} /><Item label="Plan" value={school.plan || '—'} />
      <Item label="Region" value={school.region || '—'} /><Item label="Locale / timezone" value={[school.locale, school.timezone].filter(Boolean).join(' · ') || '—'} /><Item label="Currency" value={school.currency || '—'} />
      <Item label="Railway project" value={school.railwayProjectId || 'Not recorded'} /><Item label="Gateway" value={school.gatewayOrigin || 'Not recorded'} /><Item label="Installation" value={school.installation?.installationId || 'Not claimed'} />
    </dl></section>
    {token && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Copy this enrollment token now</h2><p className="mt-1 text-sm text-amber-900">It is displayed only once. Store it in the new school API as its enrollment secret; do not send it through chat or email.</p><code className="mt-3 block break-all rounded-lg bg-white p-3 text-sm">{token}</code></section>}
    {canManage && !school.installation && <section className="pa-card space-y-3"><h2 className="font-semibold">Installation enrollment</h2>{liveToken ? <p className="text-sm text-amber-700">A live token already exists and expires {new Date(liveToken.expiresAt).toLocaleString()}. Revoke it before creating another.</p> : <><p className="text-sm text-slate-600">Create a seven-day, one-time token after you are ready to deploy this school.</p><label className="block text-xs font-medium text-slate-600">Internal reason<textarea className="pa-input mt-1 min-h-20" minLength={3} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={mintToken}>{busy ? 'Creating…' : 'Create enrollment token'}</button></>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</section>}
    <section className="pa-card"><h2 className="font-semibold">What happens next</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600"><li>Provision one isolated Railway project for this school.</li><li>Configure the school API with the one-time enrollment token.</li><li>Run installation and marketplace registration.</li><li>Return here and confirm the installation is claimed and healthy.</li></ol></section>
  </div>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }
