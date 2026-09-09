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

interface IssuedFactor {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  sessionsRevoked: number;
}

interface IssuedPassword {
  password: string;
  sessionsRevoked: number;
  mfaStillRequired: boolean;
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
  const [issued, setIssued] = useState<IssuedFactor | null>(null);
  const [password, setPassword] = useState<IssuedPassword | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');

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

  /**
   * Mints a factor the operator can pass on. Kept behind its own confirmation because, unlike a
   * reset, it produces a working credential for someone else's account: whoever sees these values
   * can sign in as this customer until the owner replaces them.
   */
  async function issue() {
    if (!window.confirm('Generate a second factor for this customer?\n\nYou will see their authenticator secret and recovery codes. Anyone who sees them can sign in as this customer — including approving, in their name, a school’s permission to create paid orders. This is recorded against you and against the customer.')) return;
    setBusy(true); setError(''); setResult(null); setIssued(null);
    try {
      setIssued(await platformJson<IssuedFactor>(`customers/${encodeURIComponent(accountId)}/mfa/issue`, {
        method: 'POST', body: JSON.stringify({ internalReason: reason, confirmEmail: confirmEmail.trim() }),
      }));
      setReason(''); setConfirmEmail('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate a second factor');
    } finally { setBusy(false); }
  }

  /** The emailed reset link needs a mail provider this deployment does not have, so an owner who
   * forgets their password has no other way back. */
  async function resetPassword() {
    if (!window.confirm('Set a new password for this customer?\n\nYou will see it. Their current password stops working immediately and every signed-in session ends. This is recorded against you and against the customer.')) return;
    setBusy(true); setError(''); setResult(null); setIssued(null); setPassword(null);
    try {
      setPassword(await platformJson<IssuedPassword>(`customers/${encodeURIComponent(accountId)}/password/reset`, {
        method: 'POST', body: JSON.stringify({ internalReason: reason, confirmEmail: confirmEmail.trim() }),
      }));
      setReason(''); setConfirmEmail('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset the password');
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

    {issued && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="font-semibold text-amber-950">Send these to the account owner now</h3>
      <p className="mt-1 text-sm text-amber-900">
        Shown once. Use a channel you trust — not chat or email if you can avoid it — and ask the owner to
        replace them when they can. Until they do, anyone who has seen these can sign in as this customer.
        {issued.sessionsRevoked > 0 ? ` ${issued.sessionsRevoked} existing ${issued.sessionsRevoked === 1 ? 'session was' : 'sessions were'} ended.` : ''}
      </p>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-amber-800">Authenticator secret</dt>
          <dd><code className="mt-1 block break-all rounded-lg bg-white p-3">{issued.secret}</code></dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-amber-800">otpauth URI</dt>
          <dd><code className="mt-1 block break-all rounded-lg bg-white p-3 text-xs">{issued.otpauthUri}</code></dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-amber-800">Recovery codes</dt>
          <dd><code className="mt-1 block break-all rounded-lg bg-white p-3">{issued.recoveryCodes.join('  ')}</code></dd>
        </div>
      </dl>
    </section>}

    {password && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="font-semibold text-amber-950">Send this password to the account owner now</h3>
      <p className="mt-1 text-sm text-amber-900">
        Shown once. Ask them to change it after signing in.
        {password.mfaStillRequired
          ? ' Their second factor still applies, so this alone will not sign anyone in.'
          : ' This account has no second factor, so this alone is full access to it.'}
        {password.sessionsRevoked > 0 ? ` ${password.sessionsRevoked} existing ${password.sessionsRevoked === 1 ? 'session was' : 'sessions were'} ended.` : ''}
      </p>
      <code className="mt-3 block break-all rounded-lg bg-white p-3 text-sm">{password.password}</code>
    </section>}

    {canManage && <>
      <label className="block text-xs font-medium text-slate-600" htmlFor="mfa-reset-reason">
        Internal reason <span aria-hidden="true">*</span>
        <textarea id="mfa-reset-reason" className="pa-input mt-1 min-h-20" minLength={3} value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder="Owner lost their authenticator; identity confirmed by phone" />
      </label>
      {/* Shared by both credential-issuing actions below: retyping the address is what stops the
          wrong row being picked from a list. The reset action above needs no confirmation because
          it produces nothing anyone can sign in with. */}
      <label className="block text-xs font-medium text-slate-600" htmlFor="mfa-issue-confirm">
        Retype the account email — required for the two actions that show you a credential
        <input id="mfa-issue-confirm" type="email" className="pa-input mt-1" value={confirmEmail}
          onChange={event => setConfirmEmail(event.target.value)} placeholder="owner@example.com" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {customer.mfaEnabled && <div className="rounded-lg border p-3">
        <h3 className="text-sm font-semibold">Reset — the owner enrols their own</h3>
        <p className="mt-1 text-xs text-slate-500">
          Clears the factor and ends their sessions. You never see the replacement. Prefer this whenever the
          owner still knows their password and can reach an enrolment screen.
        </p>
        <button className="pa-btn-secondary mt-2" disabled={busy || reason.trim().length < 3} onClick={reset}>
          {busy ? 'Resetting…' : 'Reset multi-factor authentication'}
        </button>
      </div>}

      <div className="rounded-lg border border-amber-300 p-3">
        <h3 className="text-sm font-semibold">Reset password — you will see it</h3>
        <p className="mt-1 text-xs text-slate-500">
          For an owner who has forgotten their password. The emailed reset link needs a mail provider this
          deployment does not have, so this is the only way back.
          {customer.mfaEnabled
            ? ' Their second factor still applies, so this password alone will not sign anyone in.'
            : ' This account has no second factor, so this password alone is full access.'}
        </p>
        <button className="pa-btn-secondary mt-2" disabled={busy || reason.trim().length < 3 || !confirmEmail.trim()} onClick={resetPassword}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </div>

      <div className="rounded-lg border border-amber-300 p-3">
        <h3 className="text-sm font-semibold">Generate and send — you will see the codes</h3>
        <p className="mt-1 text-xs text-slate-500">
          Use when the owner cannot enrol one themselves. It produces a working credential for their account,
          so you will be able to sign in as them until they replace it. Recorded against you and against the customer.
        </p>
        <button className="pa-btn-primary mt-2" disabled={busy || reason.trim().length < 3 || !confirmEmail.trim()} onClick={issue}>
          {busy ? 'Generating…' : 'Generate second factor'}
        </button>
      </div>
    </>}

    {!canManage && <p className="text-xs text-slate-500">Resetting a second factor needs the customers.manage permission.</p>}
  </section>;
}
