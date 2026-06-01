import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { getAdminDashboardStats } from '@/lib/admin/dashboard.service'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const anio = parseInt(searchParams.get('anio') ?? String(now.getFullYear()), 10)
    const mes = parseInt(searchParams.get('mes') ?? String(now.getMonth() + 1), 10)

    if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12 || anio < 2000 || anio > 2100) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const data = await getAdminDashboardStats(anio, mes)
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
