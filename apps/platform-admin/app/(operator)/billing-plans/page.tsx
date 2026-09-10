'use client';

import { FormEvent, useEffect, useState } from 'react';
import { OperatorProfile, platformJson } from '../../../lib/api';

type Plan = { id: string; slug: string; name: string; currency: string; amountMinor: number; billingInterval: 'MONTHLY' | 'ANNUAL'; dueDays: number; active: boolean };
type PlanForm = { slug: string; name: string; currency: string; amount: string; billingInterval: 'MONTHLY' | 'ANNUAL'; dueDays: string; reason: string };
const empty: PlanForm = { slug: '', name: '', currency: 'USD', amount: '', billingInterval: 'MONTHLY', dueDays: '14', reason: '' };

export default function BillingPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState('');
  // school_billing.read reaches this page; school_billing.manage is what may change a price. The
  // API authorizes independently either way -- this only stops us offering a form that always 403s.
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

  return <div className="space-y-5"><header><h1 className="text-2xl font-bold">School billing plans</h1><p className="mt-1 text-sm text-slate-600">Central prices for operating a customer school. Existing invoices retain their original amounts.</p></header>{message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}<section className="pa-card"><h2 className="font-semibold">Plans</h2><div className="mt-3 space-y-2">{plans.map(plan => <article key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><strong>{plan.name}</strong> <span className="font-mono text-xs text-slate-500">{plan.slug}</span><div className="text-slate-600">{(plan.amountMinor / 100).toFixed(2)} {plan.currency} / {plan.billingInterval.toLowerCase()} · due in {plan.dueDays} days</div></div>{canManage && <button className="pa-btn-secondary" onClick={() => toggle(plan)}>{plan.active ? 'Archive' : 'Reactivate'}</button>}</article>)}</div>{plans.length === 0 && <p className="mt-3 text-sm text-slate-500">No plans yet. A school cannot be invoiced its central price until one exists.</p>}</section>{canManage && <form className="pa-card grid gap-3 md:grid-cols-2" onSubmit={create}><h2 className="font-semibold md:col-span-2">Create plan</h2><input className="pa-input" placeholder="Plan slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} required /><input className="pa-input" placeholder="Display name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /><input className="pa-input" placeholder="Currency" maxLength={3} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} required /><input className="pa-input" type="number" min="0.01" step="0.01" placeholder="Price" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /><select className="pa-input" value={form.billingInterval} onChange={e => setForm({ ...form, billingInterval: e.target.value as 'MONTHLY' | 'ANNUAL' })}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select><input className="pa-input" type="number" min="1" max="90" value={form.dueDays} onChange={e => setForm({ ...form, dueDays: e.target.value })} required /><textarea className="pa-input md:col-span-2" minLength={3} placeholder="Required internal reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /><button className="pa-btn-primary md:col-span-2">Create billing plan</button></form>}</div>;
}
