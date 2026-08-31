'use client';

const resources = [
  ['orders', 'Orders'], ['entitlements', 'Entitlements'], ['installations', 'School installations'], ['audit-events', 'Audit events'],
] as const;

export default function ExportsPage() {
  return <div className="space-y-5">
    <div><h1 className="text-xl font-bold">Audited exports</h1><p className="text-sm text-slate-500">Downloads are bounded, contain masked customer identifiers, and create an audit event.</p></div>
    <section className="grid gap-4 sm:grid-cols-2">{resources.map(([resource, title]) => <article key={resource} className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-slate-500">Up to 1,000 most recent records in CSV format.</p><a className="pa-btn-secondary mt-4 inline-flex" href={`/api/platform/exports?resource=${resource}&limit=1000`}>Download CSV</a></article>)}</section>
  </div>;
}
