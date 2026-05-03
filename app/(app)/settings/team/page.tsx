import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import TeamManager from './TeamManager'

export default async function TeamPage() {
  const agentList = await db.query.users.findMany({
    columns: {
      id: true, name: true, email: true, role: true,
      avatarColor: true, isActive: true, isOnline: true, lastSeenAt: true,
    },
    orderBy: (u, { asc }) => [asc(u.name)],
  })

  return <TeamManager initialUsers={agentList} />
}
