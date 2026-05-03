import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['admin', 'agent']).optional(),
  isActive: z.boolean().optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = updateUserSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
      }

      const user = await db.query.users.findFirst({ where: eq(users.id, id) })
      if (!user) throw new NotFoundError('Usuario')

      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.role !== undefined) updates.role = parsed.data.role
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive
      if (parsed.data.avatarColor !== undefined) updates.avatarColor = parsed.data.avatarColor

      const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning({
        id: users.id, name: users.name, email: users.email,
        role: users.role, isActive: users.isActive, avatarColor: users.avatarColor,
      })

      return NextResponse.json({ data: updated })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
