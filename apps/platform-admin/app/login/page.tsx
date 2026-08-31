'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { platformFetch, platformJson } from '../../lib/api';

type Phase = 'credentials' | 'mfa_required' | 'mfa_enrollment';

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await platformJson<{ status: string }>('auth/sessions', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
      });
      if (result.status === 'authenticated') { router.push('/dashboard'); return; }
      if (result.status === 'mfa_required') { setPhase('mfa_required'); setError(''); return; }
      if (result.status === 'mfa_enrollment_required') {
        // Mandatory MFA: this operator has never enrolled, and the session they just received can
        // reach nothing else until they do.
        const enrolled = await platformJson<{ secret: string; otpauthUri: string }>('auth/mfa/enroll', { method: 'POST', body: '{}' });
        setEnrollment(enrolled);
        setPhase('mfa_enrollment');
        return;
      }
      setError(`Unexpected sign-in state: ${result.status}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
    } finally { setBusy(false); }
  }

  async function confirmEnrollment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await platformJson<{ enabled: boolean; recoveryCodes: string[] }>('auth/mfa/enroll/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setRecoveryCodes(result.recoveryCodes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm the code');
    } finally { setBusy(false); }
  }

  if (recoveryCodes) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <div className="pa-card space-y-4">
          <h1 className="text-xl font-bold">Save your recovery codes</h1>
          <p className="text-sm text-slate-600">
            Each code works once, and this is the only time they are shown. Store them somewhere you can reach
            without this device.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-4 font-mono text-sm">
            {recoveryCodes.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
          <button className="pa-btn-primary w-full" onClick={() => router.push('/dashboard')}>
            I have saved them — continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="pa-card space-y-5">
        <header>
          <h1 className="text-xl font-bold">Wattanam Platform Admin</h1>
          <p className="mt-1 text-sm text-slate-600">Operator sign-in. This is not a school administrator account.</p>
        </header>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {phase === 'mfa_enrollment' && enrollment ? (
          <form className="space-y-4" onSubmit={confirmEnrollment}>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Multi-factor authentication is required for every operator. Add this secret to your authenticator app,
              then enter the six-digit code it shows.
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setup key</span>
              <code className="mt-1 block break-all rounded-lg bg-slate-100 p-3 font-mono text-sm">{enrollment.secret}</code>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Six-digit code</span>
              <input className="pa-input mt-1" inputMode="numeric" autoComplete="one-time-code" value={code}
                     onChange={(event) => setCode(event.target.value)} required />
            </label>
            <button className="pa-btn-primary w-full" disabled={busy} type="submit">
              {busy ? 'Confirming…' : 'Confirm and finish enrollment'}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={submitCredentials}>
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input className="pa-input mt-1" type="email" autoComplete="username" value={email}
                     onChange={(event) => setEmail(event.target.value)} required disabled={phase === 'mfa_required'} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input className="pa-input mt-1" type="password" autoComplete="current-password" value={password}
                     onChange={(event) => setPassword(event.target.value)} required />
            </label>
            {phase === 'mfa_required' && (
              <label className="block">
                <span className="text-sm font-medium">Authentication code</span>
                <input className="pa-input mt-1" inputMode="numeric" autoComplete="one-time-code" value={code}
                       onChange={(event) => setCode(event.target.value)} required autoFocus />
                <span className="mt-1 block text-xs text-slate-500">Enter a code from your authenticator app, or a recovery code.</span>
              </label>
            )}
            <button className="pa-btn-primary w-full" disabled={busy} type="submit">
              {busy ? 'Signing in…' : phase === 'mfa_required' ? 'Verify and sign in' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
