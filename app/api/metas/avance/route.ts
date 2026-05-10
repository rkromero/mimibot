import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import {
  calcularAvanceVendedor,
  calcularAvanceTodos,
} from '@/lib/metas/avance.service'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const now = new Date()
    const params = req.nextUrl.searchParams

    const anio = params.has('anio') ? parseInt(params.get('anio')!, 10) : now.getFullYear()
    const mes = params.has('mes') ? parseInt(params.get('mes')!, 10) : now.getMonth() + 1

    if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12 || anio < 2020) {
      return NextResponse.json({ error: 'Parámetros anio/mes inválidos' }, { status: 400 })
    }

    if (session.user.role === 'agent') {
      // Agents only see their own avance
      const avance = await calcularAvanceVendedor(session.user.id, anio, mes)
      return NextResponse.json({ data: avance })
    }

    // Admin path
    const vendedorId = params.get('vendedorId')

    if (vendedorId) {
      const avance = await calcularAvanceVendedor(vendedorId, anio, mes)
      return NextResponse.json({ data: avance })
    }

    // No vendedorId: return all metas for the period
    const avances = await calcularAvanceTodos(anio, mes)
    return NextResponse.json({ data: avances })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
