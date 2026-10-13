import PluginManager from '../../../../components/PluginManager';

export default async function PluginDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PluginManager pluginId={id} />;
}
