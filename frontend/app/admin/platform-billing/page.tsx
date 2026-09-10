'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { apiFetch } from '../../../lib/api';

type Invoice = { id: string; invoiceNumber: string; status: string; currency: string; amountMinor: number; paidMinor: number; description: string; issuedAt: string; dueAt: string; paidAt?: string | null };
type Notice = { id: string; subject: string; message: string; createdAt: string; type: string };
type BillingState = {
  access: string; reason?: string | null; lastVerifiedAt?: string | null; lastAttemptAt?: string | null; lastError?: string | null;
  warnings: Array<{ invoiceId: string; invoiceNumber: string; currency: string; outstandingMinor: number; suspendAt: string }>;
  billing: { schoolName?: string; currency?: string; outstandingMinor?: number; billingPlan?: { name: string; amountMinor: number; currency: string; billingInterval: string }; invoices?: Invoice[]; notifications?: Notice[] };
};

function money(amountMinor = 0, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
}

export default function PlatformBillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await apiFetch('/api/admin/marketplace/billing-control');
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `Could not load platform billing (${response.status})`);
    setState(body);
  }, []);
  useEffect(() => { load().catch(cause => setError(cause.message)); }, [load]);

  async function sync() {
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/admin/marketplace/billing-control/sync', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Billing synchronization failed');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Billing synchronization failed'); }
    finally { setBusy(false); }
  }

  const invoices = state?.billing?.invoices || [];
  const notices = state?.billing?.notifications || [];
  const currency = state?.billing?.currency || invoices[0]?.currency || 'USD';

  return <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}><div className="min-h-screen bg-slate-50"><Sidebar title="Admin Panel" subtitle="Wattanam" navItems={adminNav} accentColor="indigo" /><main className="p-5 md:ml-72 md:p-8 print:ml-0">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden"><div><h1 className="text-2xl font-bold text-slate-900">Platform billing</h1><p className="mt-1 text-sm text-slate-600">Wattanam service subscription—not student fee accounting.</p></div><div className="flex gap-2"><Link className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold" href="/marketplace">Open marketplace account</Link><button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={sync}>{busy ? 'Synchronizing…' : 'Sync now'}</button></div></header>
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</div>}
      {!state && !error && <p>Loading billing status…</p>}
      {state && <>
        <section className={`rounded-2xl border p-5 ${state.access === 'SUSPENDED' ? 'border-red-300 bg-red-50' : state.warnings.length ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">{state.access === 'SUSPENDED' ? 'School access suspended' : state.warnings.length ? 'Final payment notice' : 'Account active'}</h2><p className="mt-1 text-sm">{state.reason || (state.warnings.length ? 'Pay the overdue balance before the suspension date.' : 'No blocking platform invoice was reported.')}</p></div><div className="text-right"><div className="text-xs uppercase text-slate-500">Outstanding</div><div className="text-xl font-bold">{money(state.billing.outstandingMinor, currency)}</div></div></div>{state.lastVerifiedAt && <p className="mt-3 text-xs text-slate-500">Verified {new Date(state.lastVerifiedAt).toLocaleString()}</p>}{state.lastError && <p className="mt-2 text-sm text-red-700">Last sync error: {state.lastError}</p>}</section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Plan</h2>{state.billing.billingPlan ? <p className="mt-2">{state.billing.billingPlan.name} · {money(state.billing.billingPlan.amountMinor, state.billing.billingPlan.currency)} / {state.billing.billingPlan.billingInterval.toLowerCase()}</p> : <p className="mt-2 text-sm text-slate-500">No central billing plan assigned.</p>}</section>
        <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Invoices</h2><button className="text-sm font-semibold text-indigo-700 print:hidden" onClick={() => window.print()}>Print / save PDF</button></div>{invoices.length === 0 ? <p className="mt-3 text-sm text-slate-500">No open invoices.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Invoice</th><th>Description</th><th>Due</th><th>Status</th><th className="text-right">Balance</th></tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 font-mono font-semibold">{invoice.invoiceNumber}</td><td>{invoice.description}</td><td>{new Date(invoice.dueAt).toLocaleDateString()}</td><td>{invoice.status.toLowerCase().replaceAll('_', ' ')}</td><td className="text-right font-semibold">{money(invoice.amountMinor - invoice.paidMinor, invoice.currency)}</td></tr>)}</tbody></table></div>}</section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Billing notifications</h2>{notices.length === 0 ? <p className="mt-3 text-sm text-slate-500">No billing notifications.</p> : <div className="mt-3 space-y-2">{notices.map(notice => <article key={notice.id} className="rounded-xl border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{notice.subject}</strong><time className="text-xs text-slate-500">{new Date(notice.createdAt).toLocaleString()}</time></div><p className="mt-1 text-slate-700">{notice.message}</p></article>)}</div>}</section>
      </>}
    </div>
  </main></div></AuthGuard>;
}
