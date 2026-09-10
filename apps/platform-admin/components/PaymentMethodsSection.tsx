'use client';

import { FormEvent, useEffect, useState } from 'react';
import { platformJson } from '../lib/api';
import { imageFileToDataUrl } from '../lib/image-upload';

type PaymentMethod = {
  id: string; label: string; bankName: string; accountName: string; accountNumber: string; currency: string;
  qrImage: string | null; instructions: string | null; active: boolean; position: number;
};
const blank = { label: '', bankName: '', accountName: '', accountNumber: '', currency: 'USD', instructions: '', qrImage: '', reason: '' };
/** Matches the API's MAX_QR_IMAGE_BYTES. */
const MAX_QR_BYTES = 120 * 1024;

/**
 * Where customer schools send money: bank accounts, each with the QR code its bank issued. A school
 * sees the active accounts in its own billing currency beside every open invoice.
 *
 * Changing one redirects payments, so every change needs a reason and is audited -- a replaced QR
 * code included, by hash. Accounts are archived rather than deleted, because past payment
 * submissions name the account they went into.
 */
export default function PaymentMethodsSection({ canManage }: { canManage: boolean }) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => platformJson<PaymentMethod[]>('school-payment-methods').then(setMethods);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function pickQr(file?: File) {
    if (!file) return;
    try {
      const qrImage = await imageFileToDataUrl(file, { maxDimension: 600, maxBytes: MAX_QR_BYTES, preferPng: true });
      setForm((current) => ({ ...current, qrImage }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read that image'); }
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setMessage(''); setBusy(true);
    try {
      await platformJson('school-payment-methods', { method: 'POST', body: JSON.stringify({
        label: form.label, bankName: form.bankName, accountName: form.accountName, accountNumber: form.accountNumber,
        currency: form.currency.toUpperCase(),
        ...(form.instructions.trim() ? { instructions: form.instructions.trim() } : {}),
        ...(form.qrImage ? { qrImage: form.qrImage } : {}),
        internalReason: form.reason,
      }) });
      setForm(blank);
      setMessage('Payment account added. Schools billed in this currency now see it beside their invoices.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add the payment account'); }
    finally { setBusy(false); }
  }

  async function toggle(method: PaymentMethod) {
    const reason = window.prompt(`Reason to ${method.active ? 'archive' : 'reactivate'} ${method.label}`);
    if (!reason) return;
    try {
      await platformJson(`school-payment-methods/${method.id}`, { method: 'PATCH', body: JSON.stringify({ active: !method.active, internalReason: reason }) });
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update the payment account'); }
  }

  return (
    <section className="pa-card space-y-4" aria-labelledby="payment-accounts-title">
      <div>
        <h2 id="payment-accounts-title" className="font-semibold">Payment accounts</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bank accounts customer schools pay into, with the QR code each bank issued. A school sees the active accounts in its
          own billing currency beside every open invoice, and names the one it used when it submits a payment for you to confirm.
        </p>
      </div>
      {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
      {methods.length === 0
        ? <p className="text-sm text-slate-500">No payment accounts yet. Until one exists, schools are shown no bank details and have to ask how to pay.</p>
        : <div className="grid gap-3 md:grid-cols-2">{methods.map((method) => (
          <article key={method.id} className={`flex gap-4 rounded-lg border p-3 text-sm ${method.active ? '' : 'opacity-60'}`}>
            {method.qrImage
              ? <img src={method.qrImage} alt={`QR code for ${method.label}`} className="h-28 w-28 shrink-0 rounded border bg-white object-contain" />
              : <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded border border-dashed text-xs text-slate-400">No QR code</div>}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{method.label}</strong>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{method.currency}</span>
                {!method.active && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">archived</span>}
              </div>
              <div className="mt-1 text-slate-600">{method.bankName} · {method.accountName}</div>
              <div className="font-mono">{method.accountNumber}</div>
              {method.instructions && <p className="mt-1 text-xs text-slate-500">{method.instructions}</p>}
              {canManage && <button className="pa-btn-secondary mt-2" onClick={() => toggle(method)}>{method.active ? 'Archive' : 'Reactivate'}</button>}
            </div>
          </article>
        ))}</div>}
      {canManage && (
        <form className="grid gap-3 border-t pt-4 md:grid-cols-2" onSubmit={create}>
          <h3 className="font-semibold md:col-span-2">Add payment account</h3>
          <input className="pa-input" aria-label="Label" placeholder="Label, e.g. ABA Bank (USD)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required minLength={2} />
          <input className="pa-input" aria-label="Bank name" placeholder="Bank name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required minLength={2} />
          <input className="pa-input" aria-label="Account name" placeholder="Account name" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} required minLength={2} />
          <input className="pa-input font-mono" aria-label="Account number" placeholder="Account number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required pattern="[0-9A-Za-z][0-9A-Za-z \-]{3,39}" />
          <input className="pa-input" aria-label="Currency" placeholder="Currency" maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} required />
          <label className="pa-input flex cursor-pointer items-center gap-3">
            <span className="text-sm text-slate-600">{form.qrImage ? 'QR code ready — choose again to replace' : 'Bank QR code image (optional)'}</span>
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { pickQr(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {form.qrImage && <img src={form.qrImage} alt="QR code preview" className="h-32 w-32 rounded border bg-white object-contain md:col-span-2" />}
          <textarea className="pa-input md:col-span-2" aria-label="Instructions for payers" placeholder="Instructions for payers (optional), e.g. put the invoice number in the transfer remark" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} maxLength={1000} />
          <textarea className="pa-input md:col-span-2" aria-label="Internal reason" minLength={3} placeholder="Required internal reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          <button className="pa-btn-primary md:col-span-2" disabled={busy}>{busy ? 'Adding…' : 'Add payment account'}</button>
        </form>
      )}
    </section>
  );
}
