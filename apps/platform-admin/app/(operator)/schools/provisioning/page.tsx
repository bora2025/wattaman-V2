'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OperatorProfile, platformJson } from '../../../../lib/api';
import { humanStatus, ProvisioningRequest, PROVISIONING_STATUSES } from '../../../../lib/school-provisioning';

type Page = { items: ProvisioningRequest[]; nextCursor: string | null };
const empty = { customerSchoolId: '', targetWorkspaceId: '', environment: 'production', region: '', releaseVersion: '', apiImage: '', webImage: '', gatewayImage: '', requestedDomain: '', internalReason: '' };

export default function SchoolProvisioningPage() {
  const [items, setItems] = useState<ProvisioningRequest[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const query = status ? `?status=${status}` : '';
    setItems((await platformJson<Page>(`schools/provisioning-requests${query}`)).items);
  }, [status]);

  useEffect(() => { load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load requests')); }, [load]);
  useEffect(() => { platformJson<OperatorProfile>('me').then(p => setCanManage(p.permissions.includes('schools.manage'))).catch(() => undefined); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { ...form, idempotencyKey: crypto.randomUUID(), region: form.region || undefined, requestedDomain: form.requestedDomain || undefined };
      const row = await platformJson<ProvisioningRequest>('schools/provisioning-requests', { method: 'POST', body: JSON.stringify(payload) });
      setForm(empty); setShowCreate(false); await load();
      await act(row.id, 'submit', 'Submitted after operator reviewed immutable release and workspace details');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create request'); }
    finally { setBusy(false); }
  }

  async function act(id: string, action: 'submit' | 'approve' | 'cancel' | 'retry', preset?: string) {
    const internalReason = preset ?? window.prompt(`Internal reason for ${action}`)?.trim();
    if (!internalReason) return;
    setBusy(true); setError('');
    try { await platformJson(`schools/provisioning-requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({ internalReason }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action}`); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold">School provisioning</h1><p className="text-sm text-slate-500">Request, independently approve, and track isolated school infrastructure. Approved work is claimed by the provisioning worker.</p></div>
      {canManage && <button className="pa-btn-primary" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Cancel' : 'New provisioning request'}</button>}
    </div>
    {showCreate && <form className="pa-card space-y-3" onSubmit={create}>
      <p className="text-sm text-amber-700">Use image digests, not mutable tags. A second operator must approve this request.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.keys(empty).map(key => <label className={`text-xs font-medium text-slate-600 ${key.includes('Image') || key === 'internalReason' ? 'md:col-span-2' : ''}`} key={key}>{key.replace(/([A-Z])/g, ' $1')}
          <input className="pa-input mt-1" required={!['region', 'requestedDomain'].includes(key)} value={form[key as keyof typeof form]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} placeholder={key.includes('Image') ? 'registry.example/image@sha256:…' : undefined} />
        </label>)}
      </div>
      <button className="pa-btn-primary" disabled={busy}>Create and submit</button>
    </form>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="pa-card"><label className="text-xs font-medium">Status <select className="pa-input ml-2 w-auto" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{PROVISIONING_STATUSES.map(s => <option key={s}>{s}</option>)}</select></label></div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3">School</th><th>Release / workspace</th><th>Status</th><th>Approval</th><th>Actions</th></tr></thead><tbody>
      {items.map(row => <tr className="border-b last:border-0" key={row.id}><td className="p-3"><Link className="font-medium text-indigo-700" href={`/schools/${row.customerSchoolId}`}>{row.school.name}</Link><div className="font-mono text-xs text-slate-500">{row.school.slug}</div></td><td><div>{row.releaseVersion}</div><div className="text-xs text-slate-500">{row.targetWorkspaceId}</div></td><td>{humanStatus(row.status)}{row.lastErrorCode && <div className="text-xs text-red-700">{row.lastErrorCode}</div>}</td><td>{row.approvedBy?.displayName ?? 'Not approved'}</td><td className="space-x-2 py-2">
        {canManage && row.status === 'DRAFT' && <button disabled={busy} className="text-indigo-700" onClick={() => act(row.id, 'submit')}>Submit</button>}
        {canManage && row.status === 'PENDING_APPROVAL' && <button disabled={busy} className="text-indigo-700" onClick={() => act(row.id, 'approve')}>Approve</button>}
        {canManage && row.status === 'FAILED_RETRYABLE' && <button disabled={busy} className="text-indigo-700" onClick={() => act(row.id, 'retry')}>Retry</button>}
        {canManage && ['DRAFT','PENDING_APPROVAL','APPROVED','FAILED_RETRYABLE'].includes(row.status) && <button disabled={busy} className="text-red-700" onClick={() => act(row.id, 'cancel')}>Cancel</button>}
      </td></tr>)}
      {!items.length && <tr><td className="p-6 text-center text-slate-500" colSpan={5}>No provisioning requests found.</td></tr>}
    </tbody></table></div>
  </div>;
}
