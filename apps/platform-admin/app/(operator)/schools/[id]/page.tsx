import SchoolDetail from '../../../../components/SchoolDetail';

export default async function SchoolDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ enrollment?: string; adopted?: string }> }) {
  const { id } = await params;
  const notice = await searchParams;
  return <SchoolDetail schoolId={id} notice={notice.enrollment === 'required' ? 'enrollment-required' : notice.adopted === 'true' ? 'adopted' : undefined} />;
}
