import PluginRequestDetail from '../../../../components/PluginRequestDetail';

export default async function PluginRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PluginRequestDetail requestId={id} />;
}
