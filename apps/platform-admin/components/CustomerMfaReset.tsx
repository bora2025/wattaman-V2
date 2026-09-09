'use client';

import { useEffect, useState } from 'react';
import { OperatorProfile, platformJson } from '../lib/api';

interface Customer {
  id: string;
  mfaEnabled: boolean;
  lockedUntil: string | null;
  recoveryCodesRemaining: number;
}

interface ResetResult {
  recoveryCodesDestroyed: number;
  sessionsRevoked: number;
}

/**
 * Restores a locked-out customer's access without handing the operator their identity.
 *
 * The operator clears the second factor; the account owner enrols the replacement and is the only
 * party who ever sees the new secret and recovery codes. That boundary is what keeps the customer's
 * approval of a school link meaningful — an operator able to produce that factor could approve, in
 * the customer's name, a school's permission to create paid orders.
 */
export default function CustomerMfaReset({ accountId }: { accountId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);

  async function load() {
    try { setCustomer(await platformJson<Customer>(`customers/${encodeURIComponent(accountId)}`)); }
    catch { /* the record inspector above already reports a failed load */ }
  }

  useEffect(() => {
    load();
    platformJson<OperatorProfile>('me')
      .then(profile => setCanManage(profile.permissions.includes('customers.manage')))
      .catch(() => setCanManage(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function reset() {
    if (!window.confirm('Reset this customer’s second factor?\n\nTheir authenticator and recovery codes stop working immediately and every signed-in session ends. They enrol a new authenticator at their next sign-in. You will not see the new secret.')) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await platformJson<ResetResult>(`customers/${encodeURIComponent(accountId)}/mfa/reset`, {
        method: 'POST', body: JSON.stringify({ internalReason: reason }),
      }));
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset multi-factor authentication');
    } finally { setBusy(false); }
  }

  if (!customer) return null;

  return <section className="pa-card mt-4 space-y-3">
    <div>
      <h2 className="font-semibold">Multi-factor authentication</h2>
      <p className="mt-1 text-sm text-slate-500">
        {customer.mfaEnabled
          ? `Enabled, with ${customer.recoveryCodesRemaining} unused recovery ${customer.recoveryCodesRemaining === 1 ? 'code' : 'codes'}.`
          : 'Not enabled. This account enrols an authenticator at its next sign-in.'}
        {customer.lockedUntil ? ' The account is currently locked after failed sign-ins.' : ''}
      </p>
    </div>

    {result && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
      Second factor cleared. {result.recoveryCodesDestroyed} recovery {result.recoveryCodesDestroyed === 1 ? 'code was' : 'codes were'} destroyed and {result.sessionsRevoked} {result.sessionsRevoked === 1 ? 'session was' : 'sessions were'} ended.
      Tell the owner to sign in and enrol a new authenticator — the secret is shown to them, once, and never to you.
    </p>}

    {canManage && customer.mfaEnabled && <>
      <label className="block text-xs font-medium text-slate-600" htmlFor="mfa-reset-reason">
        Internal reason <span aria-hidden="true">*</span>
        <textarea id="mfa-reset-reason" className="pa-input mt-1 min-h-20" minLength={3} value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder="Owner lost their authenticator; identity confirmed by phone" />
      </label>
      <p className="text-xs text-slate-500">
        Use only after confirming who you are speaking to. This ends their sessions and cannot be undone;
        the owner regains access by enrolling a new authenticator.
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="pa-btn-primary" disabled={busy || reason.trim().length < 3} onClick={reset}>
        {busy ? 'Resetting…' : 'Reset multi-factor authentication'}
      </button>
    </>}

    {!canManage && <p className="text-xs text-slate-500">Resetting a second factor needs the customers.manage permission.</p>}
  </section>;
}
