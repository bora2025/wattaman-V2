'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OperatorProfile, platformJson } from '../../../../lib/api';

interface SchoolSummary {
  id: string; name: string; slug: string; status: string;
  railwayProjectId: string | null; gatewayOrigin: string | null;
}

interface Discovery {
  gatewayOrigin: string;
  railwayProjectId: string | null;
  ready: boolean;
  detected: {
    installationId: string; schoolName: string; schoolSlug: string;
    locale: string | null; timezone: string | null; currency: string | null;
    coreVersion: string | null; installedAt: string | null; environment: string | null;
  };
  outcome: 'CREATE' | 'MATCH' | 'CONFLICT';
  conflictReasons: string[];
  match: SchoolSummary | null;
  matchedBy: { slug: boolean; railwayProjectId: boolean; gatewayOrigin: boolean } | null;
  registration: { id: string; installationId: string; label: string | null; adopted: boolean; activeKeyFingerprint: string | null } | null;
}

/**
 * Provider-neutral adoption for schools deployed before Platform-first provisioning existed.
 *
 * Discovery is read-only and the operator confirms every identity decision explicitly: the whole
 * point of the flow is that the record is built from what the deployment says about itself rather
 * than from values retyped by hand.
 */
export default function AdoptSchoolPage() {
  const router = useRouter();
  const [permission, setPermission] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [gatewayOrigin, setGatewayOrigin] = useState('');
  const [railwayProjectId, setRailwayProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);

  useEffect(() => {
    platformJson<OperatorProfile>('me')
      .then(profile => setPermission(profile.permissions.includes('schools.manage') ? 'allowed' : 'denied'))
      .catch(() => setPermission('denied'));
  }, []);

  function changeDeployment(field: 'gateway' | 'project', value: string) {
    if (field === 'gateway') setGatewayOrigin(value);
    else setRailwayProjectId(value);
    // A discovery result is valid only for the exact identifiers that produced it. Clearing it
    // prevents an operator editing the form and then adopting the previously inspected school.
    setDiscovery(null); setIdentityConfirmed(false); setError('');
  }

  async function discover(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setDiscovery(null); setIdentityConfirmed(false);
    try {
      setDiscovery(await platformJson<Discovery>('schools/adoptions/discover', {
        method: 'POST',
        body: JSON.stringify({ gatewayOrigin: gatewayOrigin.trim(), ...(railwayProjectId.trim() ? { railwayProjectId: railwayProjectId.trim() } : {}) }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Discovery failed');
    } finally { setBusy(false); }
  }

  /** Creates the record when nothing matched, or reuses the one that did, then records the
   * infrastructure and adopts the registration if the school already has one. */
  async function adopt() {
    if (!discovery || discovery.outcome === 'CONFLICT') return;
    setBusy(true); setError('');
    try {
      const detected = discovery.detected;
      let school = discovery.match;
      if (!school) {
        school = await platformJson<SchoolSummary>('schools', {
          method: 'POST',
          body: JSON.stringify({
            name: detected.schoolName, slug: detected.schoolSlug,
            ...(detected.locale ? { locale: detected.locale } : {}),
            ...(detected.timezone ? { timezone: detected.timezone } : {}),
            ...(detected.currency ? { currency: detected.currency } : {}),
            ...(discovery.railwayProjectId ? { railwayProjectId: discovery.railwayProjectId } : {}),
            gatewayOrigin: discovery.gatewayOrigin,
            internalReason: reason,
          }),
        });
      } else {
        await platformJson(`schools/${school.id}/infrastructure`, {
          method: 'POST',
          body: JSON.stringify({ railwayProjectId: discovery.railwayProjectId, gatewayOrigin: discovery.gatewayOrigin, internalReason: reason }),
        });
      }

      if (discovery.registration && !discovery.registration.adopted) {
        await platformJson(`schools/${school.id}/adopt-installation`, {
          method: 'POST',
          body: JSON.stringify({ installationId: detected.installationId, internalReason: reason }),
        });
      }
      router.push(`/schools/${school.id}${!discovery.registration ? '?enrollment=required' : '?adopted=true'}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Adoption failed');
    } finally { setBusy(false); }
  }

  const canAdopt = Boolean(discovery && discovery.outcome !== 'CONFLICT' && discovery.ready && identityConfirmed && reason.trim().length >= 3);

  if (permission === 'loading') return <p className="text-sm text-slate-500">Loading…</p>;
  if (permission === 'denied') return <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">You need the schools.manage permission to connect an existing school.</p>;

  return <div className="space-y-4">
    <div>
      <Link className="text-sm text-indigo-700 hover:underline" href="/schools">← Customer schools</Link>
      <h1 className="mt-2 text-xl font-bold">Connect an existing school</h1>
      <p className="text-sm text-slate-500">For schools deployed before platform-managed provisioning. Discovery only reads the gateway&apos;s public status endpoints; it never touches the school&apos;s database.</p>
    </div>

    <form className="pa-card space-y-4" onSubmit={discover}>
      <h2 className="font-semibold">1. Identify the deployment</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="gateway">Gateway origin <span aria-hidden="true">*</span></label>
          <input id="gateway" required type="url" className="pa-input mt-1" value={gatewayOrigin} aria-describedby="gateway-hint"
            placeholder="https://school.example.com" onChange={event => changeDeployment('gateway', event.target.value)} />
          <p id="gateway-hint" className="mt-1 text-xs text-slate-500">HTTPS origin only, no path. Private and loopback addresses are refused.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="project">Hosting project ID (optional)</label>
          <input id="project" className="pa-input mt-1" value={railwayProjectId} aria-describedby="project-hint"
            placeholder="b5b07c38-6569-4bee-ab88-6b134998c77d" onChange={event => changeDeployment('project', event.target.value)} />
          <p id="project-hint" className="mt-1 text-xs text-slate-500">Optional. Infrastructure metadata only — it is not proof of ownership.</p>
        </div>
      </div>
      <button className="pa-btn-primary" disabled={busy || !gatewayOrigin.trim()} type="submit">{busy ? 'Contacting gateway…' : 'Run discovery'}</button>
      {error && !discovery && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </form>

    {discovery && <>
      <section className="pa-card">
        <h2 className="font-semibold">2. Confirm the detected identity</h2>
        <p className="mt-1 text-xs text-slate-500">Reported by the deployment itself. Confirm it is the school you intend to adopt before continuing.</p>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <Item label="School" value={discovery.detected.schoolName} />
          <Item label="Slug" value={discovery.detected.schoolSlug} />
          <Item label="Installation ID" value={discovery.detected.installationId} />
          <Item label="Core version" value={discovery.detected.coreVersion || '—'} />
          <Item label="Locale / timezone" value={[discovery.detected.locale, discovery.detected.timezone].filter(Boolean).join(' · ') || '—'} />
          <Item label="Currency" value={discovery.detected.currency || '—'} />
          <Item label="Gateway" value={discovery.gatewayOrigin} />
          <Item label="Readiness" value={discovery.ready ? 'Ready' : 'Not reporting ready'} />
          <Item label="Marketplace registration" value={discovery.registration ? (discovery.registration.adopted ? 'Registered, already adopted' : 'Registered, unadopted') : 'Never registered'} />
        </dl>
      </section>

      <section className={discovery.outcome === 'CONFLICT' ? 'rounded-xl border border-red-300 bg-red-50 p-5' : 'pa-card'}>
        <h2 className="font-semibold">3. Directory decision</h2>
        {discovery.outcome === 'CONFLICT' && <>
          <p className="mt-1 text-sm text-red-800">Adoption stopped. These identifiers disagree, and guessing which record is right could attach one school&apos;s commercial state to another.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-800">{discovery.conflictReasons.map(item => <li key={item}>{item}</li>)}</ul>
        </>}
        {discovery.outcome === 'MATCH' && discovery.match && <p className="mt-1 text-sm text-slate-600">
          Matches the existing record <Link className="text-indigo-700 hover:underline" href={`/schools/${discovery.match.id}`}>{discovery.match.name}</Link> on {[
            discovery.matchedBy?.slug && 'slug', discovery.matchedBy?.railwayProjectId && 'hosting project', discovery.matchedBy?.gatewayOrigin && 'gateway',
          ].filter(Boolean).join(', ')}. Adopting records this infrastructure against it.
        </p>}
        {discovery.outcome === 'CREATE' && <p className="mt-1 text-sm text-slate-600">No existing record matches. Adopting creates one from the detected identity above.</p>}
      </section>

      {discovery.outcome !== 'CONFLICT' && <section className="pa-card space-y-3">
        <h2 className="font-semibold">4. Record the decision</h2>
        {!discovery.ready && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This deployment is not reporting ready. Adoption is disabled until its public readiness check succeeds. Fix the deployment and run discovery again.</p>}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input className="mt-1" type="checkbox" checked={identityConfirmed} onChange={event => setIdentityConfirmed(event.target.checked)} />
          <span>I confirm the detected school, installation ID, gateway, and directory decision belong to this customer.</span>
        </label>
        <label className="block text-xs font-medium text-slate-600" htmlFor="reason">Internal reason <span aria-hidden="true">*</span>
          <textarea id="reason" required minLength={3} className="pa-input mt-1 min-h-20" value={reason}
            onChange={event => setReason(event.target.value)} placeholder="Migrating an existing customer into the platform directory" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="pa-btn-primary" disabled={busy || !canAdopt} onClick={adopt}>
          {busy ? 'Adopting…' : discovery.outcome === 'MATCH' ? 'Adopt into existing record' : 'Create record and adopt'}
        </button>
      </section>}
    </>}
  </div>;
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}
