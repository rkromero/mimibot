import SecuritySettingsClient from './SecuritySettingsClient'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export default async function SecurityPage() {
  const session = await auth()
  const user = session
    ? await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { totpEnabled: true },
      })
    : null

  return <SecuritySettingsClient totpEnabled={user?.totpEnabled ?? false} />
}
