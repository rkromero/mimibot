import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { withAdminAuth } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'agent', 'gerente', 'vendedor', 'fabrica', 'repartidor', 'rtv']).optional(),
  isActive: z.boolean().optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  password: z.string().min(8).max(100).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = updateUserSchema.safeParse(body)
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors
        const firstMessage = Object.values(fieldErrors).flat()[0] ?? 'Datos inválidos'
        return NextResponse.json({ error: firstMessage }, { status: 400 })
      }

      const user = await db.query.users.findFirst({ where: eq(users.id, id) })
      if (!user) throw new NotFoundError('Usuario')

      // Validar que el nuevo email no esté en uso por otro usuario
      if (parsed.data.email !== undefined) {
        const emailConflict = await db.query.users.findFirst({
          where: and(eq(users.email, parsed.data.email), ne(users.id, id)),
        })
        if (emailConflict) {
          return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
        }
      }

      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.email !== undefined) updates.email = parsed.data.email
      if (parsed.data.role !== undefined) updates.role = parsed.data.role
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive
      if (parsed.data.avatarColor !== undefined) updates.avatarColor = parsed.data.avatarColor
      if (parsed.data.password !== undefined && parsed.data.password.length > 0) {
        updates.passwordHash = await bcrypt.hash(parsed.data.password, 12)
      }

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
