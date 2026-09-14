'use client';

import PluginDataTable from './PluginDataTable';
import type { PluginUiPageDescriptor } from '../../lib/plugin-ui-routing';

export default function PluginUiRenderer({ page, data, loading, errors }: { page: PluginUiPageDescriptor; data: Record<string, unknown>; loading: boolean; errors: Record<string, string> }) {
  return <div className="space-y-5">{page.components.map((component: any) => {
    if (component.type === 'table') return <PluginDataTable key={component.id} title={component.title} value={component.source ? data[component.source] : []} fields={component.fields} options={component.options} loading={loading} error={component.source ? errors[component.source] : undefined} />;
    if (component.type === 'heading') return <h2 key={component.id} className="text-xl font-semibold text-slate-800">{component.title}</h2>;
    if (component.type === 'text') return <p key={component.id} className="text-sm text-slate-600">{component.title}</p>;
    return <section key={component.id} className="card p-5 text-sm text-slate-500">{component.title || component.type} will be rendered by its LC3 component.</section>;
  })}</div>;
}
