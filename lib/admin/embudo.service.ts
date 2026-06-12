import { db } from '@/db'
import { pedidos, territorioGerente, clientes, users } from '@/db/schema'
import { and, gte, lt, isNull, eq, inArray } from 'drizzle-orm'
import { startOfWeek, addDays, differenceInCalendarDays } from 'date-fns'
import { buildRankMap } from '@/lib/admin/dashboard.service'

export interface EmbudoStats {
  /** Clientes creados (no eliminados) en el rango. */
  aperturas: number
  /** De esos clientes, cuántos tienen ≥1 pedido no eliminado de cualquier fecha. */
  aperturasConPedido: number
  /** Pedidos del rango que son el 1er pedido del cliente en su historial global. */
  primerosPedidos: number
  /** Pedidos del rango cuyo rank en el historial global del cliente es ≥ 2. */
  recompras: number
  /** Clientes cuyo 3er pedido PAGADO cae en el rango (rank 3 entre pedidos pagados). */
  consolidados: number
}

export interface EmbudoParams {
  /** Inicio del rango (inclusivo). */
  desde: Date
  /** Fin del rango (exclusivo). */
  hasta: Date
  territorioId?: string
  gerenteId?: string
  vendedorId?: string
}

const ZERO_STATS: EmbudoStats = {
  aperturas: 0,
  aperturasConPedido: 0,
  primerosPedidos: 0,
  recompras: 0,
  consolidados: 0,
}

/**
 * Embudo de apertura: métricas de cohorte para un rango de fechas [desde, hasta)
 * con filtros opcionales por territorio, gerente y vendedor.
 *
 * El cálculo de rank (historial del cliente) es SIEMPRE global por cliente:
 * no se filtra por territorio ni vendedor. Solo los clientes/pedidos del rango
 * se filtran.
 */
export async function getEmbudo(params: EmbudoParams): Promise<EmbudoStats> {
  const { desde, hasta, territorioId, gerenteId, vendedorId } = params

  // ── Resolver el filtro de territorio (mismo patrón que getAdminDashboardStats) ──
  let territorioIds: string[] | null = null
  if (territorioId) {
    territorioIds = [territorioId]
  } else if (gerenteId) {
    const rows = await db
      .select({ territorioId: territorioGerente.territorioId })
      .from(territorioGerente)
      .where(eq(territorioGerente.gerenteId, gerenteId))
    if (rows.length === 0) return { ...ZERO_STATS }
    territorioIds = rows.map((r) => r.territorioId)
  }

  const territorioCondPedidos =
    territorioIds !== null
      ? territorioIds.length === 1
        ? eq(pedidos.territorioIdImputado, territorioIds[0]!)
        : inArray(pedidos.territorioIdImputado, territorioIds)
      : undefined

  const territorioCondClientes =
    territorioIds !== null
      ? territorioIds.length === 1
        ? eq(clientes.territorioId, territorioIds[0]!)
        : inArray(clientes.territorioId, territorioIds)
      : undefined

  const vendedorCondPedidos = vendedorId ? eq(pedidos.vendedorId, vendedorId) : undefined
  const vendedorCondClientes = vendedorId ? eq(clientes.creadoPor, vendedorId) : undefined

  // ── aperturas: clientes creados en el rango (no eliminados) ──
  const aperturaRows = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        gte(clientes.createdAt, desde),
        lt(clientes.createdAt, hasta),
        isNull(clientes.deletedAt),
        territorioCondClientes,
        vendedorCondClientes,
      ),
    )
  const aperturas = aperturaRows.length

  // ── aperturasConPedido: de esa cohorte, cuántos tienen ≥1 pedido (cualquier fecha) ──
  // Conversión de cohorte: el historial de pedidos no se filtra por territorio/vendedor;
  // el subconjunto de clientes ya está acotado por la cohorte de aperturas.
  let aperturasConPedido = 0
  if (aperturas > 0) {
    const aperturaIds = aperturaRows.map((c) => c.id)
    const conPedidoRows = await db
      .select({ clienteId: pedidos.clienteId })
      .from(pedidos)
      .where(and(inArray(pedidos.clienteId, aperturaIds), isNull(pedidos.deletedAt)))
    aperturasConPedido = new Set(conPedidoRows.map((r) => r.clienteId)).size
  }

  // ── pedidos del rango (no eliminados) con filtros de territorio/vendedor ──
  const pedidosRango = await db
    .select({
      id: pedidos.id,
      clienteId: pedidos.clienteId,
      fecha: pedidos.fecha,
      estadoPago: pedidos.estadoPago,
    })
    .from(pedidos)
    .where(
      and(
        gte(pedidos.fecha, desde),
        lt(pedidos.fecha, hasta),
        isNull(pedidos.deletedAt),
        territorioCondPedidos,
        vendedorCondPedidos,
      ),
    )

  let primerosPedidos = 0
  let recompras = 0
  let consolidados = 0

  if (pedidosRango.length > 0) {
    const cohorteIds = [...new Set(pedidosRango.map((p) => p.clienteId))]

    // Historial GLOBAL del cliente (sin filtro territorio/vendedor).
    const historial = await db
      .select({
        id: pedidos.id,
        clienteId: pedidos.clienteId,
        fecha: pedidos.fecha,
        estadoPago: pedidos.estadoPago,
      })
      .from(pedidos)
      .where(and(inArray(pedidos.clienteId, cohorteIds), isNull(pedidos.deletedAt)))

    // Rank entre TODOS los pedidos no eliminados → primerosPedidos / recompras.
    const rankMapTodos = buildRankMap(historial)
    // Rank entre pedidos PAGADOS no eliminados → consolidados (criterio "cliente nuevo").
    const rankMapPagados = buildRankMap(historial.filter((p) => p.estadoPago === 'pagado'))

    for (const p of pedidosRango) {
      const rank = rankMapTodos.get(p.id)
      if (rank === 1) primerosPedidos++
      else if (rank !== undefined && rank >= 2) recompras++

      if (p.estadoPago === 'pagado' && rankMapPagados.get(p.id) === 3) {
        consolidados++
      }
    }
  }

  return { aperturas, aperturasConPedido, primerosPedidos, recompras, consolidados }
}

// ─── Helpers compartidos (cohortes / riesgo) ──────────────────────────────────

type TerritorioFilter =
  | { kind: 'all' } // sin filtro de territorio
  | { kind: 'some'; ids: string[] } // territorios concretos
  | { kind: 'none' } // gerente sin territorios → resultado vacío

/**
 * Resuelve el filtro de territorio a partir de territorioId/gerenteId, con el
 * mismo criterio que getEmbudo: territorioId directo, o los territorios del
 * gerente (vacío ⇒ kind 'none').
 */
async function resolveTerritorioFilter(p: {
  territorioId?: string
  gerenteId?: string
}): Promise<TerritorioFilter> {
  if (p.territorioId) return { kind: 'some', ids: [p.territorioId] }
  if (p.gerenteId) {
    const rows = await db
      .select({ territorioId: territorioGerente.territorioId })
      .from(territorioGerente)
      .where(eq(territorioGerente.gerenteId, p.gerenteId))
    if (rows.length === 0) return { kind: 'none' }
    return { kind: 'some', ids: rows.map((r) => r.territorioId) }
  }
  return { kind: 'all' }
}

/** Condición WHERE sobre clientes.territorioId según el filtro resuelto. */
function clientesTerritorioCond(f: TerritorioFilter) {
  if (f.kind !== 'some') return undefined
  return f.ids.length === 1
    ? eq(clientes.territorioId, f.ids[0]!)
    : inArray(clientes.territorioId, f.ids)
}

/** Formatea una fecha como YYYY-MM-DD usando sus componentes locales. */
function ymd(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ─── Cohortes semanales ───────────────────────────────────────────────────────

export interface CohorteSemanal {
  /** Lunes de la semana (YYYY-MM-DD). */
  semanaInicio: string
  /** Clientes creados (no eliminados) esa semana. */
  creados: number
  /** De esos, cuántos tienen ≥1 pedido no eliminado de cualquier fecha. */
  conPedido: number
}

export interface CohortesParams {
  semanas: number
  territorioId?: string
  gerenteId?: string
  vendedorId?: string
}

/**
 * Conversión por cohorte de las últimas N semanas (lunes a domingo, incluida la
 * actual). Cada cliente se imputa a la semana de su CREACIÓN; conPedido cuenta
 * los que tienen al menos un pedido no eliminado de cualquier fecha.
 */
export async function getCohortesSemanales(params: CohortesParams): Promise<CohorteSemanal[]> {
  const { semanas, territorioId, gerenteId, vendedorId } = params
  const n = Math.max(1, Math.floor(semanas))

  // Lunes de las últimas N semanas (la actual al final).
  const mondayActual = startOfWeek(new Date(), { weekStartsOn: 1 })
  const mondays: Date[] = []
  for (let i = n - 1; i >= 0; i--) mondays.push(addDays(mondayActual, -7 * i))

  const desde = mondays[0]!
  const hasta = addDays(mondayActual, 7)

  const emptyResult = (): CohorteSemanal[] =>
    mondays.map((m) => ({ semanaInicio: ymd(m), creados: 0, conPedido: 0 }))

  const filtro = await resolveTerritorioFilter({ territorioId, gerenteId })
  if (filtro.kind === 'none') return emptyResult()

  const territorioCond = clientesTerritorioCond(filtro)
  const vendedorCond = vendedorId ? eq(clientes.creadoPor, vendedorId) : undefined

  const creadosRows = await db
    .select({ id: clientes.id, createdAt: clientes.createdAt })
    .from(clientes)
    .where(
      and(
        gte(clientes.createdAt, desde),
        lt(clientes.createdAt, hasta),
        isNull(clientes.deletedAt),
        territorioCond,
        vendedorCond,
      ),
    )

  const indexByMonday = new Map(mondays.map((m, i) => [ymd(m), i]))
  const creados = new Array<number>(n).fill(0)
  const conPedido = new Array<number>(n).fill(0)
  const idToWeek = new Map<string, number>()

  for (const c of creadosRows) {
    const wk = ymd(startOfWeek(c.createdAt, { weekStartsOn: 1 }))
    const idx = indexByMonday.get(wk)
    if (idx === undefined) continue
    creados[idx]!++
    idToWeek.set(c.id, idx)
  }

  if (creadosRows.length > 0) {
    const ids = creadosRows.map((c) => c.id)
    const conPedidoRows = await db
      .select({ clienteId: pedidos.clienteId })
      .from(pedidos)
      .where(and(inArray(pedidos.clienteId, ids), isNull(pedidos.deletedAt)))
    const conPedidoSet = new Set(conPedidoRows.map((r) => r.clienteId))
    for (const id of conPedidoSet) {
      const idx = idToWeek.get(id)
      if (idx !== undefined) conPedido[idx]!++
    }
  }

  return mondays.map((m, i) => ({
    semanaInicio: ymd(m),
    creados: creados[i]!,
    conPedido: conPedido[i]!,
  }))
}

// ─── Clientes en riesgo ───────────────────────────────────────────────────────

export interface ClienteEnRiesgo {
  id: string
  nombre: string
  apellido: string
  cantidadPedidos: number
  /** Fecha del último pedido (YYYY-MM-DD). */
  fechaUltimoPedido: string
  diasSinPedido: number
  vendedorNombre: string | null
}

export interface RiesgoParams {
  diasSinPedido: number
  territorioId?: string
  gerenteId?: string
  vendedorId?: string
}

const RIESGO_LIMIT = 50

/**
 * Clientes en riesgo: no eliminados, con 1 o 2 pedidos no eliminados EN TOTAL
 * (historial global por cliente), cuyo último pedido es de hace ≥ diasSinPedido.
 * Ordenados por días sin pedido descendente, limitados a 50.
 */
export async function getClientesEnRiesgo(params: RiesgoParams): Promise<ClienteEnRiesgo[]> {
  const { diasSinPedido: umbral, territorioId, gerenteId, vendedorId } = params

  const filtro = await resolveTerritorioFilter({ territorioId, gerenteId })
  if (filtro.kind === 'none') return []

  const territorioCond = clientesTerritorioCond(filtro)
  const vendedorCond = vendedorId ? eq(clientes.creadoPor, vendedorId) : undefined

  const candidatos = await db
    .select({
      id: clientes.id,
      nombre: clientes.nombre,
      apellido: clientes.apellido,
      asignadoA: clientes.asignadoA,
    })
    .from(clientes)
    .where(and(isNull(clientes.deletedAt), territorioCond, vendedorCond))

  if (candidatos.length === 0) return []

  const ids = candidatos.map((c) => c.id)
  const pedidoRows = await db
    .select({ clienteId: pedidos.clienteId, fecha: pedidos.fecha, vendedorId: pedidos.vendedorId })
    .from(pedidos)
    .where(and(inArray(pedidos.clienteId, ids), isNull(pedidos.deletedAt)))

  // Agregar por cliente: cantidad total + último pedido (fecha y su vendedor).
  type Agg = { count: number; ultimaFecha: Date | null; ultimoVendedorId: string | null }
  const agg = new Map<string, Agg>()
  for (const p of pedidoRows) {
    const a = agg.get(p.clienteId) ?? { count: 0, ultimaFecha: null, ultimoVendedorId: null }
    a.count++
    if (p.fecha && (!a.ultimaFecha || p.fecha.getTime() > a.ultimaFecha.getTime())) {
      a.ultimaFecha = p.fecha
      a.ultimoVendedorId = p.vendedorId
    }
    agg.set(p.clienteId, a)
  }

  const hoy = new Date()
  const filtrados = candidatos
    .map((c) => {
      const a = agg.get(c.id)
      if (!a || a.ultimaFecha === null) return null // 0 pedidos → no aplica
      if (a.count !== 1 && a.count !== 2) return null // solo 1 o 2 pedidos
      const dias = differenceInCalendarDays(hoy, a.ultimaFecha)
      if (dias < umbral) return null
      return {
        id: c.id,
        nombre: c.nombre,
        apellido: c.apellido,
        cantidadPedidos: a.count,
        ultimaFecha: a.ultimaFecha,
        diasSinPedido: dias,
        asignadoA: c.asignadoA,
        ultimoVendedorId: a.ultimoVendedorId,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.diasSinPedido - a.diasSinPedido)
    .slice(0, RIESGO_LIMIT)

  if (filtrados.length === 0) return []

  // Nombres de vendedor: vendedorId del último pedido, o asignadoA como fallback.
  const userIds = [
    ...new Set(
      filtrados.flatMap((r) => [r.ultimoVendedorId, r.asignadoA].filter((x): x is string => !!x)),
    ),
  ]
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds))
    for (const u of userRows) userMap.set(u.id, u.name ?? u.email)
  }

  return filtrados.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    apellido: r.apellido,
    cantidadPedidos: r.cantidadPedidos,
    fechaUltimoPedido: ymd(r.ultimaFecha),
    diasSinPedido: r.diasSinPedido,
    vendedorNombre:
      (r.ultimoVendedorId ? userMap.get(r.ultimoVendedorId) : undefined) ??
      (r.asignadoA ? userMap.get(r.asignadoA) : undefined) ??
      null,
  }))
}
