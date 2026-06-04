import { eq, and, isNull, asc, desc, inArray, sql } from 'drizzle-orm'
import { differenceInDays } from 'date-fns'
import { db } from '@/db'
import { clientes, pedidos, businessConfig } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BusinessConfigRow = typeof businessConfig.$inferSelect

// ─── Business Config ──────────────────────────────────────────────────────────

export async function getBusinessConfig(): Promise<BusinessConfigRow> {
  const existing = await db.query.businessConfig.findFirst({
    where: eq(businessConfig.id, 1),
  })

  if (existing) return existing

  // Upsert default row if missing
  const [inserted] = await db
    .insert(businessConfig)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning()

  if (inserted) return inserted

  // Row was inserted by a concurrent call — fetch it
  const row = await db.query.businessConfig.findFirst({
    where: eq(businessConfig.id, 1),
  })

  if (!row) throw new Error('[actividad.service] businessConfig row not found after upsert')

  return row
}

// ─── Estado de Actividad ──────────────────────────────────────────────────────

export async function calcularEstadoActividad(
  clienteId: string,
  config?: BusinessConfigRow,
): Promise<'activo' | 'inactivo' | 'perdido' | null> {
  const cfg = config ?? (await getBusinessConfig())

  const mostRecentPedido = await db.query.pedidos.findFirst({
    where: and(
      eq(pedidos.clienteId, clienteId),
      eq(pedidos.estado, 'confirmado'),
      isNull(pedidos.deletedAt),
    ),
    columns: { fecha: true },
    orderBy: [desc(pedidos.fecha)],
  })

  if (!mostRecentPedido) return null

  const daysSinceLast = differenceInDays(new Date(), mostRecentPedido.fecha)

  if (daysSinceLast < cfg.clienteActivoDias) return 'activo'
  if (daysSinceLast < cfg.clientePerdidoDias) return 'inactivo'
  return 'perdido'
}

// ─── Evaluación de Cliente Nuevo ──────────────────────────────────────────────

export async function evaluarClienteNuevo(
  clienteId: string,
  config?: BusinessConfigRow,
): Promise<void> {
  const cfg = config ?? (await getBusinessConfig())

  // 1. Load the client to check if conversion was already recorded
  const cliente = await db.query.clientes.findFirst({
    where: and(eq(clientes.id, clienteId), isNull(clientes.deletedAt)),
    columns: {
      id: true,
      fechaConversionANuevo: true,
      asignadoA: true,
    },
  })

  if (!cliente) return

  // If already converted, nothing to do
  if (cliente.fechaConversionANuevo !== null) return

  const minPedidos = cfg.clienteNuevoMinPedidos

  // 2. Load confirmed AND paid pedidos ordered by fecha ASC
  // Only fully paid orders count toward the "nuevo" conversion threshold
  const pedidosConfirmados = await db.query.pedidos.findMany({
    where: and(
      eq(pedidos.clienteId, clienteId),
      eq(pedidos.estado, 'confirmado'),
      inArray(pedidos.estadoPago, ['pagado', 'parcial']),
      isNull(pedidos.deletedAt),
    ),
    columns: { id: true, fecha: true, total: true, montoPagado: true },
    orderBy: [asc(pedidos.fecha)],
  })

  // 3. Not enough orders yet
  if (pedidosConfirmados.length < minPedidos) return

  // 4. Take the first N pedidos
  const firstN = pedidosConfirmados.slice(0, minPedidos)
  const firstFecha = firstN[0]!.fecha
  const nthFecha = firstN[minPedidos - 1]!.fecha

  const windowDays = differenceInDays(nthFecha, firstFecha)

  // 5. Check if they fall within the ventana
  if (windowDays > cfg.clienteNuevoVentanaDias) return

  // 6. Optional: check monto minimo if configured
  if (cfg.clienteNuevoMontoMinimo !== null) {
    const montoMinimo = parseFloat(cfg.clienteNuevoMontoMinimo)
    const totalSum = firstN.reduce((sum, p) => sum + parseFloat(p.total), 0)
    if (totalSum < montoMinimo) return
  }

  // 7. Mark the client as "nuevo" — use nthFecha as the conversion date
  await db
    .update(clientes)
    .set({
      fechaConversionANuevo: nthFecha,
      vendedorConversionId: cliente.asignadoA ?? null,
      estadoActividad: 'activo',
      updatedAt: new Date(),
    })
    .where(eq(clientes.id, clienteId))
}

// ─── Recalcular Estados (batch job) ──────────────────────────────────────────
// Single UPDATE...FROM (subquery) replaces N+1 pattern (1 query per client).
// Same business logic as calcularEstadoActividad; (CURRENT_DATE - fecha::date)
// matches differenceInDays() since both compute floor(diff_ms / ms_per_day).

export async function recalcularEstadosActividad(): Promise<{ updated: number }> {
  const cfg = await getBusinessConfig()

  const result = await db.execute<{ id: string }>(sql`
    WITH ultimo_pedido AS (
      SELECT cliente_id, MAX(fecha) AS ultima_fecha
      FROM pedidos
      WHERE estado = 'confirmado' AND deleted_at IS NULL
      GROUP BY cliente_id
    ),
    calc AS (
      SELECT
        c.id AS cliente_id,
        CASE
          WHEN (CURRENT_DATE - up.ultima_fecha::date) < ${cfg.clienteActivoDias}  THEN 'activo'
          WHEN (CURRENT_DATE - up.ultima_fecha::date) < ${cfg.clientePerdidoDias} THEN 'inactivo'
          ELSE 'perdido'
        END AS nuevo_estado
      FROM clientes c
      INNER JOIN ultimo_pedido up ON up.cliente_id = c.id
      WHERE c.deleted_at IS NULL
    )
    UPDATE clientes
    SET
      estado_actividad = calc.nuevo_estado::estado_actividad,
      updated_at       = NOW()
    FROM calc
    WHERE clientes.id = calc.cliente_id
      AND clientes.estado_actividad IS DISTINCT FROM calc.nuevo_estado::estado_actividad
    RETURNING clientes.id
  `)

  const rows = Array.isArray(result) ? result : Array.from(result as Iterable<{ id: string }>)
  return { updated: rows.length }
}

// ─── Recalcular Clientes Nuevos (backfill) ────────────────────────────────────
// One SELECT (with ROW_NUMBER) fetches all pedidos for all not-yet-converted
// clients; JS applies the same window/monto logic as evaluarClienteNuevo.

export async function recalcularClientesNuevos(): Promise<{ updated: number }> {
  const cfg = await getBusinessConfig()
  const minPedidos = cfg.clienteNuevoMinPedidos
  const ventana = cfg.clienteNuevoVentanaDias
  const montoMinimo = cfg.clienteNuevoMontoMinimo !== null ? parseFloat(cfg.clienteNuevoMontoMinimo) : null

  type PedidoRow = { cliente_id: string; asignado_a: string | null; rn: string | number; fecha: Date; total: string }

  const rawRows = await db.execute<PedidoRow>(sql`
    SELECT
      p.cliente_id,
      c.asignado_a,
      ROW_NUMBER() OVER (PARTITION BY p.cliente_id ORDER BY p.fecha ASC) AS rn,
      p.fecha,
      p.total
    FROM pedidos p
    INNER JOIN clientes c ON c.id = p.cliente_id
    WHERE p.estado      = 'confirmado'
      AND p.estado_pago IN ('pagado', 'parcial')
      AND p.deleted_at  IS NULL
      AND c.deleted_at  IS NULL
      AND c.fecha_conversion_a_nuevo IS NULL
    ORDER BY p.cliente_id, p.fecha ASC
  `)

  const rows = Array.from(rawRows as Iterable<PedidoRow>)

  // Group by cliente_id
  type Entry = { asignadoA: string | null; pedidos: Array<{ rn: number; fecha: Date; total: string }> }
  const map = new Map<string, Entry>()
  for (const row of rows) {
    if (!map.has(row.cliente_id)) map.set(row.cliente_id, { asignadoA: row.asignado_a, pedidos: [] })
    map.get(row.cliente_id)!.pedidos.push({ rn: Number(row.rn), fecha: new Date(row.fecha), total: row.total })
  }

  // Apply same business logic as evaluarClienteNuevo
  const conversiones: Array<{ clienteId: string; fecha: Date; asignadoA: string | null }> = []

  for (const [clienteId, { asignadoA, pedidos: clientePedidos }] of map) {
    if (clientePedidos.length < minPedidos) continue

    const firstN = clientePedidos.filter((p) => p.rn <= minPedidos)
    if (firstN.length < minPedidos) continue

    const firstFecha = firstN[0]!.fecha
    const nthFecha = firstN[minPedidos - 1]!.fecha
    const windowDays = differenceInDays(nthFecha, firstFecha)
    if (windowDays > ventana) continue

    if (montoMinimo !== null) {
      const totalSum = firstN.reduce((sum, p) => sum + parseFloat(p.total), 0)
      if (totalSum < montoMinimo) continue
    }

    conversiones.push({ clienteId, fecha: nthFecha, asignadoA })
  }

  for (const conv of conversiones) {
    await db.update(clientes).set({
      fechaConversionANuevo: conv.fecha,
      vendedorConversionId: conv.asignadoA,
      estadoActividad: 'activo',
      updatedAt: new Date(),
    }).where(eq(clientes.id, conv.clienteId))
  }

  return { updated: conversiones.length }
}
