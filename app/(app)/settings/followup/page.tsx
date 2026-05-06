import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import FollowUpSettingsClient from './FollowUpSettingsClient'

export default async function FollowUpSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [config, templates] = await Promise.all([
    db.query.followUpConfig.findFirst(),
    db.query.followUpTemplates.findMany({
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    }),
  ])

  return <FollowUpSettingsClient initialConfig={config ?? null} initialTemplates={templates} />
}
