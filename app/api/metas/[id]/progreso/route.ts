import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { AuthzError } from '@/lib/errors'
import { toApiError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { calcularProgresoVendedor } from '@/lib/metas/progreso-vendedor.service'
import { esRolVentas } from '@/lib/authz/roles'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/metas/{userId}/progreso
 *
 * Returns the 3 vendedor KPI metrics for the current month plus
 * the list of clients with unpaid pedidos (pedidosImpagos).
 *
 * The {id} path param is the USER ID (vendedorId), not a meta ID.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: userId } = await params
    const invalid = validateUuidParam(userId)
    if (invalid) return invalid

    const { user } = session

    // vendedor / agent can only query their own progress
    if (esRolVentas(user.role)) {
      if (user.id !== userId) throw new AuthzError()
    }
    // admin / gerente can query any user (gerente scope can be added later)

    const now = new Date()
    const anio = now.getFullYear()
    const mes = now.getMonth() + 1

    const data = await calcularProgresoVendedor(userId, anio, mes)
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
