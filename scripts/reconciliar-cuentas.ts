/**
 * Reconciliación FIFO de cuentas corrientes: imputa los créditos con saldo
 * disponible a los pedidos con saldo pendiente, cliente por cliente.
 *
 * Repara los clientes que quedaron inconsistentes tras fusiones hechas antes
 * de que fusionarClientes() reconciliara la cuenta (saldo CC $0,00 con pedidos
 * "parcial"/"impago" cuyo crédito estaba disponible sin imputar).
 *
 * Toda la escritura pasa por reconciliarCuentaCliente() / recalcularPagosPedido():
 * el script no modifica pedidos ni movimientos directamente. Es idempotente:
 * una segunda corrida no crea aplicaciones ni cambia montos.
 *
 * Uso:
 *   npx tsx scripts/reconciliar-cuentas.ts            → aplica los cambios
 *   npx tsx scripts/reconciliar-cuentas.ts --dry-run  → solo reporta (rollback)
 */

import 'dotenv/config'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { clientes, pedidos, movimientosCC } from '@/db/schema'
import {
  reconciliarCuentaCliente,
  type AplicacionReconciliacion,
} from '@/lib/cuenta-corriente/pago.service'

const DRY_RUN = process.argv.includes('--dry-run')

// En dry-run la reconciliación corre igual (para reportar lo que haría) pero
// dentro de una transacción que se aborta con esta señal: rollback garantizado,
// cero escritura en la base.
class DryRunRollback extends Error {
  constructor(public aplicaciones: AplicacionReconciliacion[]) {
    super('dry-run rollback')
    this.name = 'DryRunRollback'
  }
}

// Cliente con al menos un crédito activo cuyo monto supera la suma de sus
// aplicaciones vivas (mismo cómputo de "disponible" que usa la reconciliación).
async function tieneCreditoDisponible(clienteId: string): Promise<boolean> {
  const creditos = await db.query.movimientosCC.findMany({
    where: and(
      eq(movimientosCC.clienteId, clienteId),
      eq(movimientosCC.tipo, 'credito'),
      isNull(movimientosCC.deletedAt),
    ),
    columns: { id: true, monto: true },
    with: {
      aplicaciones: {
        columns: { montoAplicado: true },
        where: (a, ops) => ops.isNull(a.deletedAt),
      },
    },
  })

  return creditos.some((c) => {
    const aplicado = (c.aplicaciones ?? []).reduce(
      (sum, a) => sum + parseFloat(a.montoAplicado),
      0,
    )
    return parseFloat(c.monto) - aplicado > 0.0001
  })
}

async function main() {
  console.log(`\n=== Reconciliar cuentas — modo: ${DRY_RUN ? 'DRY-RUN (sin cambios)' : 'APPLY'} ===\n`)

  // (a) Clientes activos con al menos un pedido activo con saldo pendiente
  const candidatos = await db
    .selectDistinct({ id: clientes.id, nombre: clientes.nombre, apellido: clientes.apellido })
    .from(clientes)
    .innerJoin(pedidos, eq(pedidos.clienteId, clientes.id))
    .where(and(
      isNull(clientes.deletedAt),
      isNull(pedidos.deletedAt),
      gt(pedidos.saldoPendiente, '0'),
    ))

  console.log(`Clientes con pedidos pendientes: ${candidatos.length}`)

  let procesados = 0
  let aplicacionesTotales = 0

  for (const cliente of candidatos) {
    // (b) ...que además tengan crédito activo con disponible > 0
    if (!(await tieneCreditoDisponible(cliente.id))) continue

    let aplicaciones: AplicacionReconciliacion[] = []
    if (DRY_RUN) {
      try {
        await db.transaction(async (tx) => {
          const result = await reconciliarCuentaCliente(tx as unknown as Db, cliente.id)
          throw new DryRunRollback(result)
        })
      } catch (err) {
        if (!(err instanceof DryRunRollback)) throw err
        aplicaciones = err.aplicaciones
      }
    } else {
      aplicaciones = await db.transaction(async (tx) =>
        reconciliarCuentaCliente(tx as unknown as Db, cliente.id),
      )
    }

    procesados++
    aplicacionesTotales += aplicaciones.length
    const pedidosAfectados = new Set(aplicaciones.map((a) => a.pedidoId))

    const nombre = `${cliente.nombre} ${cliente.apellido ?? ''}`.trim()
    console.log(
      `  ${DRY_RUN ? '○' : '✔'} cliente=${cliente.id} (${nombre}): ` +
      `${aplicaciones.length} aplicaciones${DRY_RUN ? ' (simuladas)' : ''}, ` +
      `${pedidosAfectados.size} pedidos afectados`,
    )
    for (const ap of aplicaciones) {
      console.log(`      credito=${ap.movimientoCreditoId} → pedido=${ap.pedidoId}: $${ap.montoAplicado}`)
    }
  }

  console.log(
    `\n${DRY_RUN ? 'ℹ️  DRY-RUN: no se escribió nada.' : '✅  Listo.'} ` +
    `Clientes procesados: ${procesados} de ${candidatos.length} candidatos. ` +
    `Aplicaciones ${DRY_RUN ? 'a crear' : 'creadas'}: ${aplicacionesTotales}.\n`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error fatal:', err)
    process.exit(1)
  })
