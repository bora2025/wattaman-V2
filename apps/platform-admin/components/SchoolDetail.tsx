'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OperatorProfile, platformJson } from '../lib/api';

interface School {
  id: string; name: string; slug: string; status: string; region: string | null; timezone: string | null;
  locale: string | null; currency: string | null; plan: string | null; contactName: string | null;
  contactEmail: string | null; railwayProjectId: string | null; gatewayOrigin: string | null; notes: string | null;
  installation: { id: string; installationId: string; label: string | null; lastSeenAt: string | null; account: { id: string; displayName: string; email: string | null; mfaEnabled: boolean; locked: boolean; recoveryCodesRemaining: number } | null } | null;
  enrollmentTokens: Array<{ id: string; createdAt: string; expiresAt: string; consumedAt: string | null; revokedAt: string | null }>;
  domains: Array<{ id: string; hostname: string; isPrimary: boolean; verifiedAt: string | null; createdAt: string }>;
}

interface Usage { measuredAt: string; source: string; lastSeenAt: string | null; counts: { entitlements: number; orders: number; downloads: number; pluginRequests: number } }
interface SchoolPlugins {
  schoolId: string; installationId: string | null; lastSeenAt: string | null; measuredAt: string;
  summary: { licensed: number; active: number; expired: number; revoked: number; downloaded: number };
  items: Array<{
    plugin: { id: string; name: string; description: string; isPaid: boolean; status: string };
    entitlement: { id: string; status: string; effectiveStatus: string; expiresAt: string | null; updatesThrough: string | null; offlineUntil: string | null; revokedAt: string | null; revokedReason: string | null; createdAt: string; updatedAt: string };
    activity: { downloadCount: number; lastDownloadedAt: string; lastDownloadedVersion: string; channel: string } | null;
  }>;
}
interface Plan { id: string; slug: string; name: string; currency: string; amountMinor: number; billingInterval: string; dueDays: number; active: boolean }
interface InvoiceLine { id: string; position: number; kind: string; description: string; quantity: number; unitAmountMinor: number; amountMinor: number; periodStart?: string | null; periodEnd?: string | null }
interface Billing { schoolCurrency: string | null; billingPlan: Plan | null; billingAnchorAt: string | null; outstandingMinor: number; invoices: Array<{ id: string; invoiceNumber: string; status: string; currency: string; amountMinor: number; paidMinor: number; description: string; dueAt: string; issuedAt: string; lines?: InvoiceLine[]; payments: Array<{ id: string; provider: string; providerReference: string; amountMinor: number; receivedAt: string }>; paymentSubmissions: Array<{ id: string; provider: string; providerReference: string; amountMinor: number; note?: string; status: string; createdAt: string; rejectionReason?: string; paymentMethod?: { label: string; bankName: string; accountNumber: string; currency: string } | null; receiptImage?: string | null; source?: string; submittedBy?: string | null }> }>; notifications: Array<{ id: string; type: string; status: string; subject: string; recipientEmail: string | null; createdAt: string; failureMessage: string | null }> }

export default function SchoolDetail({ schoolId, notice }: { schoolId: string; notice?: 'account-approved' | 'enrollment-required' | 'adopted' }) {
  const router = useRouter();
  const [school, setSchool] = useState<School | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canReadBilling, setCanReadBilling] = useState(false);
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [reason, setReason] = useState('Provision new customer school installation');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [schoolPlugins, setSchoolPlugins] = useState<SchoolPlugins | null>(null);
  const [hostname, setHostname] = useState('');
  const [billing, setBilling] = useState<Billing | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('Platform subscription');
  const [invoiceDue, setInvoiceDue] = useState('');
  const [anchorDate, setAnchorDate] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const load = useCallback(() => platformJson<School>(`schools/${encodeURIComponent(schoolId)}`).then(setSchool).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load school')), [schoolId]);

  useEffect(() => {
    load();
    platformJson<Usage>(`schools/${encodeURIComponent(schoolId)}/usage`).then(setUsage).catch(() => undefined);
    platformJson<SchoolPlugins>(`schools/${encodeURIComponent(schoolId)}/plugins`).then(setSchoolPlugins).catch(() => undefined);
    platformJson<OperatorProfile>('me').then(profile => {
      setCanManage(profile.permissions.includes('schools.manage'));
      setCanReadBilling(profile.permissions.includes('school_billing.read'));
      setCanManageBilling(profile.permissions.includes('school_billing.manage'));
    }).catch(() => undefined);
  }, [load, schoolId]);

  useEffect(() => { if (canReadBilling) { platformJson<Billing>(`schools/${encodeURIComponent(schoolId)}/billing`).then(value => { setBilling(value); setSelectedPlanId(value.billingPlan?.id || ''); }).catch(() => undefined); platformJson<Plan[]>('school-billing-plans').then(setPlans).catch(() => undefined); } }, [canReadBilling, schoolId]);

  async function mutate(path: string, body: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await platformJson(`schools/${schoolId}/${path}`, { method: 'POST', body: JSON.stringify(body) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Operation failed'); }
    finally { setBusy(false); }
  }

  async function addDomain(event: React.FormEvent) {
    event.preventDefault();
    await mutate('domains', { hostname, isPrimary: school?.domains.length === 0, internalReason: reason });
    setHostname('');
  }

  async function issueInvoice(event: React.FormEvent) {
    event.preventDefault();
    const amountMinor = Math.round(Number(invoiceAmount) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) { setError('Invoice amount must be positive'); return; }
    setBusy(true); setError('');
    try {
      await platformJson(`schools/${schoolId}/invoices`, { method: 'POST', body: JSON.stringify({
        currency: school?.currency || 'USD', amountMinor, description: invoiceDescription,
        dueAt: new Date(`${invoiceDue}T23:59:59.000Z`).toISOString(), idempotencyKey: crypto.randomUUID(), internalReason: reason,
      }) });
      setInvoiceAmount('');
      setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not issue invoice'); }
    finally { setBusy(false); }
  }

  async function recordPayment(invoice: Billing['invoices'][number]) {
    const amountText = window.prompt(`Payment amount in ${invoice.currency}`, ((invoice.amountMinor - invoice.paidMinor) / 100).toFixed(2));
    if (!amountText) return;
    const providerReference = window.prompt('Bank/payment reference');
    if (!providerReference) return;
    const amountMinor = Math.round(Number(amountText) * 100);
    setBusy(true); setError('');
    try {
      await platformJson(`schools/${schoolId}/invoices/${invoice.id}/payments`, { method: 'POST', body: JSON.stringify({
        provider: 'manual', providerReference, amountMinor, receivedAt: new Date().toISOString(), internalReason: reason,
      }) });
      setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record payment'); }
    finally { setBusy(false); }
  }

  async function sendInvoiceNotification(invoice: Billing['invoices'][number]) {
    setBusy(true); setError('');
    try {
      await platformJson(`schools/${schoolId}/invoices/${invoice.id}/notify`, { method: 'POST', body: JSON.stringify({ internalReason: reason }) });
      setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send billing notification'); }
    finally { setBusy(false); }
  }

  async function reviewSubmission(submissionId: string, approve: boolean) {
    const rejectionReason = approve ? undefined : window.prompt('Reason shown to the customer');
    if (!approve && !rejectionReason) return;
    setBusy(true); setError('');
    try {
      await platformJson(`schools/${schoolId}/payment-submissions/${submissionId}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify({ internalReason: reason, ...(rejectionReason ? { rejectionReason } : {}) }) });
      setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not review payment submission'); }
    finally { setBusy(false); }
  }

  async function assignCentralPlan() {
    if (!selectedPlanId) return;
    setBusy(true); setError('');
    try { await platformJson(`schools/${schoolId}/billing-plan`, { method: 'POST', body: JSON.stringify({ planId: selectedPlanId, ...(anchorDate ? { billingAnchorAt: new Date(`${anchorDate}T00:00:00.000Z`).toISOString() } : {}), internalReason: reason }) }); setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`)); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not assign billing plan'); }
    finally { setBusy(false); }
  }

  async function issueCentralPlanInvoice() {
    setBusy(true); setError('');
    try { await platformJson(`schools/${schoolId}/plan-invoices`, { method: 'POST', body: JSON.stringify({ periodStart: new Date().toISOString(), idempotencyKey: crypto.randomUUID(), internalReason: reason }) }); setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create plan invoice'); }
    finally { setBusy(false); }
  }

  async function mintToken() {
    setBusy(true); setError(''); setToken('');
    try {
      const result = await platformJson<{ token: string }>(`schools/${schoolId}/enrollment-tokens`, { method: 'POST', body: JSON.stringify({ lifetimeDays: 7, internalReason: reason }) });
      setToken(result.token); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create enrollment token'); }
    finally { setBusy(false); }
  }

  async function revokeToken(tokenId: string) {
    setBusy(true); setError('');
    try {
      await platformJson(`schools/${schoolId}/enrollment-tokens/${tokenId}/revoke`, { method: 'POST', body: JSON.stringify({ internalReason: reason }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not revoke enrollment token'); }
    finally { setBusy(false); }
  }

  async function copyToken() {
    try { await navigator.clipboard.writeText(token); setCopied(true); }
    catch { setError('Could not copy automatically. Select and copy the token manually.'); }
  }

  async function permanentlyDeleteSchool() {
    if (!school) return;
    const confirmation = window.prompt(`Permanently delete ${school.name}?\n\nThis removes only the unused school directory record. The owner's Marketplace account is preserved and can claim another school. Hosting resources are not deleted.\n\nType the exact slug to continue:\n${school.slug}`);
    if (confirmation === null) return;
    if (confirmation.trim() !== school.slug) { setError('The confirmation slug did not match. Nothing was deleted.'); return; }
    setBusy(true); setError('');
    try {
      await platformJson(`schools/${schoolId}/delete`, { method: 'POST', body: JSON.stringify({ confirmSlug: confirmation.trim(), internalReason: reason }) });
      router.replace('/schools');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not permanently delete school'); }
    finally { setBusy(false); }
  }

  if (error && !school) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!school) return <p className="text-sm text-slate-500">Loading…</p>;
  const liveToken = school.enrollmentTokens.find(item => !item.consumedAt && !item.revokedAt && new Date(item.expiresAt) > new Date());
  const paymentSubmissions = billing?.invoices.flatMap(invoice => (invoice.paymentSubmissions || []).map(submission => ({ invoice, submission }))) || [];

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><Link className="text-sm font-medium text-indigo-700 hover:underline" href="/schools">← Customer schools</Link><p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-indigo-600">School workspace</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{school.name}</h1><p className="mt-1 font-mono text-xs text-slate-500">{school.slug}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${school.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : school.status === 'SUSPENDED' || school.status === 'TERMINATED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{school.status.toLowerCase().replaceAll('_', ' ')}</span>{school.gatewayOrigin && <a className="pa-btn-primary" href={school.gatewayOrigin} target="_blank" rel="noopener noreferrer">Open school ↗</a>}</div></header>
    {paymentSubmissions.length > 0 && <section className="pa-card space-y-3"><div><h2 className="font-semibold">Customer payment submissions</h2><p className="text-xs text-slate-500">Check the named account's bank statement for this reference before confirming. Confirming writes the payment to the ledger.</p></div>{paymentSubmissions.map(({ invoice, submission }) => <article key={submission.id} className="rounded-lg border p-3 text-sm"><strong>{invoice.invoiceNumber}</strong> · {submission.provider} / {submission.providerReference}<div>{(submission.amountMinor / 100).toFixed(2)} {invoice.currency} · {submission.status.toLowerCase()}</div>{submission.source === 'SCHOOL' && <div className="text-xs text-slate-500">Sent from the school's admin panel{submission.submittedBy ? ' by ' + submission.submittedBy : ''}</div>}{submission.paymentMethod && <div className="text-slate-600">Paid into {submission.paymentMethod.label} · <span className="font-mono">{submission.paymentMethod.accountNumber}</span></div>}{submission.note && <p className="text-slate-600">{submission.note}</p>}{submission.receiptImage && <details className="mt-1"><summary className="cursor-pointer text-indigo-700">View receipt</summary><img src={submission.receiptImage} alt={"Transfer receipt for " + invoice.invoiceNumber} className="mt-2 max-h-96 rounded border bg-white object-contain" /></details>}{submission.rejectionReason && <p className="text-red-700">{submission.rejectionReason}</p>}{canManageBilling && submission.status === 'PENDING' && <div className="mt-2 flex gap-2"><button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => reviewSubmission(submission.id, true)}>Confirm received</button><button className="pa-btn-secondary" disabled={busy || reason.trim().length < 3} onClick={() => reviewSubmission(submission.id, false)}>Reject</button></div>}</article>)}</section>}
    {notice === 'enrollment-required' && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">The school gateway was recorded, but it has not registered with this marketplace. Create an enrollment token below, configure it in the school API, and complete signed registration.</p>}
    {notice === 'adopted' && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">The existing school was connected successfully. Confirm the installation identity below.</p>}
    {notice === 'account-approved' && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">The Marketplace account and customer school were created successfully. Generate the one-time enrollment token below, then give it to the school owner to claim this installation.</p>}
    <section className="pa-card space-y-3" aria-labelledby="connection-steps">
      <h2 id="connection-steps" className="font-semibold">Connect this school to the marketplace</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Deploy and install this school in its own isolated hosting project or VPS. Record its public gateway above.</li>
        <li>{school.installation ? <span className="text-emerald-700">Installation registered and claimed.</span> : liveToken ? 'A one-time enrollment token is ready. Enter it in the school’s Licensing page.' : 'Create a one-time enrollment token in the Installation enrollment section below.'}</li>
        <li>In the school admin panel, open <strong>Licensing</strong>, enter the token, and sign in as the marketplace owner with MFA. The school signs its registration; the token alone cannot claim another installation.</li>
        <li>A successful token claim links Plugin Manager to that owner automatically. Use the separate Plugin Manager approval flow only for a legacy installation that was registered without an enrollment token.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        {school.gatewayOrigin && <a className="pa-btn-secondary" href={`${school.gatewayOrigin.replace(/\/$/, '')}/admin/licensing`} target="_blank" rel="noopener noreferrer">Open school Licensing ↗</a>}
        {school.gatewayOrigin && <a className="pa-btn-secondary" href={`${school.gatewayOrigin.replace(/\/$/, '')}/admin/plugins`} target="_blank" rel="noopener noreferrer">Open school Plugin Manager ↗</a>}
      </div>
      {!school.gatewayOrigin && <p className="text-xs text-amber-700">Add the school gateway origin before using the direct school links.</p>}
    </section>
    <section className="pa-card"><dl className="grid gap-4 text-sm md:grid-cols-3">
      <Item label="Lifecycle" value={school.status.toLowerCase().replace('_', ' ')} /><Item label="Contact" value={[school.contactName, school.contactEmail].filter(Boolean).join(' · ') || '—'} /><Item label="Plan" value={school.plan || '—'} />
      <Item label="Region" value={school.region || '—'} /><Item label="Locale / timezone" value={[school.locale, school.timezone].filter(Boolean).join(' · ') || '—'} /><Item label="Currency" value={school.currency || '—'} />
      <Item label="Hosting project" value={school.railwayProjectId || 'Not recorded'} /><Item label="Gateway" value={school.gatewayOrigin || 'Not recorded'} /><Item label="Installation" value={school.installation?.installationId || 'Not claimed'} />
      <Item label="Owner account" value={school.installation?.account?.email || school.installation?.account?.displayName || 'Unowned'} />
      {/* Status only. Enough to see why an owner cannot approve a link; nothing that helps anyone
          sign in as them. Resetting it lives on the customer page, and never reveals a secret. */}
      <Item label="Owner second factor" value={ownerFactor(school)} />
    </dl></section>
    {billing && canManageBilling && billing.invoices.length > 0 && <section className="pa-card flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Customer billing notification</h2><p className="text-sm text-slate-600">Send the latest invoice directly to the customer-school dashboard through its signed marketplace connection.</p></div><button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => sendInvoiceNotification(billing.invoices[0])}>Send latest invoice notification</button></section>}
    {usage && <section className="pa-card space-y-3"><div><h2 className="font-semibold">Marketplace usage</h2><p className="text-xs text-slate-500">Marketplace-observed metadata only; no student or school operational data is read.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(usage.counts).map(([key, value]) => <div className="rounded-lg border p-3" key={key}><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-500">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</div></div>)}</div><p className="text-xs text-slate-500">Last installation contact: {usage.lastSeenAt ? new Date(usage.lastSeenAt).toLocaleString() : 'never'} · measured {new Date(usage.measuredAt).toLocaleString()}</p></section>}
    {schoolPlugins && <section className="pa-card space-y-4" aria-labelledby="school-plugins-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="school-plugins-heading" className="font-semibold">School plugins</h2><p className="text-sm text-slate-600">Licences and package use observed by the marketplace for this school.</p></div>{school.gatewayOrigin && <a className="pa-btn-primary" href={`${school.gatewayOrigin.replace(/\/$/, '')}/admin/plugins`} target="_blank" rel="noopener noreferrer">Manage in school ↗</a>}</div>
      {!schoolPlugins.installationId ? <div className="rounded-xl border border-dashed p-5 text-sm text-slate-600"><strong className="text-slate-900">No installation is connected.</strong><p className="mt-1">Connect the school installation before activating plugins.</p></div> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([['Licensed', schoolPlugins.summary.licensed], ['Active licences', schoolPlugins.summary.active], ['Expired', schoolPlugins.summary.expired], ['Revoked', schoolPlugins.summary.revoked]] as const).map(([label, value]) => <div className="rounded-xl border bg-slate-50 p-3" key={label}><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>)}</div>
        {schoolPlugins.items.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-sm text-slate-600"><strong className="text-slate-900">No plugin licences yet.</strong><p className="mt-1">Use the school Marketplace to activate a free plugin or purchase a paid licence.</p></div> : <div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Plugin</th><th className="px-4 py-3">Licence status</th><th className="px-4 py-3">Validity</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y">{schoolPlugins.items.map(item => <tr key={item.entitlement.id} className="align-top"><td className="px-4 py-4"><div className="font-semibold">{item.plugin.name}</div><div className="font-mono text-xs text-slate-500">{item.plugin.id}</div><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${item.plugin.isPaid ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-700'}`}>{item.plugin.isPaid ? 'Paid' : 'Free'}</span></td><td className="px-4 py-4"><StatusBadge status={item.entitlement.effectiveStatus} />{item.entitlement.revokedReason && <p className="mt-2 max-w-xs text-xs text-red-700">{item.entitlement.revokedReason}</p>}</td><td className="px-4 py-4 text-xs text-slate-600"><div>Licence: {item.entitlement.expiresAt ? new Date(item.entitlement.expiresAt).toLocaleDateString() : 'No expiry'}</div><div>Updates: {item.entitlement.updatesThrough ? new Date(item.entitlement.updatesThrough).toLocaleDateString() : 'Not limited'}</div></td><td className="px-4 py-4">{school.gatewayOrigin ? <a className="text-sm font-semibold text-indigo-700 hover:underline" href={`${school.gatewayOrigin.replace(/\/$/, '')}/admin/plugins`} target="_blank" rel="noopener noreferrer">Open Plugin Manager ↗</a> : <span className="text-xs text-slate-500">Gateway not configured</span>}</td></tr>)}</tbody></table></div>}
        <p className="text-xs text-slate-500">Activation status is managed inside the school. Last school contact: {schoolPlugins.lastSeenAt ? new Date(schoolPlugins.lastSeenAt).toLocaleString() : 'never'}.</p>
      </>}
    </section>}
    {billing && <section className="pa-card space-y-4"><div><h2 className="font-semibold">School billing</h2><p className="text-sm text-slate-600">Central Wattanam pricing and money owed by this school. Separate from student fees and plugin purchases.</p><p className="mt-1 text-lg font-bold">Outstanding: {new Intl.NumberFormat(undefined, { style: 'currency', currency: billing.schoolCurrency || 'USD' }).format(billing.outstandingMinor / 100)}</p>{billing.billingPlan && !billing.billingAnchorAt && <p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">This school has a plan but no billing anniversary, so the recurring run will never invoice it. Assign the plan again with a date to start automatic billing.</p>}{billing.billingAnchorAt && <p className="mt-1 text-xs text-slate-500">Renews on day {new Date(billing.billingAnchorAt).getUTCDate()} of each {billing.billingPlan?.billingInterval.toLowerCase() === 'annual' ? 'year' : 'month'}, from {new Date(billing.billingAnchorAt).toISOString().slice(0, 10)}.</p>}</div>{canManageBilling && <div className="flex flex-wrap gap-2"><select className="pa-input min-w-64" value={selectedPlanId} onChange={event => setSelectedPlanId(event.target.value)}><option value="">Select central price…</option>{plans.filter(plan => plan.active).map(plan => <option key={plan.id} value={plan.id}>{plan.name} — {(plan.amountMinor / 100).toFixed(2)} {plan.currency}/{plan.billingInterval.toLowerCase()}</option>)}</select><input className="pa-input" type="date" aria-label="Billing anniversary" title="Billing anniversary (renewal date). Left blank on a new school, today is used." value={anchorDate} onChange={event => setAnchorDate(event.target.value)} /><button className="pa-btn-secondary" disabled={busy || !selectedPlanId || reason.trim().length < 3} onClick={assignCentralPlan}>Assign plan</button><button className="pa-btn-primary" disabled={busy || !billing.billingPlan || reason.trim().length < 3} onClick={issueCentralPlanInvoice}>Invoice central price</button></div>}{billing.invoices.length === 0 ? <p className="text-sm text-slate-500">No invoices.</p> : <div className="space-y-2">{billing.invoices.map(invoice => <article className="rounded-lg border p-3 text-sm" key={invoice.id}><div className="flex flex-wrap justify-between gap-2"><div><div className="font-mono font-semibold">{invoice.invoiceNumber}</div><div>{invoice.description}</div><div className="text-xs text-slate-500">Due {new Date(invoice.dueAt).toLocaleDateString()} · {invoice.status.toLowerCase().replace('_', ' ')}</div></div><div className="text-right"><div className="font-semibold">{new Intl.NumberFormat(undefined, { style: 'currency', currency: invoice.currency }).format(invoice.amountMinor / 100)}</div><div className="text-xs text-slate-500">Paid {(invoice.paidMinor / 100).toFixed(2)}</div></div></div>{(invoice.lines?.length || 0) > 1 && <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-slate-600">{invoice.lines!.map(line => <li key={line.id} className="flex justify-between gap-3"><span>{line.kind === 'PLUGIN' ? '🧩 ' : ''}{line.description}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</span><span className="font-medium">{new Intl.NumberFormat(undefined, { style: 'currency', currency: invoice.currency }).format(line.amountMinor / 100)}</span></li>)}</ul>}{canManageBilling && invoice.status !== 'PAID' && invoice.status !== 'VOID' && <div className="mt-2 flex gap-2"><button className="pa-btn-secondary" disabled={busy || reason.trim().length < 3} onClick={() => recordPayment(invoice)}>Record payment</button>{invoice.paidMinor === 0 && <button className="pa-btn-secondary" disabled={busy || reason.trim().length < 3} onClick={async () => { await mutate(`invoices/${invoice.id}/void`, { internalReason: reason }); setBilling(await platformJson<Billing>(`schools/${schoolId}/billing`)); }}>Void</button>}</div>}</article>)}</div>}{billing.notifications.length > 0 && <div><h3 className="text-sm font-semibold">Billing alerts</h3><ul className="mt-2 space-y-1 text-xs text-slate-600">{billing.notifications.map(item => <li key={item.id}>{item.subject} · {item.status.toLowerCase()}{item.failureMessage ? ` — ${item.failureMessage}` : ''}</li>)}</ul></div>}{canManageBilling && school.status !== 'TERMINATED' && <form className="grid gap-3 md:grid-cols-4" onSubmit={issueInvoice}><input className="pa-input" inputMode="decimal" placeholder={`One-off amount (${school.currency || 'USD'})`} value={invoiceAmount} onChange={event => setInvoiceAmount(event.target.value)} required /><input className="pa-input md:col-span-2" placeholder="Description" value={invoiceDescription} onChange={event => setInvoiceDescription(event.target.value)} required /><input className="pa-input" type="date" value={invoiceDue} onChange={event => setInvoiceDue(event.target.value)} required /><button className="pa-btn-primary md:col-span-4" disabled={busy || reason.trim().length < 3}>Issue one-off invoice</button></form>}</section>}
    <section className="pa-card space-y-3"><div><h2 className="font-semibold">School domains</h2><p className="text-xs text-slate-500">Record domain ownership here after attaching DNS and TLS to the school gateway.</p></div>{school.domains.length === 0 ? <p className="text-sm text-slate-500">No custom domains recorded.</p> : <ul className="space-y-2">{school.domains.map(domain => <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm" key={domain.id}><div><span className="font-mono">{domain.hostname}</span>{domain.isPrimary && <span className="ml-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">primary</span>}<div className="text-xs text-slate-500">{domain.verifiedAt ? `Verified ${new Date(domain.verifiedAt).toLocaleString()}` : 'Not verified'}</div></div>{canManage && <div className="flex gap-2"><button className="pa-btn-secondary" disabled={busy} onClick={() => mutate(`domains/${domain.id}/verify`, { verified: !domain.verifiedAt, internalReason: reason })}>{domain.verifiedAt ? 'Mark unverified' : 'Mark verified'}</button><button className="pa-btn-secondary" disabled={busy} onClick={() => mutate(`domains/${domain.id}/remove`, { internalReason: reason })}>Remove</button></div>}</li>)}</ul>}{canManage && school.status !== 'TERMINATED' && <form className="flex flex-wrap gap-2" onSubmit={addDomain}><input className="pa-input min-w-64 flex-1" aria-label="Domain hostname" placeholder="portal.school.example" value={hostname} onChange={event => setHostname(event.target.value.toLowerCase().trim())} required /><button className="pa-btn-primary" disabled={busy || reason.trim().length < 3}>Add domain</button></form>}</section>
    {token && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Copy this enrollment token now</h2><p className="mt-1 text-sm text-amber-900">It is displayed only once. Store it in the new school API as its enrollment secret; do not send it through chat or email.</p><code className="mt-3 block break-all rounded-lg bg-white p-3 text-sm">{token}</code><button className="pa-btn-secondary mt-3" type="button" onClick={copyToken}>{copied ? 'Copied' : 'Copy token'}</button></section>}
    {canManage && !school.installation && <section className="pa-card space-y-3"><h2 className="font-semibold">Installation enrollment</h2>{liveToken ? <><p className="text-sm text-amber-700">A live token already exists and expires {new Date(liveToken.expiresAt).toLocaleString()}. Its plaintext cannot be displayed again. Revoke it if it was lost or must be replaced.</p><label className="block text-xs font-medium text-slate-600">Internal reason<textarea className="pa-input mt-1 min-h-20" minLength={3} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="pa-btn-secondary" disabled={busy || reason.trim().length < 3} type="button" onClick={() => revokeToken(liveToken.id)}>{busy ? 'Revoking…' : 'Revoke enrollment token'}</button></> : <><p className="text-sm text-slate-600">Create a seven-day, one-time token after you are ready to deploy this school.</p><label className="block text-xs font-medium text-slate-600">Internal reason<textarea className="pa-input mt-1 min-h-20" minLength={3} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={mintToken}>{busy ? 'Creating…' : 'Create enrollment token'}</button></>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</section>}
    {canManage && <section className="pa-card space-y-3"><h2 className="font-semibold">Lifecycle controls</h2><p className="text-sm text-slate-600">Suspension disables marketplace onboarding while retaining the record. Termination is the guarded soft-delete; Railway resources and school data are not deleted automatically. Permanent deletion is limited to unused, unclaimed schools with no invoice or provisioning history.</p><label className="block text-xs font-medium text-slate-600">Required internal reason<textarea className="pa-input mt-1 min-h-20" minLength={3} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex flex-wrap gap-2">{school.status === 'ACTIVE' && <button className="pa-btn-secondary" disabled={busy || reason.trim().length < 3} onClick={() => mutate('suspend', { internalReason: reason })}>Suspend school</button>}{school.status === 'SUSPENDED' && <button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => mutate('reactivate', { internalReason: reason })}>Reactivate school</button>}{school.status === 'TERMINATED' && <button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => mutate('restore', { internalReason: reason })}>Restore school</button>}{school.status !== 'TERMINATED' && <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || reason.trim().length < 3} onClick={() => { if (window.confirm(`Terminate ${school.name}? This does not delete Railway resources.`)) mutate('terminate', { internalReason: reason }); }}>Terminate (soft delete)</button>}{school.status !== 'TERMINATED' && (school.railwayProjectId || school.gatewayOrigin) && <button className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50" disabled={busy || reason.trim().length < 3} onClick={() => { if (window.confirm(`Confirm that the Railway project for ${school.name} has already been deleted. The school will be archived and its Railway links cleared.`)) mutate('railway-deleted', { internalReason: reason }); }}>Railway project already deleted</button>}{!school.installation && ['PROSPECT', 'AWAITING_CLAIM'].includes(school.status) && <button className="rounded-lg border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50" disabled={busy || reason.trim().length < 3} onClick={permanentlyDeleteSchool}>Permanently delete unused school</button>}</div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</section>}
  </div>;
}

function ownerFactor(school: School): string {
  const account = school.installation?.account;
  if (!account) return '—';
  const base = account.mfaEnabled
    ? `Enabled · ${account.recoveryCodesRemaining} unused recovery ${account.recoveryCodesRemaining === 1 ? 'code' : 'codes'}`
    : 'Not enabled — the owner cannot approve a marketplace link yet';
  return account.locked ? `${base} · locked` : base;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }

function StatusBadge({ status }: { status: string }) {
  const style = status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : status === 'EXPIRED' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{status.toLowerCase().replace('_', ' ')}</span>;
}
