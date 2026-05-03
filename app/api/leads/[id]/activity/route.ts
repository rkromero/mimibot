import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { activityLog } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessLead(session.user, id)

    const data = await db.query.activityLog.findMany({
      where: eq(activityLog.leadId, id),
      orderBy: [desc(activityLog.createdAt)],
      limit: 50,
    })

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
