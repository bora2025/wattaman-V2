'use client';

import { FormEvent, useEffect, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { apiFetch } from '../../../lib/api';

interface CurrentUser {
  id: string;
  email: string | null;
  name: string;
  role: string;
}

const MINIMUM_LENGTH = 12;

/**
 * The signed-in administrator's own account.
 *
 * Its reason for existing is the password form. Until now the only way to change a school
 * administrator's password was for someone with deploy access to run a break-glass script over
 * SSH, which is a poor answer to "I would like a different password" and left the account
 * dependent on whoever holds that access.
 */
export default function AdminProfilePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(response => (response.ok ? response.json() : null))
      .then(value => value && setUser(value))
      .catch(() => undefined);
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice('');
    // Checked here as well as on the server so the mistake is caught before the current password is
    // sent anywhere, not after.
    if (newPassword !== confirmPassword) return setError('The two new passwords do not match.');
    if (newPassword.length < MINIMUM_LENGTH) return setError(`New password must be at least ${MINIMUM_LENGTH} characters.`);

    setBusy(true);
    try {
      const response = await apiFetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Could not change the password');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setNotice(result.revokedSessions > 0
        ? `Password changed. ${result.revokedSessions} other ${result.revokedSessions === 1 ? 'session was' : 'sessions were'} signed out.`
        : 'Password changed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the password');
    } finally { setBusy(false); }
  }

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div className="page-shell">
        <Sidebar title="Admin Panel" subtitle="Wattanam" navItems={adminNav} accentColor="indigo" />
        <div className="page-content">
          <div className="h-14 lg:hidden" />
          <div className="page-header">
            <h1 className="text-2xl font-bold text-slate-800">My profile</h1>
            <p className="mt-1 text-sm text-slate-500">The account you are signed in with on this school&apos;s admin panel.</p>
          </div>

          <div className="page-body space-y-6">
            <section className="card p-6">
              <h2 className="font-semibold text-slate-800">Signed in as</h2>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                <Item label="Name" value={user?.name ?? '—'} />
                <Item label="Email" value={user?.email ?? '—'} />
                <Item label="Role" value={user?.role ?? '—'} />
              </dl>
              {/* Said plainly because the same address is also a marketplace account with its own,
                  different password -- a distinction that is easy to miss when both sign-in screens
                  are served from this one domain. */}
              <p className="mt-4 text-xs text-slate-500">
                This is your school administrator account. Your marketplace customer account may use the same
                email address, but it is a separate account with its own password and its own authenticator.
              </p>
            </section>

            <section className="card p-6">
              <h2 className="font-semibold text-slate-800">Change password</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your current password is required, so someone who found this browser signed in cannot lock you
                out of your own account. Changing it signs out every other device.
              </p>

              <form className="mt-4 grid gap-4 sm:max-w-md" onSubmit={changePassword}>
                <label className="text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current password</span>
                  <input type="password" autoComplete="current-password" required value={currentPassword}
                    onChange={event => setCurrentPassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <div>
                  <label className="text-sm" htmlFor="new-password">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">New password</span>
                  </label>
                  <input id="new-password" type="password" autoComplete="new-password" required minLength={MINIMUM_LENGTH}
                    value={newPassword} onChange={event => setNewPassword(event.target.value)} aria-describedby="new-password-hint"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  {/* Outside the label and attached with aria-describedby: nested, it would fold into
                      the field's accessible name. */}
                  <p id="new-password-hint" className="mt-1 text-xs text-slate-500">At least {MINIMUM_LENGTH} characters.</p>
                </div>
                <label className="text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Confirm new password</span>
                  <input type="password" autoComplete="new-password" required value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>

                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

                <button className="btn btn-primary justify-self-start" type="submit"
                  disabled={busy || !currentPassword || newPassword.length < MINIMUM_LENGTH}>
                  {busy ? 'Changing…' : 'Change password'}
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-all text-sm text-slate-700">{value}</dd>
    </div>
  );
}
