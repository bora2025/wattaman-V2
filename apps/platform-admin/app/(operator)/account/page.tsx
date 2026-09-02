'use client';

import { useState } from 'react';
import { platformJson } from '../../../lib/api';

const MINIMUM_LENGTH = 12;

export default function AccountPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ revokedSessions: number } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Checked here as a courtesy so a typo does not cost a round trip; the API enforces both the
    // length and the second factor regardless of what this form does.
    if (newPassword !== confirmPassword) return setError('The two new passwords do not match.');
    if (newPassword.length < MINIMUM_LENGTH) return setError(`Use at least ${MINIMUM_LENGTH} characters.`);

    setBusy(true); setError('');
    try {
      const response = await platformJson<{ changed: boolean; revokedSessions: number }>('auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, code }),
      });
      setResult({ revokedSessions: response.revokedSessions });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setCode('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the password');
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-bold">Your account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Change your own operator password. Nobody can change it for you — there is no reset link
          and no administrator override, so keep your recovery codes somewhere you can reach.
        </p>
      </div>

      {result && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Password changed. {result.revokedSessions === 0
            ? 'No other sessions were signed in.'
            : `${result.revokedSessions} other ${result.revokedSessions === 1 ? 'session was' : 'sessions were'} signed out.`}
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Hints live outside their <label> and are attached with aria-describedby. Nesting them
          inside would fold the hint text into each field's accessible name, so a screen reader
          would announce "New password At least 12 characters" as the label itself. */}
      <form className="pa-card space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-sm font-medium" htmlFor="current-password">Current password</label>
          <input className="pa-input mt-1" id="current-password" type="password" autoComplete="current-password"
                 required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="new-password">New password</label>
          <input className="pa-input mt-1" id="new-password" type="password" autoComplete="new-password"
                 aria-describedby="new-password-hint" required minLength={MINIMUM_LENGTH}
                 value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <p id="new-password-hint" className="mt-1 text-xs text-slate-500">At least {MINIMUM_LENGTH} characters.</p>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="confirm-password">Confirm new password</label>
          <input className="pa-input mt-1" id="confirm-password" type="password" autoComplete="new-password"
                 required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="mfa-code">Authentication code</label>
          <input className="pa-input mt-1" id="mfa-code" inputMode="numeric" autoComplete="one-time-code"
                 aria-describedby="mfa-code-hint" required
                 value={code} onChange={(event) => setCode(event.target.value)} />
          <p id="mfa-code-hint" className="mt-1 text-xs text-slate-500">
            A current code from your authenticator app, or a recovery code. Required so a borrowed
            session cannot change your password on its own.
          </p>
        </div>
        <button className="pa-btn-primary w-full" disabled={busy} type="submit">
          {busy ? 'Changing…' : 'Change password'}
        </button>
        <p className="text-xs text-slate-500">
          Every other signed-in session is signed out when the password changes. This one stays.
        </p>
      </form>
    </div>
  );
}
