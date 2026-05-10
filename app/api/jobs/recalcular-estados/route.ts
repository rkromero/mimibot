import { NextRequest, NextResponse } from 'next/server'
import { recalcularEstadosActividad } from '@/lib/clientes/actividad.service'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const result = await recalcularEstadosActividad()
    return NextResponse.json({
      data: {
        updated: result.updated,
        executedAt: new Date(),
      },
    })
  } catch (err) {
    console.error('[jobs/recalcular-estados] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
