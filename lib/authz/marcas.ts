import { eq, and, or, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { marcas, usuarioMarcas, productos } from '@/db/schema'
import { AuthzError } from '@/lib/errors'
import type { Session } from 'next-auth'

type SessionUser = Session['user']

/**
 * Autorización de visibilidad de marcas.
 *
 * El conjunto de marcas que un usuario puede VER coincide con el que puede usar
 * para CARGAR PEDIDOS (ver comentario de `usuario_marcas` en el schema). Por eso
 * un único helper, `getMarcasVisibles`, sirve para ambos casos.
 *
 * Reglas:
 *  - admin / gerente / fabrica: ven TODAS las marcas (alcance global).
 *  - repartidor: por ahora también ve TODAS las marcas.
 *    TODO: definir la visibilidad de marcas del repartidor en una fase posterior
 *    (probablemente acotada a las marcas que efectivamente reparte).
 *  - agent / vendedor / rtv: la marca por defecto (Mimi, esDefault=true) + las
 *    asignadas explícitamente en `usuario_marcas`.
 */

/** ¿El rol ve TODAS las marcas, sin filtro? */
export function veTodasLasMarcas(role: string | null | undefined): boolean {
  // repartidor incluido a propósito (TODO: acotar en fase posterior).
  return (
    role === 'admin' ||
    role === 'gerente' ||
    role === 'fabrica' ||
    role === 'repartidor'
  )
}

/**
 * IDs de marcas que el usuario puede ver (= puede cargar en pedidos).
 *
 * Para roles con acceso total devuelve TODAS las marcas, de modo que los callers
 * puedan razonar de forma uniforme. Para evitar listas `IN (...)` gigantes en
 * consultas SQL de esos roles, preferí `marcaVisibleFilter`, que devuelve
 * `undefined` (sin filtro) en vez de la lista completa.
 */
export async function getMarcasVisibles(user: SessionUser): Promise<string[]> {
  if (veTodasLasMarcas(user.role)) {
    const rows = await db.select({ id: marcas.id }).from(marcas)
    return rows.map((r) => r.id)
  }

  // Ventas (agent/vendedor/rtv): default (Mimi) + asignadas en usuario_marcas.
  const rows = await db
    .select({ id: marcas.id })
    .from(marcas)
    .leftJoin(
      usuarioMarcas,
      and(eq(usuarioMarcas.marcaId, marcas.id), eq(usuarioMarcas.usuarioId, user.id)),
    )
    .where(or(eq(marcas.esDefault, true), isNotNull(usuarioMarcas.usuarioId)))

  return rows.map((r) => r.id)
}

/**
 * Condición Drizzle para limitar una consulta de `productos` a las marcas que el
 * usuario puede ver. Devuelve `undefined` para roles con acceso total (no se
 * filtra), o `productos.marcaId IN (visibles)` para roles de ventas.
 *
 * Si el usuario de ventas no tuviera ninguna marca visible, devuelve una
 * condición siempre falsa (no ve ningún producto), que es el default seguro.
 */
export async function marcaVisibleFilter(user: SessionUser): Promise<SQL | undefined> {
  if (veTodasLasMarcas(user.role)) return undefined
  const ids = await getMarcasVisibles(user)
  if (ids.length === 0) return sql`false`
  return inArray(productos.marcaId, ids)
}

/**
 * Lanza AuthzError (403) si el usuario no puede ver la marca indicada.
 */
export async function assertPuedeVerMarca(user: SessionUser, marcaId: string): Promise<void> {
  if (veTodasLasMarcas(user.role)) return
  const ids = await getMarcasVisibles(user)
  if (!ids.includes(marcaId)) {
    throw new AuthzError('No tenés acceso a esta marca')
  }
}

/**
 * Valida que TODOS los productos indicados pertenezcan a una marca habilitada
 * para que el usuario cargue pedidos (= sus marcas visibles). Lanza AuthzError
 * (403) si alguno pertenece a una marca no habilitada.
 *
 * Los productos inexistentes se ignoran acá (la validación de existencia la hace
 * el servicio de pedidos); este helper sólo se ocupa de la marca.
 */
export async function assertPuedeCargarProductos(
  user: SessionUser,
  productoIds: string[],
): Promise<void> {
  if (veTodasLasMarcas(user.role)) return
  if (productoIds.length === 0) return

  const uniqueIds = Array.from(new Set(productoIds))
  const [rows, visibles] = await Promise.all([
    db
      .select({ id: productos.id, marcaId: productos.marcaId })
      .from(productos)
      .where(inArray(productos.id, uniqueIds)),
    getMarcasVisibles(user),
  ])

  const visiblesSet = new Set(visibles)
  for (const row of rows) {
    if (!visiblesSet.has(row.marcaId)) {
      throw new AuthzError('No podés cargar productos de una marca que no tenés habilitada')
    }
  }
}
