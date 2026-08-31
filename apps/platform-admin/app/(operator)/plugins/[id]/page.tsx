import RecordInspector from '../../../../components/RecordInspector';

export default async function PluginDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordInspector title="Plugin" path={`plugins/${encodeURIComponent(id)}`} />;
}
