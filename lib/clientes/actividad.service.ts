import { eq, and, isNull, asc, desc, inArray } from 'drizzle-orm'
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

export async function recalcularEstadosActividad(): Promise<{ updated: number }> {
  const cfg = await getBusinessConfig()

  // Load all non-deleted clientes
  const todosClientes = await db.query.clientes.findMany({
    where: isNull(clientes.deletedAt),
    columns: { id: true },
  })

  let updated = 0

  // Process in batches of 50 to avoid overwhelming the DB
  const BATCH_SIZE = 50

  for (let i = 0; i < todosClientes.length; i += BATCH_SIZE) {
    const batch = todosClientes.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (cliente) => {
        const nuevoEstado = await calcularEstadoActividad(cliente.id, cfg)

        if (nuevoEstado === null) return

        await db
          .update(clientes)
          .set({
            estadoActividad: nuevoEstado,
            updatedAt: new Date(),
          })
          .where(eq(clientes.id, cliente.id))

        updated++
      }),
    )
  }

  return { updated }
}
