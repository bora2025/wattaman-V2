import CustomerMfaReset from '../../../../components/CustomerMfaReset';
import RecordInspector from '../../../../components/RecordInspector';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <>
    <RecordInspector title="Customer account" path={`customers/${encodeURIComponent(id)}`} />
    <CustomerMfaReset accountId={id} />
  </>;
}
