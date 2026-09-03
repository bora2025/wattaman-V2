import SchoolDetail from '../../../../components/SchoolDetail';

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SchoolDetail schoolId={id} />;
}
