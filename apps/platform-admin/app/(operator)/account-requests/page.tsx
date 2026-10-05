'use client';

import { useEffect, useState } from 'react';
import { OperatorProfile, platformJson } from '../../../lib/api';

type RequestRow = {
  id: string; email: string; displayName: string; schoolName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; reviewedAt: string | null;
  reviewedBy: { displayName: string } | null;
};

export default function AccountRequestsPage() {
  const [items, setItems] = useState<RequestRow[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [reason, setReason] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load(selected = status) {
    const page = await platformJson<{ items: RequestRow[] }>(`account-requests?status=${selected}`);
    setItems(page.items);
  }
  useEffect(() => {
    Promise.all([platformJson<OperatorProfile>('me'), platformJson<{ items: RequestRow[] }>('account-requests?status=PENDING')])
      .then(([profile, page]) => { setCanManage(profile.permissions.includes('account_requests.review')); setItems(page.items); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load account requests'));
  }, []);

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(id); setError('');
    try {
      await platformJson(`account-requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({ internalReason: reason }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Decision failed'); }
    finally { setBusy(''); }
  }

  return <div className="space-y-4">
    <div><h1 className="text-xl font-bold">Marketplace account requests</h1><p className="text-sm text-slate-500">Review account requests submitted from customer-school Licensing. Password hashes are never displayed.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <select className="pa-input" value={status} onChange={async event => { const value = event.target.value; setStatus(value); await load(value); }}><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></select>
      {canManage && <input className="pa-input min-w-80 flex-1" value={reason} onChange={event => setReason(event.target.value)} placeholder="Required internal decision reason" />}
    </div>
    <div className="space-y-3">{items.map(item => <article key={item.id} className="pa-card flex flex-wrap items-center justify-between gap-4">
      <div><div className="font-semibold">{item.displayName}</div><div className="text-sm text-slate-600">{item.email}</div><div className="text-xs text-slate-500">{item.schoolName || 'School not supplied'} · requested {new Date(item.createdAt).toLocaleString()}</div></div>
      <div className="flex items-center gap-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs">{item.status.toLowerCase()}</span>{canManage && item.status === 'PENDING' && <><button className="pa-btn-primary" disabled={busy === item.id || reason.trim().length < 3} onClick={() => decide(item.id, 'approve')}>Approve</button><button className="pa-btn-secondary" disabled={busy === item.id || reason.trim().length < 3} onClick={() => decide(item.id, 'reject')}>Reject</button></>}</div>
    </article>)}{items.length === 0 && <div className="pa-card text-sm text-slate-500">No {status.toLowerCase()} account requests.</div>}</div>
  </div>;
}
