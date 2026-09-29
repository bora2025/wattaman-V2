'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AcademicStudyYearsPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/study-years?source=plugin') }, [router])
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Opening Academic Management study years…</div>
}
