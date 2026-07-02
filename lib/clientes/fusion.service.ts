import { eq, and, isNull, sql } from 'drizzle-orm'
import { db, type Db } from '@/db'
import {
  clientes,
  pedidos,
  movimientosCC,
  actividadesCliente,
  historialTeritorioCliente,
  conversations,
  messages,
} from '@/db/schema'
import { ValidationError, NotFoundError } from '@/lib/errors'
import { reconciliarCuentaCliente } from '@/lib/cuenta-corriente/pago.service'

export type FusionResumen = {
  pedidos: number
  movimientosCC: number
  actividades: number
  historialTerritorio: number
  mensajesMovidos: number
  conversacionMovida: boolean
  leadCopiado: boolean
  aplicacionesCreadas: number
}

export type FusionPreview = {
  pedidos: number
  movimientosCC: number
  actividades: number
  historialTerritorio: number
  tieneConversacion: boolean
}

// Conteo de lo que se movería al fusionar (para el resumen previo del modal).
// pedidos/movimientos cuentan solo activos, que es lo que el usuario ve.
export async function resumenFusion(sourceId: string): Promise<FusionPreview> {
  const count = sql<number>`count(*)::int`

  const [pedidosRow] = await db
    .select({ n: count })
    .from(pedidos)
    .where(and(eq(pedidos.clienteId, sourceId), isNull(pedidos.deletedAt)))
  const [movimientosRow] = await db
    .select({ n: count })
    .from(movimientosCC)
    .where(and(eq(movimientosCC.clienteId, sourceId), isNull(movimientosCC.deletedAt)))
  const [actividadesRow] = await db
    .select({ n: count })
    .from(actividadesCliente)
    .where(eq(actividadesCliente.clienteId, sourceId))
  const [historialRow] = await db
    .select({ n: count })
    .from(historialTeritorioCliente)
    .where(eq(historialTeritorioCliente.clienteId, sourceId))
  const conversacion = await db.query.conversations.findFirst({
    where: eq(conversations.clienteId, sourceId),
    columns: { id: true },
  })

  return {
    pedidos: pedidosRow?.n ?? 0,
    movimientosCC: movimientosRow?.n ?? 0,
    actividades: actividadesRow?.n ?? 0,
    historialTerritorio: historialRow?.n ?? 0,
    tieneConversacion: Boolean(conversacion),
  }
}

// Fusiona el cliente source dentro del target (la base que se conserva):
// repunta pedidos, cuenta corriente, actividades e historial de territorio,
// resuelve la conversación (índice único parcial por clienteId), reconcilia la
// cuenta corriente unificada (imputación FIFO de créditos disponibles a pedidos
// pendientes) y deja el source soft-deleted. Todo en una única transacción.
export async function fusionarClientes(targetId: string, sourceId: string): Promise<FusionResumen> {
  if (targetId === sourceId) {
    throw new ValidationError('El cliente base y el cliente a fusionar deben ser distintos')
  }

  const target = await db.query.clientes.findFirst({
    where: and(eq(clientes.id, targetId), isNull(clientes.deletedAt)),
    columns: { id: true, leadId: true },
  })
  if (!target) throw new NotFoundError('Cliente base')

  const source = await db.query.clientes.findFirst({
    where: and(eq(clientes.id, sourceId), isNull(clientes.deletedAt)),
    columns: { id: true, leadId: true },
  })
  if (!source) throw new NotFoundError('Cliente a fusionar')

  return db.transaction(async (tx) => {
    // 1. Repuntar referencias de source → target. Sin filtrar deletedAt: también
    //    las filas soft-deleted pasan a la base para que nada quede colgando del
    //    cliente dado de baja. El repunte solo mueve filas: un crédito con saldo
    //    disponible de un cliente NO se imputa solo al pedido pendiente del otro;
    //    eso lo resuelve la reconciliación FIFO del paso 5.
    const pedidosMovidos = await tx
      .update(pedidos)
      .set({ clienteId: targetId, updatedAt: new Date() })
      .where(eq(pedidos.clienteId, sourceId))
      .returning({ id: pedidos.id })

    const movimientosMovidos = await tx
      .update(movimientosCC)
      .set({ clienteId: targetId })
      .where(eq(movimientosCC.clienteId, sourceId))
      .returning({ id: movimientosCC.id })

    const actividadesMovidas = await tx
      .update(actividadesCliente)
      .set({ clienteId: targetId, updatedAt: new Date() })
      .where(eq(actividadesCliente.clienteId, sourceId))
      .returning({ id: actividadesCliente.id })

    const historialMovido = await tx
      .update(historialTeritorioCliente)
      .set({ clienteId: targetId })
      .where(eq(historialTeritorioCliente.clienteId, sourceId))
      .returning({ id: historialTeritorioCliente.id })

    // 2. Conversaciones: índice único parcial por clienteId (un cliente = una
    //    conversación). Si el target no tiene, se repunta la de source; si ambos
    //    tienen, se mueven los mensajes a la del target y la de source queda con
    //    clienteId = null para no violar el único.
    let mensajesMovidos = 0
    let conversacionMovida = false

    const convSource = await tx.query.conversations.findFirst({
      where: eq(conversations.clienteId, sourceId),
      columns: { id: true, lastMessageAt: true, unreadCount: true },
    })
    if (convSource) {
      const convTarget = await tx.query.conversations.findFirst({
        where: eq(conversations.clienteId, targetId),
        columns: { id: true, lastMessageAt: true, unreadCount: true },
      })

      if (!convTarget) {
        await tx
          .update(conversations)
          .set({ clienteId: targetId, updatedAt: new Date() })
          .where(eq(conversations.id, convSource.id))
        conversacionMovida = true
      } else {
        const movidos = await tx
          .update(messages)
          .set({ conversationId: convTarget.id })
          .where(eq(messages.conversationId, convSource.id))
          .returning({ id: messages.id })
        mensajesMovidos = movidos.length

        // La conversación del target absorbe el estado de bandeja de la otra
        const lastMessageAt =
          convSource.lastMessageAt && convTarget.lastMessageAt
            ? (convSource.lastMessageAt > convTarget.lastMessageAt ? convSource.lastMessageAt : convTarget.lastMessageAt)
            : (convSource.lastMessageAt ?? convTarget.lastMessageAt)
        await tx
          .update(conversations)
          .set({
            lastMessageAt,
            unreadCount: convTarget.unreadCount + convSource.unreadCount,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, convTarget.id))

        await tx
          .update(conversations)
          .set({ clienteId: null, updatedAt: new Date() })
          .where(eq(conversations.id, convSource.id))
      }
    }

    // 3. leadId: si el target no tiene y el source sí, se copia. El source lo
    //    pierde para que el lead quede con un único dueño (un purge posterior
    //    del duplicado no debe arrastrar el lead que ahora es de la base).
    const leadCopiado = !target.leadId && Boolean(source.leadId)
    if (leadCopiado) {
      await tx
        .update(clientes)
        .set({ leadId: source.leadId, updatedAt: new Date() })
        .where(eq(clientes.id, targetId))
    }

    // 4. Soft-delete del source
    await tx
      .update(clientes)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(leadCopiado ? { leadId: null } : {}),
      })
      .where(eq(clientes.id, sourceId))

    // 5. Reconciliar la cuenta corriente unificada: tras el repunte, un crédito
    //    con saldo disponible que era de un cliente puede cubrir un pedido
    //    pendiente del otro. Imputa FIFO y recalcula estadoPago dentro de la
    //    misma transacción — si falla, la fusión entera se revierte.
    const aplicacionesCreadas = await reconciliarCuentaCliente(tx as unknown as Db, targetId)

    return {
      pedidos: pedidosMovidos.length,
      movimientosCC: movimientosMovidos.length,
      actividades: actividadesMovidas.length,
      historialTerritorio: historialMovido.length,
      mensajesMovidos,
      conversacionMovida,
      leadCopiado,
      aplicacionesCreadas: aplicacionesCreadas.length,
    }
  })
}
