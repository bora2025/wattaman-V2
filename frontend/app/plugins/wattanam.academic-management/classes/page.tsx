'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AcademicClassesPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/classes?source=plugin') }, [router])
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Opening Academic Management classes…</div>
}
