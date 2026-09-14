import { eq, inArray, type SQL } from 'drizzle-orm'
import { clientes, leads } from '@/db/schema'
import type { SessionContext } from '@/lib/territorios/context'
import { esRolVentas } from '@/lib/authz/roles'

export const ENTIDADES_EXPORT = ['clientes', 'pedidos', 'productos', 'leads', 'morosos', 'stock'] as const
export type EntidadExport = (typeof ENTIDADES_EXPORT)[number]

export function esEntidadExport(value: string): value is EntidadExport {
  return (ENTIDADES_EXPORT as readonly string[]).includes(value)
}

/**
 * Entidades que exponen la cartera (padrón con CUIT y teléfono, pedidos,
 * leads, deuda). Se exportan con el mismo alcance que sus listados:
 * ventas sólo lo suyo, gerente sus territorios, admin todo. Los roles de
 * fábrica y reparto no las exportan.
 *
 * `productos` y `stock` no entran acá: su alcance es por marca y lo aplica
 * el handler con `marcaVisibleFilter`.
 */
const ENTIDADES_CARTERA: ReadonlySet<EntidadExport> = new Set(['clientes', 'pedidos', 'leads', 'morosos'])

export type ExportScope =
  /** El rol no puede exportar esta entidad (403). */
  | { kind: 'denegado' }
  /** Rol comercial sin territorios/agentes: CSV sólo con encabezado. */
  | { kind: 'vacio' }
  /** Condiciones a sumar al WHERE. `undefined` = sin restricción. */
  | { kind: 'ok'; clienteCond?: SQL; leadCond?: SQL }

export function resolverScopeExport(ctx: SessionContext, entidad: EntidadExport): ExportScope {
  if (!ENTIDADES_CARTERA.has(entidad)) return { kind: 'ok' }
  if (ctx.role === 'admin') return { kind: 'ok' }

  if (esRolVentas(ctx.role)) {
    return {
      kind: 'ok',
      clienteCond: eq(clientes.asignadoA, ctx.userId),
      leadCond: eq(leads.assignedTo, ctx.userId),
    }
  }

  if (ctx.role === 'gerente') {
    if (entidad === 'leads') {
      if (ctx.agentesVisibles.length === 0) return { kind: 'vacio' }
      return { kind: 'ok', leadCond: inArray(leads.assignedTo, ctx.agentesVisibles) }
    }
    if (ctx.territoriosGestionados.length === 0) return { kind: 'vacio' }
    return { kind: 'ok', clienteCond: inArray(clientes.territorioId, ctx.territoriosGestionados) }
  }

  // fabrica, repartidor, distribucion
  return { kind: 'denegado' }
}
