import RecordInspector from '../../../../components/RecordInspector';

export default async function OperatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordInspector title="Platform operator" path={`operators/${encodeURIComponent(id)}`} />;
}
