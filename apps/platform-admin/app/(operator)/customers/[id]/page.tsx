import CustomerMfaReset from '../../../../components/CustomerMfaReset';
import CustomerSchools from '../../../../components/CustomerSchools';
import RecordInspector from '../../../../components/RecordInspector';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <>
    <RecordInspector title="Customer account" path={`customers/${encodeURIComponent(id)}`} />
    <CustomerSchools accountId={id} />
    <CustomerMfaReset accountId={id} />
  </>;
}
