import RecordInspector from '../../../../components/RecordInspector';

export default async function InstallationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordInspector title="School installation" path={`installations/${encodeURIComponent(id)}`} />;
}
