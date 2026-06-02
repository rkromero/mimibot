import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull, inArray, desc } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'fabrica' && role !== 'admin') {
      throw new AuthzError('Solo fábrica o admin pueden acceder a este endpoint')
    }

    const estadoParam = req.nextUrl.searchParams.get('estado') ?? 'confirmado'
    const estados = estadoParam.split(',').map((s) => s.trim()) as Array<typeof pedidos.$inferSelect['estado']>

    const whereClause = and(
      isNull(pedidos.deletedAt),
      estados.length === 1
        ? eq(pedidos.estado, estados[0]!)
        : inArray(pedidos.estado, estados),
    )

    const data = await db.query.pedidos.findMany({
      where: whereClause,
      orderBy: [desc(pedidos.fecha)],
      with: {
        cliente: {
          columns: {
            id: true,
            nombre: true,
            apellido: true,
            direccion: true,
            localidad: true,
            provincia: true,
          },
        },
        items: {
          with: {
            producto: {
              columns: { id: true, nombre: true, sku: true },
            },
          },
        },
      },
    })

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
