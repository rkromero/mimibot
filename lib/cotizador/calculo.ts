import { ValidationError } from '@/lib/errors'

// Motor de cálculo del cotizador. Función pura: no toca la base; recibe un
// snapshot de parámetros (ver lib/cotizador/snapshot.ts) y devuelve el
// desglose. Todos los pct son porcentajes (35 = 35%), no fracciones.

export const IVA_PCT = 21

// Versión de la fórmula congelada en cada snapshot:
//  - v1 (snapshots viejos, sin el campo): markup sobre costo → costo × (1 + m)
//  - v2: margen sobre venta → costo / (1 − m), con la bobina dentro del costo
//  - v3 (snapshots nuevos): margen sobre venta con la bobina como costo
//    pass-through — se suma entera al final, sin margen ni descuentos
// Las ramas conviven porque los snapshots guardados deben reproducirse
// idénticos; reinterpretarlos con otra fórmula cambiaría importes ya cotizados.
export const COTIZADOR_FORMULA_VERSION = 3

export type PackagingCotizacion = 'cristal' | 'personalizado'

export type EscalonSnapshot = {
  cantidadMin: number
  /** null = sin tope (escalón abierto) */
  cantidadMax: number | null
  descuentoPct: number
}

export type RecetaSnapshotItem = {
  gramos: number
  precioPorKg: number
}

export type CotizadorSnapshot = {
  /** Ausente en snapshots viejos = v1 (markup); ver COTIZADOR_FORMULA_VERSION */
  formulaVersion?: number
  /** v2: margen sobre venta (0 ≤ x < 100); v1: markup sobre costo */
  margenPct: number
  cargoSetupPersonalizado: number
  alfajoresPorCaja: number
  /** Tope del descuento manual; superarlo no frena el cálculo, pero la
   *  propuesta nace en pendiente_aprobacion (lo decide la capa de negocio) */
  topeDescuentoPct: number
  /** Días de vigencia de la propuesta desde su creación */
  validezDias: number
  /** Texto de condiciones comerciales; no participa del cálculo, pero viaja
   *  en el snapshot para que el PDF lo renderice congelado */
  condicionesComerciales: string | null
  /** Cláusula extra congelada que el PDF agrega solo si el packaging es
   *  personalizado; tampoco participa del cálculo */
  condicionesPackagingPersonalizado: string | null
  /** Precio de la bobina por alfajor. Solo entra al costo con packaging
   *  cristal: en personalizado la bobina la provee el cliente */
  precioBobinaUnit: number
  /** Precio de la caja (se prorratea por alfajoresPorCaja) */
  precioCajaUnit: number
  /** Componentes de cada receta activa, por gramaje */
  recetas: Record<number, RecetaSnapshotItem[]>
  escalones: EscalonSnapshot[]
}

export type CotizacionInput = {
  cantidad: number
  gramaje: number
  packaging: PackagingCotizacion
  descuentoManualPct: number
}

export type CotizacionDesglose = {
  costoInsumosUnitario: number
  precioUnitNeto: number
  escalonAplicado: EscalonSnapshot | null
  neto: number
  setup: number
  iva: number
  total: number
}

// Redondeo a 2 decimales de un único valor ya calculado con precisión
// completa. EPSILON compensa representaciones como 1.005 → 1.00499999.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function buscarEscalon(
  escalones: EscalonSnapshot[],
  cantidad: number,
): EscalonSnapshot | null {
  return (
    escalones.find(
      (e) => cantidad >= e.cantidadMin && (e.cantidadMax === null || cantidad <= e.cantidadMax),
    ) ?? null
  )
}

export function calcularCotizacion(
  input: CotizacionInput,
  snapshot: CotizadorSnapshot,
): CotizacionDesglose {
  const { cantidad, gramaje, packaging, descuentoManualPct } = input

  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new ValidationError('La cantidad debe ser un entero mayor a 0')
  }
  if (descuentoManualPct < 0 || descuentoManualPct > 100) {
    throw new ValidationError('El descuento manual debe estar entre 0 y 100')
  }
  if (snapshot.alfajoresPorCaja <= 0) {
    throw new ValidationError('alfajoresPorCaja debe ser mayor a 0')
  }

  const items = snapshot.recetas[gramaje]
  if (!items || items.length === 0) {
    throw new ValidationError(`No hay receta activa para el gramaje de ${gramaje} g`)
  }

  // El costo unitario se calcula con precisión completa, pero el precio
  // unitario se redondea a 2 decimales ANTES de multiplicar: el documento
  // tiene que cerrar si el cliente hace precioUnit × cantidad a mano.
  const costoComponentes = items.reduce(
    (acc, item) => acc + item.gramos * (item.precioPorKg / 1000),
    0,
  )
  const costoCaja = snapshot.precioCajaUnit / snapshot.alfajoresPorCaja
  // Con packaging personalizado la bobina la provee el cliente: no es costo
  const bobinaUnit = packaging === 'cristal' ? snapshot.precioBobinaUnit : 0

  const escalonAplicado = buscarEscalon(snapshot.escalones, cantidad)
  const descEscalonPct = escalonAplicado?.descuentoPct ?? 0

  // Cada snapshot se reproduce con la fórmula de su versión (ver comentario
  // de COTIZADOR_FORMULA_VERSION): los importes ya cotizados no cambian.
  const version = snapshot.formulaVersion ?? 1
  const usaMargenSobreVenta = version >= 2
  if (usaMargenSobreVenta && snapshot.margenPct >= 100) {
    throw new ValidationError('El margen sobre venta debe ser menor a 100% (100% divide por cero)')
  }
  const factorMargen = usaMargenSobreVenta
    ? 1 / (1 - snapshot.margenPct / 100)
    : 1 + snapshot.margenPct / 100
  const factorDescuentos = (1 - descEscalonPct / 100) * (1 - descuentoManualPct / 100)

  let costoInsumosUnitario: number
  let precioUnitNeto: number
  if (version >= 3) {
    // v3: la bobina es pass-through — fuera de la base del margen y sin
    // descuentos, se suma entera al final. El costo reportado (para los
    // internos de rentabilidad) sí es el completo: base + bobina.
    const costoBase = costoComponentes + costoCaja
    costoInsumosUnitario = costoBase + bobinaUnit
    precioUnitNeto = round2(costoBase * factorMargen * factorDescuentos + bobinaUnit)
  } else {
    // v1/v2: la bobina forma parte del costo, margen y descuentos la afectan
    costoInsumosUnitario = costoComponentes + bobinaUnit + costoCaja
    precioUnitNeto = round2(costoInsumosUnitario * factorMargen * factorDescuentos)
  }

  const setup = round2(packaging === 'personalizado' ? snapshot.cargoSetupPersonalizado : 0)
  // precioUnitNeto y setup ya tienen 2 decimales y cantidad es entera: el
  // round2 solo normaliza la representación binaria del float, no el valor.
  const neto = round2(precioUnitNeto * cantidad + setup)
  const iva = round2(neto * (IVA_PCT / 100))

  return {
    costoInsumosUnitario: round2(costoInsumosUnitario),
    precioUnitNeto,
    escalonAplicado,
    neto,
    setup,
    iva,
    total: round2(neto + iva),
  }
}
