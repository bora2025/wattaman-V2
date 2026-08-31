import RecordInspector from '../../../../components/RecordInspector';

export default async function PublisherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordInspector title="Publisher" path={`publishers/${encodeURIComponent(id)}`} />;
}
