import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { sql } from 'drizzle-orm'
import { stringToColor } from '@/lib/utils'
import { cachedJson } from '@/lib/api/cache'
import { getSessionContext } from '@/lib/territorios/context'

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['admin', 'agent', 'gerente', 'vendedor', 'fabrica']).default('agent'),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const roleParam = req.nextUrl.searchParams.get('role')

    const VALID_ROLES = ['admin', 'agent', 'gerente', 'vendedor', 'fabrica'] as const
    type UserRole = typeof VALID_ROLES[number]
    const conditions = [eq(users.isActive, true)]

    if (ctx.role === 'gerente') {
      if (ctx.agentesVisibles.length === 0) return NextResponse.json({ data: [] })
      conditions.push(inArray(users.id, ctx.agentesVisibles))
    } else if (ctx.role === 'agent' || ctx.role === 'vendedor') {
      conditions.push(inArray(users.id, [session.user.id]))
    }

    if (roleParam) {
      const roles = roleParam
        .split(',')
        .map((s) => s.trim())
        .filter((r): r is UserRole => (VALID_ROLES as readonly string[]).includes(r))
      if (roles.length === 1) {
        conditions.push(eq(users.role, roles[0]!))
      } else if (roles.length > 1) {
        conditions.push(inArray(users.role, roles))
      }
    }

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

    return cachedJson(req, { data })
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
