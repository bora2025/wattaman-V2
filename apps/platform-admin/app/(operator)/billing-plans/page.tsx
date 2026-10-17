'use client';

import { FormEvent, useEffect, useState } from 'react';
import { OperatorProfile, platformJson } from '../../../lib/api';
import PaymentMethodsSection from '../../../components/PaymentMethodsSection';

type Plan = { id: string; slug: string; name: string; currency: string; amountMinor: number; billingInterval: 'MONTHLY' | 'ANNUAL'; dueDays: number; active: boolean };
type PlanForm = { slug: string; name: string; currency: string; amount: string; billingInterval: 'MONTHLY' | 'ANNUAL'; dueDays: string; reason: string };
const empty: PlanForm = { slug: '', name: '', currency: 'USD', amount: '', billingInterval: 'MONTHLY', dueDays: '14', reason: '' };

export default function BillingPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState('');
  const [canManage, setCanManage] = useState(false);
  const load = () => platformJson<Plan[]>('school-billing-plans').then(setPlans);

  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  useEffect(() => { platformJson<OperatorProfile>('me').then(profile => setCanManage(profile.permissions.includes('school_billing.manage'))).catch(() => undefined); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setMessage('');
    try {
      await platformJson('school-billing-plans', { method: 'POST', body: JSON.stringify({ slug: form.slug, name: form.name, currency: form.currency.toUpperCase(), amountMinor: Math.round(Number(form.amount) * 100), billingInterval: form.billingInterval, dueDays: Number(form.dueDays), active: true, internalReason: form.reason }) });
      setForm(empty); setMessage('Billing plan created.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create plan'); }
  }

  async function toggle(plan: Plan) {
    const reason = window.prompt(`Reason to ${plan.active ? 'archive' : 'reactivate'} ${plan.name}`);
    if (!reason) return;
    try { await platformJson(`school-billing-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ active: !plan.active, internalReason: reason }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update plan'); }
  }

  async function edit(plan: Plan) {
    const name = window.prompt('Plan name', plan.name);
    const amount = window.prompt(`Price in ${plan.currency}`, (plan.amountMinor / 100).toFixed(2));
    const dueDays = window.prompt('Payment due days', String(plan.dueDays));
    const interval = window.prompt('Billing interval: MONTHLY or ANNUAL', plan.billingInterval)?.toUpperCase();
    if (!name || !amount || !dueDays) return;
    if (interval !== 'MONTHLY' && interval !== 'ANNUAL') { setMessage('Billing interval must be MONTHLY or ANNUAL.'); return; }
    const reason = window.prompt(`Internal reason for editing ${plan.name}`);
    if (!reason || reason.trim().length < 3) return;
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) { setMessage('Price must be positive.'); return; }
    try {
      await platformJson(`school-billing-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ name, amountMinor, dueDays: Number(dueDays), billingInterval: interval, internalReason: reason }) });
      setMessage('Billing plan updated. Existing invoices were not changed.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update plan'); }
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Delete unused billing plan "${plan.name}"? Assigned plans and plans with invoice history cannot be deleted.`)) return;
    const reason = window.prompt(`Internal reason for deleting ${plan.name}`);
    if (!reason || reason.trim().length < 3) return;
    try {
      await platformJson(`school-billing-plans/${plan.id}/delete`, { method: 'POST', body: JSON.stringify({ internalReason: reason }) });
      setMessage('Unused billing plan deleted.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete plan'); }
  }

  const activePlans = plans.filter(plan => plan.active);
  return <div className="space-y-7">
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Revenue operations</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">School billing plans</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Define recurring platform plans and the verified bank accounts customer schools use for manual payment. Existing invoices always retain their original commercial terms.</p></header>
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    <section className="grid gap-4 sm:grid-cols-3"><Summary label="Active plans" value={activePlans.length} detail={`${plans.length - activePlans.length} archived`} /><Summary label="Billing currencies" value={new Set(activePlans.map(plan => plan.currency)).size} detail={activePlans.map(plan => plan.currency).filter((value, index, values) => values.indexOf(value) === index).join(', ') || 'No currencies'} /><Summary label="Default terms" value={activePlans[0]?.dueDays ?? '—'} detail={activePlans.length ? 'days until payment is due' : 'Create a plan to begin'} /></section>
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="pa-card"><div><h2 className="text-lg font-bold">Plan catalog</h2><p className="mt-1 text-sm text-slate-500">Current and archived subscription offers.</p></div><div className="mt-5 grid gap-3">{plans.map(plan => <article key={plan.id} className={`rounded-2xl border p-4 text-sm ${plan.active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong className="text-base text-slate-900">{plan.name}</strong><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${plan.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{plan.active ? 'Active' : 'Archived'}</span></div><div className="mt-1 font-mono text-xs text-slate-500">{plan.slug}</div></div><div className="text-right"><div className="text-xl font-bold text-slate-950">{new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency }).format(plan.amountMinor / 100)}</div><div className="text-xs text-slate-500">per {plan.billingInterval.toLowerCase()}</div></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">Invoice due in {plan.dueDays} days</span>{canManage && <div className="flex flex-wrap gap-2"><button className="pa-btn-secondary" onClick={() => edit(plan)}>Edit</button><button className="pa-btn-secondary" onClick={() => toggle(plan)}>{plan.active ? 'Archive' : 'Reactivate'}</button>{!plan.active && <button className="pa-btn-secondary text-red-700" onClick={() => remove(plan)}>Delete</button>}</div>}</div></article>)}</div>{plans.length === 0 && <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No plans yet. Create the first plan to enable central school billing.</p>}</section>
      {canManage && <form className="pa-card h-fit grid gap-4 md:grid-cols-2 xl:grid-cols-1" onSubmit={create}><div className="md:col-span-2 xl:col-span-1"><h2 className="text-lg font-bold">Create billing plan</h2><p className="mt-1 text-sm text-slate-500">New schools can be assigned this plan immediately.</p></div><label className="text-xs font-semibold text-slate-600">Plan slug<input className="pa-input mt-1" placeholder="standard-monthly" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} required /></label><label className="text-xs font-semibold text-slate-600">Display name<input className="pa-input mt-1" placeholder="Standard" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label><div className="grid grid-cols-[.7fr_1.3fr] gap-3 md:col-span-2 xl:col-span-1"><label className="text-xs font-semibold text-slate-600">Currency<input className="pa-input mt-1 uppercase" maxLength={3} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} required /></label><label className="text-xs font-semibold text-slate-600">Price<input className="pa-input mt-1" type="number" min="0.01" step="0.01" placeholder="49.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></label></div><label className="text-xs font-semibold text-slate-600">Billing cycle<select className="pa-input mt-1" value={form.billingInterval} onChange={e => setForm({ ...form, billingInterval: e.target.value as 'MONTHLY' | 'ANNUAL' })}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label><label className="text-xs font-semibold text-slate-600">Payment due<input className="pa-input mt-1" type="number" min="1" max="90" value={form.dueDays} onChange={e => setForm({ ...form, dueDays: e.target.value })} required /></label><label className="text-xs font-semibold text-slate-600 md:col-span-2 xl:col-span-1">Internal reason<textarea className="pa-input mt-1 min-h-20" minLength={3} placeholder="Reason recorded in audit log" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></label><button className="pa-btn-primary md:col-span-2 xl:col-span-1">Create billing plan</button></form>}
    </div>
    <PaymentMethodsSection canManage={canManage} />
  </div>;
}

function Summary({ label, value, detail }: { label: string; value: number | string; detail: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold tabular-nums text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>; }
