'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CursorTable from '../../../components/CursorTable';
import { OperatorProfile, platformJson } from '../../../lib/api';

interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  status: 'PROSPECT' | 'AWAITING_CLAIM' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  region: string | null;
  plan: string | null;
  contactEmail: string | null;
  installation: { id: string; installationId: string; lastSeenAt: string | null } | null;
}

const initialForm = { name: '', slug: '', region: '', timezone: 'Asia/Phnom_Penh', locale: 'km-KH', currency: 'USD', plan: '', contactName: '', contactEmail: '', railwayProjectId: '', gatewayOrigin: '', notes: '', internalReason: '' };

export default function SchoolsPage() {
  const router = useRouter();
  const [canManage, setCanManage] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    platformJson<OperatorProfile>('me').then(profile => setCanManage(profile.permissions.includes('schools.manage'))).catch(() => undefined);
  }, []);

  function set(key: keyof typeof initialForm, value: string) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim() !== ''));
      const school = await platformJson<SchoolRow>('schools', { method: 'POST', body: JSON.stringify(payload) });
      router.push(`/schools/${school.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create school');
    } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-xl font-bold">Customer schools</h1><p className="text-sm text-slate-500">Create the customer directory record before deploying or enrolling its isolated school installation.</p></div>
      {canManage && <div className="flex gap-2">
        <Link className="pa-btn-secondary" href="/schools/provisioning">Provision a new school</Link>
        <Link className="pa-btn-secondary" href="/schools/adopt">Adopt existing Railway school</Link>
        <button className="pa-btn-primary" onClick={() => setShowCreate(value => !value)}>{showCreate ? 'Cancel' : 'Create customer school'}</button>
      </div>}
    </div>

    {showCreate && <form className="pa-card space-y-4" onSubmit={createSchool}>
      <div><h2 className="font-semibold">New customer school</h2><p className="mt-1 text-xs text-slate-500">This creates the audited platform record. Railway deployment remains a separate controlled operation.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="School name" required value={form.name} onChange={value => set('name', value)} />
        <Field label="Slug" required value={form.slug} placeholder="bora-school" onChange={value => set('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))} />
        <Field label="Contact name" value={form.contactName} onChange={value => set('contactName', value)} />
        <Field label="Contact email" type="email" value={form.contactEmail} onChange={value => set('contactEmail', value)} />
        <Field label="Region" value={form.region} placeholder="Southeast Asia" onChange={value => set('region', value)} />
        <Field label="Plan" value={form.plan} placeholder="Standard" onChange={value => set('plan', value)} />
        <Field label="Timezone" value={form.timezone} onChange={value => set('timezone', value)} />
        <Field label="Locale" value={form.locale} onChange={value => set('locale', value)} />
        <Field label="Currency (ISO 4217)" required value={form.currency} maxLength={3} onChange={value => set('currency', value.toUpperCase())} />
        <Field label="Railway project ID" value={form.railwayProjectId} placeholder="b5b07c38-6569-4bee-ab88-6b134998c77d" hint="Optional. One Railway project holds one school, so this cannot be shared." onChange={value => set('railwayProjectId', value.trim())} />
        <Field label="Gateway origin" type="url" value={form.gatewayOrigin} placeholder="https://gateway-production-26d3.up.railway.app" hint="Optional. The school's public entry point, scheme included." onChange={value => set('gatewayOrigin', value.trim())} />
        <label className="text-xs font-medium text-slate-600 md:col-span-2">Notes<textarea className="pa-input mt-1 min-h-20" value={form.notes} onChange={event => set('notes', event.target.value)} /></label>
        <label className="text-xs font-medium text-slate-600 md:col-span-2">Internal reason <span aria-hidden="true">*</span><textarea required minLength={3} className="pa-input mt-1 min-h-20" value={form.internalReason} onChange={event => set('internalReason', event.target.value)} placeholder="New signed customer agreement" /></label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="pa-btn-primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create school'}</button>
    </form>}

    <p className="text-xs text-slate-500">Terminated schools are archived and hidden by default. Select <strong>terminated</strong> in the lifecycle filter to view or restore them.</p>
    <CursorTable<SchoolRow> path="schools" emptyMessage="No active customer school records found." filters={[
      { key: 'name', label: 'School name', placeholder: 'Bora School' },
      { key: 'status', label: 'Lifecycle', type: 'select', options: ['PROSPECT', 'AWAITING_CLAIM', 'ACTIVE', 'SUSPENDED', 'TERMINATED'].map(value => ({ value, label: value.toLowerCase().replace('_', ' ') })) },
      { key: 'claimed', label: 'Installation', type: 'select', options: [{ value: 'true', label: 'Claimed' }, { value: 'false', label: 'Not claimed' }] },
    ]} columns={[
      { header: 'School', render: row => <div><Link className="font-medium text-indigo-700 hover:underline" href={`/schools/${row.id}`}>{row.name}</Link><div className="font-mono text-xs text-slate-500">{row.slug}</div></div> },
      { header: 'Status', render: row => row.status.toLowerCase().replace('_', ' ') },
      { header: 'Region / plan', render: row => <div>{row.region || '—'}<div className="text-xs text-slate-500">{row.plan || 'No plan'}</div></div> },
      { header: 'Contact', render: row => row.contactEmail || '—' },
      { header: 'Installation', render: row => row.installation ? <span className="text-emerald-700">Claimed</span> : <span className="text-amber-700">Not claimed</span> },
    ]} />
  </div>;
}

function Field({ label, hint, onChange, ...input }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; placeholder?: string; maxLength?: number; hint?: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <div>
    <label className="text-xs font-medium text-slate-600" htmlFor={id}>{label}{input.required && <> <span aria-hidden="true">*</span></>}</label>
    <input id={id} className="pa-input mt-1" aria-describedby={hint ? `${id}-hint` : undefined} {...input} onChange={event => onChange(event.target.value)} />
    {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>;
}
