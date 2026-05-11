import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { stockMovements, productos, users } from '@/db/schema'
import { eq, sql, and, isNull, desc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const productoId = req.nextUrl.searchParams.get('productoId')
    if (!productoId) return NextResponse.json({ error: 'productoId requerido' }, { status: 400 })

    const rows = await db
      .select({
        id: stockMovements.id,
        tipo: stockMovements.tipo,
        cantidad: stockMovements.cantidad,
        saldoResultante: stockMovements.saldoResultante,
        referencia: stockMovements.referencia,
        notas: stockMovements.notas,
        pedidoId: stockMovements.pedidoId,
        createdAt: stockMovements.createdAt,
        registradoPorNombre: users.name,
      })
      .from(stockMovements)
      .innerJoin(users, eq(stockMovements.registradoPor, users.id))
      .where(eq(stockMovements.productoId, productoId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(50)

    return NextResponse.json({ data: rows })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

const createMovimientoSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  tipo: z.enum(['entrada', 'ajuste']),
  cantidad: z.number().int().positive('La cantidad debe ser positiva'),
  referencia: z.string().max(200).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = createMovimientoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { productoId, tipo, cantidad, referencia, notas } = parsed.data

    const producto = await db.query.productos.findFirst({
      where: and(eq(productos.id, productoId), isNull(productos.deletedAt)),
      columns: { id: true },
    })
    if (!producto) throw new NotFoundError('Producto')

    const resultado = await db.transaction(async (tx) => {
      // Get current stock
      const [latest] = await tx
        .select({ saldo: stockMovements.saldoResultante })
        .from(stockMovements)
        .where(eq(stockMovements.productoId, productoId))
        .orderBy(sql`${stockMovements.createdAt} DESC`)
        .limit(1)

      const saldoActual = latest?.saldo ?? 0
      let nuevoSaldo: number

      if (tipo === 'entrada') {
        nuevoSaldo = saldoActual + cantidad
      } else {
        // ajuste: puede ser positivo (suma) o negativo (resta) según cantidad
        nuevoSaldo = saldoActual + cantidad
        if (nuevoSaldo < 0) throw new ValidationError('El ajuste resultaría en stock negativo')
      }

      const [movimiento] = await tx
        .insert(stockMovements)
        .values({
          productoId,
          tipo,
          cantidad,
          saldoResultante: nuevoSaldo,
          referencia: referencia ?? null,
          notas: notas ?? null,
          registradoPor: session.user.id,
        })
        .returning()

      return movimiento
    })

    return NextResponse.json({ data: resultado }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
