import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { sql } from 'drizzle-orm'
import { stringToColor } from '@/lib/utils'

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['admin', 'agent', 'gerente']).default('agent'),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = req.nextUrl.searchParams.get('role')

    const conditions = [eq(users.isActive, true)]
    if (role === 'agent') conditions.push(eq(users.role, 'agent'))
    if (role === 'admin') conditions.push(eq(users.role, 'admin'))
    if (role === 'gerente') conditions.push(eq(users.role, 'gerente'))

    const data = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarColor: users.avatarColor,
        isActive: users.isActive,
        isOnline: sql<boolean>`${users.lastSeenAt} > NOW() - INTERVAL '90 seconds'`,
      })
      .from(users)
      .where(and(...conditions))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = createUserSchema.safeParse(body)
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors
        const firstMessage = Object.values(fieldErrors).flat()[0] ?? 'Datos inválidos'
        return NextResponse.json({ error: firstMessage }, { status: 400 })
      }

      const existing = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) })
      if (existing) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12)
      const avatarColor = stringToColor(parsed.data.name)

      const [user] = await db
        .insert(users)
        .values({
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
          role: parsed.data.role,
          avatarColor,
          isActive: true,
        })
        .returning({
          id: users.id, name: users.name, email: users.email,
          role: users.role, avatarColor: users.avatarColor, isActive: users.isActive,
        })

      return NextResponse.json({ data: user }, { status: 201 })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
