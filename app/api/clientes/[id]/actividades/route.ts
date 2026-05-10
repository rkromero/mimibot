import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { actividadesCliente, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { createActividadSchema } from '@/lib/validations/actividades'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const rows = await db
      .select({
        actividad: actividadesCliente,
        asignadoNombre: users.name,
        asignadoColor: users.avatarColor,
      })
      .from(actividadesCliente)
      .leftJoin(users, eq(actividadesCliente.asignadoA, users.id))
      .where(eq(actividadesCliente.clienteId, id))
      .orderBy(desc(actividadesCliente.fechaProgramada), desc(actividadesCliente.createdAt))

    const data = rows.map((r) => ({
      ...r.actividad,
      asignadoNombre: r.asignadoNombre,
      asignadoColor: r.asignadoColor,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const body: unknown = await req.json()
    const parsed = createActividadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { tipo, titulo, notas, fechaProgramada, asignadoA } = parsed.data

    // Agents can only assign to themselves
    const assignee = session.user.role === 'admin'
      ? (asignadoA ?? session.user.id)
      : session.user.id

    const [actividad] = await db
      .insert(actividadesCliente)
      .values({
        clienteId: id,
        tipo,
        titulo,
        notas: notas ?? null,
        estado: 'pendiente',
        fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,
        asignadoA: assignee,
        creadoPor: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: actividad }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
