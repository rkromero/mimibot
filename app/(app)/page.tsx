import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HomeRedirect from '@/components/shared/HomeRedirect'

export const dynamic = 'force-dynamic'

// Middleware handles the redirect for logged-in users before this page renders.
// This page is the fallback and MUST render a client component so Next.js
// generates a page_client-reference-manifest.js for this route — without it,
// any request to "/" throws InvariantError even before user code runs.
export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <HomeRedirect role={session.user.role} />
}
