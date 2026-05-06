import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import FollowUpSettingsClient from './FollowUpSettingsClient'

export default async function FollowUpSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  let config = null
  let templates: Awaited<ReturnType<typeof db.query.followUpTemplates.findMany>> = []

  try {
    const [c, t] = await Promise.all([
      db.query.followUpConfig.findFirst(),
      db.query.followUpTemplates.findMany({
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      }),
    ])
    config = c ?? null
    templates = t
  } catch (err) {
    // Las tablas aún no existen — la migración todavía no corrió
    console.error('[followup page] Error cargando config de seguimiento:', err)
  }

  return <FollowUpSettingsClient initialConfig={config} initialTemplates={templates} />
}
