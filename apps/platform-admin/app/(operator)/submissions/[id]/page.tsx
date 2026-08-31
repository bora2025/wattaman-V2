import RecordInspector from '../../../../components/RecordInspector';

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordInspector title="Plugin submission" path={`submissions/${encodeURIComponent(id)}`} />;
}
