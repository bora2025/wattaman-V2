'use client';

import { useCallback, useEffect, useState } from 'react';
import { OperatorProfile, platformJson } from '../lib/api';

interface RequestDetail {
  id: string; type: string; status: string; justification: string; intendedUsers?: number;
  desiredAt?: string; featureDescription?: string; submittedAt: string; slaDueAt: string;
  account: { displayName: string; email: string }; installation: { installationId: string; label?: string };
  plugin?: { id: string; name: string; isPaid: boolean }; assignedOperator?: { id: string; displayName: string };
  decisions: Array<{ id: string; decision: string; publicMessage?: string; internalReason?: string; createdAt: string; operator: { displayName: string } }>;
  messages: Array<{ id: string; visibility: string; body: string; createdAt: string }>;
}

export default function PluginRequestDetail({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<RequestDetail | null>(null); const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [internalReason, setInternalReason] = useState(''); const [publicMessage, setPublicMessage] = useState('');
  const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(async () => { const [detail, me] = await Promise.all([platformJson<RequestDetail>(`plugin-requests/${requestId}`), platformJson<OperatorProfile>('me')]); setRequest(detail); setProfile(me); }, [requestId]);
  useEffect(() => { load().catch(cause => setMessage(cause instanceof Error ? cause.message : 'Could not load request')); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (internalReason.trim().length < 3) return setMessage('Enter an internal decision reason.');
    setBusy(action); setMessage('');
    try {
      await platformJson(`plugin-requests/${requestId}/${action}`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), internalReason, ...(publicMessage.trim() ? { publicMessage } : {}), ...extra }) });
      setInternalReason(''); setPublicMessage(''); setMessage('Action recorded.'); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Action failed'); }
    finally { setBusy(''); }
  }

  if (!request) return <p className="text-sm text-slate-500">{message || 'Loading…'}</p>;
  const canReview = profile?.permissions.includes('plugin_requests.review');
  const canFulfill = profile?.permissions.includes('schools.entitlements.manage') && request.status === 'APPROVED';
  return <div className="space-y-5">
    <div><h1 className="text-xl font-bold">{request.plugin?.name || 'Feature request'}</h1><p className="text-sm text-slate-500">{request.type.toLowerCase().replaceAll('_', ' ')} · {request.status.toLowerCase().replaceAll('_', ' ')}</p></div>
    {message && <p role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{message}</p>}
    <section className="pa-card grid gap-4 sm:grid-cols-2"><div><div className="text-xs uppercase text-slate-500">School</div><div>{request.installation.label || request.installation.installationId}</div></div><div><div className="text-xs uppercase text-slate-500">Customer</div><div>{request.account.displayName} · {request.account.email}</div></div><div className="sm:col-span-2"><div className="text-xs uppercase text-slate-500">Justification</div><p className="whitespace-pre-wrap">{request.justification}</p></div>{request.featureDescription && <div className="sm:col-span-2"><div className="text-xs uppercase text-slate-500">Requested feature</div><p>{request.featureDescription}</p></div>}<div><div className="text-xs uppercase text-slate-500">Assigned</div><div>{request.assignedOperator?.displayName || 'Unassigned'}</div></div><div><div className="text-xs uppercase text-slate-500">SLA due</div><div>{new Date(request.slaDueAt).toLocaleString()}</div></div></section>
    {(canReview || canFulfill) && <section className="pa-card space-y-3"><h2 className="font-semibold">Record decision</h2><label className="block text-xs font-medium">Internal reason<textarea className="pa-input mt-1 min-h-20" value={internalReason} onChange={event => setInternalReason(event.target.value)} /></label><label className="block text-xs font-medium">Customer-visible message<textarea className="pa-input mt-1 min-h-20" value={publicMessage} onChange={event => setPublicMessage(event.target.value)} /></label><div className="flex flex-wrap gap-2">{canReview && <><button className="pa-btn-secondary" disabled={!!busy} onClick={() => act('assign', { operatorId: profile!.operator.id })}>Assign to me</button><button className="pa-btn-secondary" disabled={!!busy} onClick={() => act('start-review')}>Start review</button><button className="pa-btn-secondary" disabled={!!busy} onClick={() => act('request-information')}>Request information</button><button className="pa-btn-primary" disabled={!!busy} onClick={() => act('approve')}>Approve</button><button className="pa-btn-secondary text-red-700" disabled={!!busy} onClick={() => act('reject')}>Reject</button></>}{canFulfill && <button className="pa-btn-primary" disabled={!!busy} onClick={() => act('fulfill')}>{request.type === 'PURCHASE_ASSISTANCE' ? 'Create purchase order' : 'Issue entitlement'}</button>}</div></section>}
    <section className="pa-card"><h2 className="font-semibold">Decision timeline</h2><div className="mt-3 space-y-3">{request.decisions.length ? request.decisions.map(item => <div key={item.id} className="border-l-2 border-slate-200 pl-3 text-sm"><div className="font-medium">{item.decision.toLowerCase().replaceAll('_', ' ')}</div><div className="text-xs text-slate-500">{item.operator.displayName} · {new Date(item.createdAt).toLocaleString()}</div>{item.publicMessage && <p className="mt-1">Customer: {item.publicMessage}</p>}<p className="mt-1 text-slate-600">Internal: {item.internalReason}</p></div>) : <p className="text-sm text-slate-500">No decisions yet.</p>}</div></section>
  </div>;
}
