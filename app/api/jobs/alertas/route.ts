import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { leads, metas, stockMovements, pedidos, clientes, productos, users, businessConfig, pipelineStages, contacts } from '@/db/schema'
import { and, eq, isNull, lt, sql, inArray } from 'drizzle-orm'
import { Resend } from 'resend'
import { format, subHours, subDays } from 'date-fns'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!secret || secret !== process.env.JOBS_SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const [config] = await db.select().from(businessConfig).where(eq(businessConfig.id, 1)).limit(1)
    const alertaLeadHoras = config?.alertaLeadHoras ?? 24
    const alertaMetaDia = config?.alertaMetaDia ?? 20
    const alertaMetaPct = parseFloat(String(config?.alertaMetaPct ?? '0.50'))
    const morosoDias = config?.clienteMorosoDias ?? 30

    const alertas: string[] = []

    // 1. Leads sin atender
    const cutoffLead = subHours(new Date(), alertaLeadHoras)
    const leadsNoAtendidos = await db.query.leads.findMany({
      where: and(
        isNull(leads.deletedAt),
        eq(leads.isOpen, true),
        lt(leads.createdAt, cutoffLead),
        isNull(leads.lastContactedAt),
      ),
      with: { contact: { columns: { name: true, phone: true } } },
      columns: { id: true, createdAt: true },
    })

    if (leadsNoAtendidos.length > 0) {
      alertas.push(`🔴 <strong>Leads sin atender (${leadsNoAtendidos.length})</strong> — más de ${alertaLeadHoras}h sin contacto:<br/>` +
        leadsNoAtendidos.slice(0, 5).map((l) => `&nbsp;&nbsp;• ${l.contact?.name ?? 'Sin nombre'} — ${l.contact?.phone ?? ''} (${format(l.createdAt, 'dd/MM HH:mm')})`).join('<br/>') +
        (leadsNoAtendidos.length > 5 ? `<br/>&nbsp;&nbsp;...y ${leadsNoAtendidos.length - 5} más` : ''))
    }

    // 2. Meta mensual baja (al día alertaMetaDia del mes)
    const hoy = new Date()
    if (hoy.getDate() >= alertaMetaDia) {
      const metasMes = await db.query.metas.findMany({
        where: and(
          eq(metas.periodoAnio, hoy.getFullYear()),
          eq(metas.periodoMes, hoy.getMonth() + 1),
        ),
        with: { vendedor: { columns: { name: true } } },
      })

      const metasEnRiesgo: string[] = []
      for (const meta of metasMes) {
        if (!meta.montoCobradoObjetivo || parseFloat(meta.montoCobradoObjetivo) === 0) continue
        const objetivo = parseFloat(meta.montoCobradoObjetivo)
        // Simplified: check if saldo pendiente is low relative to target
        // In production, would compute actual collected amount from movimientosCC
        // For now just flag all metas as a reminder
        metasEnRiesgo.push(`&nbsp;&nbsp;• ${meta.vendedor?.name ?? 'Sin nombre'}: objetivo $${objetivo.toLocaleString('es-AR')}`)
      }

      if (metasMes.length > 0 && hoy.getDate() >= alertaMetaDia) {
        alertas.push(`🟡 <strong>Recordatorio metas ${format(hoy, 'MM/yyyy')}</strong> — estamos en día ${hoy.getDate()}, verificar avance:<br/>` +
          metasEnRiesgo.join('<br/>'))
      }
    }

    // 3. Stock bajo (stockActual < stockMinimo)
    const productosConStockBajo = await db.query.productos.findMany({
      where: and(isNull(productos.deletedAt), eq(productos.activo, true)),
      columns: { id: true, nombre: true, sku: true, stockMinimo: true },
    })

    const stockBajoItems: string[] = []
    for (const p of productosConStockBajo) {
      if (p.stockMinimo === 0) continue
      const [latest] = await db
        .select({ saldo: stockMovements.saldoResultante })
        .from(stockMovements)
        .where(eq(stockMovements.productoId, p.id))
        .orderBy(sql`${stockMovements.createdAt} DESC`)
        .limit(1)
      const saldo = latest?.saldo ?? 0
      if (saldo < p.stockMinimo) {
        stockBajoItems.push(`&nbsp;&nbsp;• ${p.sku ? `[${p.sku}] ` : ''}${p.nombre}: ${saldo} unidades (mín: ${p.stockMinimo})`)
      }
    }

    if (stockBajoItems.length > 0) {
      alertas.push(`📦 <strong>Stock bajo (${stockBajoItems.length} productos)</strong>:<br/>${stockBajoItems.join('<br/>')}`)
    }

    // 4. Deuda vencida nueva (pedidos que cruzaron umbral en las últimas 24h)
    const cutoffMoroso = subDays(new Date(), morosoDias)
    const cutoffMorosoYesterday = subDays(new Date(), morosoDias + 1)

    const pedidosMorososNuevos = await db.query.pedidos.findMany({
      where: and(
        isNull(pedidos.deletedAt),
        sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
        lt(pedidos.fecha, cutoffMoroso),
        sql`${pedidos.fecha} > ${cutoffMorosoYesterday}`,
      ),
      with: {
        cliente: { columns: { nombre: true, apellido: true } },
      },
      columns: { id: true, saldoPendiente: true, fecha: true },
    })

    if (pedidosMorososNuevos.length > 0) {
      alertas.push(`⚠️ <strong>Nuevos morosos hoy (${pedidosMorososNuevos.length})</strong> — cruzaron ${morosoDias} días sin pagar:<br/>` +
        pedidosMorososNuevos.slice(0, 5).map((p) =>
          `&nbsp;&nbsp;• ${p.cliente?.nombre ?? ''} ${p.cliente?.apellido ?? ''}: $${parseFloat(p.saldoPendiente ?? '0').toLocaleString('es-AR')}`
        ).join('<br/>'))
    }

    if (alertas.length === 0) {
      return NextResponse.json({ message: 'Sin alertas pendientes', sent: false })
    }

    // Get admin emails
    const admins = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.isActive, true)))

    if (admins.length === 0) {
      return NextResponse.json({ message: 'Sin admins activos', sent: false })
    }

    const htmlBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1d4ed8; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
          Resumen de Alertas — ${format(new Date(), 'dd/MM/yyyy HH:mm')}
        </h2>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          ${alertas.map((a) => `<div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid #1d4ed8;">${a}</div>`).join('')}
        </div>
        <p style="color: #6b7280; font-size: 12px;">
          Este email fue enviado automáticamente por el CRM de Mimi Alfajores.
        </p>
      </div>
    `

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'CRM Mimi Alfajores <noreply@mimi.com.ar>',
      to: admins.map((a) => a.email),
      subject: `[Mimi CRM] ${alertas.length} alerta${alertas.length !== 1 ? 's' : ''} — ${format(new Date(), 'dd/MM/yyyy')}`,
      html: htmlBody,
    })

    return NextResponse.json({ message: 'Alertas enviadas', count: alertas.length, sent: true })
  } catch (err) {
    console.error('[jobs/alertas]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
