import RecordInspector from '../../../../components/RecordInspector';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordInspector title="Order" path={`orders/${encodeURIComponent(id)}`} />;
}
