'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

type InvoiceLine = { id: string; kind: string; description: string; quantity: number; amountMinor: number };
type Invoice = { id: string; invoiceNumber: string; status: string; currency: string; amountMinor: number; paidMinor: number; description: string; issuedAt: string; dueAt: string; paidAt?: string | null; lines?: InvoiceLine[] };
type Notice = { id: string; subject: string; message: string; createdAt: string; type: string };
type BillingState = {
  access: string; reason?: string | null; lastVerifiedAt?: string | null; lastAttemptAt?: string | null; lastError?: string | null;
  warnings: Array<{ invoiceId: string; invoiceNumber: string; currency: string; outstandingMinor: number; suspendAt: string }>;
  billing: { schoolName?: string; currency?: string; outstandingMinor?: number; billingPlan?: { name: string; amountMinor: number; currency: string; billingInterval: string }; invoices?: Invoice[]; notifications?: Notice[] };
};

/** How often the panel re-reads this school's synced billing state. Cheap: it is a read of the
 *  school's own database. Reaching the marketplace is still the hourly sync, or Sync now. */
const REFRESH_MS = 60_000;

export function money(amountMinor = 0, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
}

/**
 * The school's platform subscription bill, as last synchronised from the marketplace.
 *
 * Shared by the standalone Platform Billing page and the Licensing page so the two can never show
 * different numbers. The standalone page stays: it is open to ADMIN as well as SUPER_ADMIN, and it
 * is where lib/api.ts sends every 402 while a school is suspended -- Licensing's own requests are
 * blocked in that state, so it cannot be the recovery surface.
 *
 * "Live" means it re-reads every minute and whenever the tab regains focus. A background refresh
 * that fails keeps the last good figures on screen and says they may be stale, rather than
 * replacing a correct balance with an error.
 */
export default function PlatformBillingPanel({ variant = 'page' }: { variant?: 'page' | 'section' }) {
  // null = still loading; 'unsynced' = this school has never completed a marketplace sync.
  const [state, setState] = useState<BillingState | 'unsynced' | null>(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const hasState = useRef(false);
  const markedRead = useRef(false);

  const load = useCallback(async () => {
    const response = await apiFetch('/api/admin/marketplace/billing-control');
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || `Could not load platform billing (${response.status})`);
    // With no synced row the endpoint returns an empty body. Reading warnings.length off that is
    // what used to crash this view for a school that had not synced yet.
    setState(body && typeof body === 'object' && 'access' in body ? body as BillingState : 'unsynced');
    hasState.current = true; setError(''); setStale(false); setRefreshedAt(new Date());
    // Seeing the notices is what clears the sidebar badge -- once per visit, not every refresh.
    if (!markedRead.current) {
      markedRead.current = true;
      apiFetch('/api/admin/marketplace/billing-control/mark-read', { method: 'POST' }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => load().catch((cause: Error) => {
      if (!active) return;
      if (hasState.current) setStale(true); else setError(cause.message);
    });
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

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

  const syncButton = <button className={variant === 'section' ? 'btn btn-secondary' : 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'} disabled={busy} onClick={sync}>{busy ? 'Synchronizing…' : 'Sync now'}</button>;
  const freshness = <p className="text-xs text-slate-500">{refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString()} · refreshes every minute` : ''}{stale ? ' · last refresh failed, figures may be out of date' : ''}</p>;

  if (error && !hasState.current) {
    return <Frame variant={variant} actions={syncButton}><div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div></Frame>;
  }
  if (state === null) return <Frame variant={variant} actions={syncButton}><p className="text-sm text-slate-500">Loading billing status…</p></Frame>;
  if (state === 'unsynced') {
    return <Frame variant={variant} actions={syncButton}><p className="text-sm text-slate-600">This school has not synchronised with the marketplace yet, so there is no subscription bill to show. Sync now to fetch it.</p>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</Frame>;
  }

  const invoices = state.billing?.invoices || [];
  const notices = state.billing?.notifications || [];
  const warnings = state.warnings || [];
  const currency = state.billing?.currency || invoices[0]?.currency || 'USD';
  const outstanding = state.billing?.outstandingMinor || 0;
  // "overdue" is derived here: the marketplace keeps an unpaid invoice ISSUED past its due date.
  const isOpen = (invoice: Invoice) => invoice.status !== 'PAID' && invoice.status !== 'VOID' && invoice.amountMinor > invoice.paidMinor;
  const isOverdue = (invoice: Invoice) => isOpen(invoice) && new Date(invoice.dueAt).getTime() < Date.now();
  const nextDue = invoices.filter(isOpen).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
  // The same four tiers as the dashboard banner. Green is kept for "nothing owed": an open bill
  // used to show green "Account active" beside a balance, which reads as paid.
  const standing = state.access === 'SUSPENDED' ? 'suspended' : warnings.length ? 'final' : outstanding > 0 ? 'due' : 'clear';
  // Only a billing suspension lifts itself when the invoice is paid. One an operator imposed on the
  // school does not, and telling that school to pay would send it the wrong way.
  const billingSuspension = standing === 'suspended' && warnings.length > 0;
  const tone = { suspended: 'border-red-300 bg-red-50', final: 'border-amber-300 bg-amber-50', due: 'border-indigo-200 bg-indigo-50', clear: 'border-emerald-300 bg-emerald-50' }[standing];
  const title = { suspended: 'School access suspended', final: 'Final payment notice', due: 'Payment due', clear: 'Account active' }[standing];
  const summary = {
    suspended: state.reason || 'School access is suspended.',
    final: 'Pay the overdue balance before the suspension date below, or the school will be locked out.',
    due: nextDue ? `${isOverdue(nextDue) ? 'Overdue since' : 'Next payment due'} ${new Date(nextDue.dueAt).toLocaleDateString()}.` : 'An invoice is open on this subscription.',
    clear: 'Nothing is owed on the platform subscription.',
  }[standing];
  // h2 directly under the standalone page's h1; h3 inside Licensing, under the card's own h2.
  const StatusHeading = variant === 'section' ? 'h3' : 'h2';

  const status = <div className={`rounded-2xl border p-5 ${tone}`}><div className="flex flex-wrap justify-between gap-3"><div><StatusHeading className="font-bold">{title}</StatusHeading><p className="mt-1 text-sm">{summary}</p>{warnings.map(warning => <p key={warning.invoiceId} className="mt-2 text-sm font-semibold">Invoice {warning.invoiceNumber}: {money(warning.outstandingMinor, warning.currency)} outstanding{standing === 'final' ? ` · suspension on ${new Date(warning.suspendAt).toLocaleString()}` : ''}</p>)}{billingSuspension && <p className="mt-3 text-sm">To restore access, pay the balance and submit the bank or payment reference in your <Link className="font-semibold underline" href="/marketplace">marketplace account</Link>. Access returns automatically once Wattanam finance approves the payment; press Sync now to check.</p>}{standing === 'suspended' && !billingSuspension && <p className="mt-3 text-sm">This suspension was not caused by an unpaid invoice. Contact Wattanam support to restore access.</p>}</div><div className="text-right"><div className="text-xs uppercase text-slate-500">Outstanding</div><div className="text-xl font-bold">{money(state.billing?.outstandingMinor, currency)}</div></div></div>{state.lastVerifiedAt && <p className="mt-3 text-xs text-slate-500">Verified with the marketplace {new Date(state.lastVerifiedAt).toLocaleString()}</p>}{state.lastError && <p className="mt-2 text-sm text-red-700">Last sync error: {state.lastError}</p>}</div>;

  const plan = state.billing?.billingPlan
    ? <p>{state.billing.billingPlan.name} · {money(state.billing.billingPlan.amountMinor, state.billing.billingPlan.currency)} / {state.billing.billingPlan.billingInterval.toLowerCase()}</p>
    : <p className="text-sm text-slate-500">No central billing plan assigned.</p>;

  const invoiceTable = invoices.length === 0 ? <p className="text-sm text-slate-500">No open invoices.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Invoice</th><th>Description</th><th>Due</th><th>Status</th><th className="text-right">Balance</th></tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 font-mono font-semibold">{invoice.invoiceNumber}</td><td>{(invoice.lines?.length || 0) > 1
      // Several lines: they are the description. The headline alone ("Standard (monthly)") read
      // as the whole bill beside a balance that also carried a plugin.
      ? <ul className="space-y-0.5">{invoice.lines!.map(line => <li key={line.id}>{line.description}{line.quantity > 1 ? ` × ${line.quantity}` : ''} <span className="text-slate-500">— {money(line.amountMinor, invoice.currency)}</span></li>)}</ul>
      : invoice.description}</td><td>{new Date(invoice.dueAt).toLocaleDateString()}</td><td>{isOverdue(invoice) ? <span className="font-semibold text-red-700">overdue</span> : invoice.status.toLowerCase().replaceAll('_', ' ')}</td><td className="text-right font-semibold">{money(invoice.amountMinor - invoice.paidMinor, invoice.currency)}</td></tr>)}</tbody></table></div>;

  const shownNotices = variant === 'section' ? notices.slice(0, 3) : notices;
  const noticeList = notices.length === 0 ? <p className="text-sm text-slate-500">No billing notifications.</p> : <div className="space-y-2">{shownNotices.map(notice => <article key={notice.id} className="rounded-xl border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{notice.subject}</strong><time className="text-xs text-slate-500">{new Date(notice.createdAt).toLocaleString()}</time></div><p className="mt-1 text-slate-700">{notice.message}</p></article>)}{shownNotices.length < notices.length && <Link className="text-sm font-semibold text-indigo-700" href="/admin/platform-billing">All {notices.length} billing notifications →</Link>}</div>;

  if (variant === 'section') {
    return <Frame variant="section" actions={<><Link className="btn btn-secondary" href="/admin/platform-billing">Full billing page</Link>{syncButton}</>}>
      {status}
      <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-700">Plan</h3><div className="mt-2">{plan}</div></div>
      <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-700">Invoices</h3><div className="mt-2">{invoiceTable}</div></div>
      <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-700">Recent billing notifications</h3><div className="mt-2">{noticeList}</div></div>
      <div className="mt-4">{freshness}</div>
    </Frame>;
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">{freshness}{syncButton}</div>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</div>}
    {status}
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Plan</h2><div className="mt-2">{plan}</div></section>
    <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Invoices</h2><button className="text-sm font-semibold text-indigo-700 print:hidden" onClick={() => window.print()}>Print / save PDF</button></div><div className="mt-3">{invoiceTable}</div></section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Billing notifications</h2><div className="mt-3">{noticeList}</div></section>
  </div>;
}

/** The section variant is one Licensing-style card; the page variant lays its blocks out itself. */
function Frame({ variant, actions, children }: { variant: 'page' | 'section'; actions: React.ReactNode; children: React.ReactNode }) {
  if (variant === 'page') return <div className="space-y-5"><div className="flex justify-end print:hidden">{actions}</div>{children}</div>;
  return <section id="platform-billing" className="card p-6" aria-labelledby="platform-billing-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="platform-billing-title" className="font-semibold text-slate-800">Platform subscription</h2>
        <p className="mt-1 text-sm text-slate-500">What this school owes Wattanam for the platform itself — separate from the plugin licences below, and from student fees.</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
    <div className="mt-5">{children}</div>
  </section>;
}
