import { ValidationError } from '@/lib/errors'

// Motor de costos por receta. Funciones puras: no tocan la base. Lo van a
// consumir el cotizador y las listas de precios; la dependencia va en un solo
// sentido: lib/costos NO importa nada de lib/cotizador.

export type InsumoPrecio = {
  id: string
  nombre: string
  unidad: 'kg' | 'unidad'
  precio: number
}

export type RecetaCosto = {
  /** cantidad en GRAMOS para insumos por kg; en unidades para los de 'unidad' */
  items: { insumoId: string; cantidad: number }[]
  bobinaInsumoId: string | null
  cajaInsumoId: string | null
  alfajoresPorCaja: number
}

export type DesgloseCosto = {
  costoMateriaPrima: number
  costoPackaging: number
  costoUnitario: number
  /** Solo los items de la receta; el packaging va aparte en costoPackaging */
  detalle: { insumoId: string; nombre: string; cantidad: number; costo: number }[]
  /** Ids referenciados por la receta (items o packaging) que no están en el
   *  Map de precios (inactivos o inexistentes): se ignoran del costo y se
   *  reportan para que la UI pueda advertir */
  omitidos: string[]
}

// Redondeo a 2 decimales de un valor calculado con precisión completa.
// EPSILON compensa representaciones como 1.005 → 1.00499999.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Costo unitario de un alfajor según su receta. Precisión completa
// internamente; se redondea a 2 decimales recién al exponer cada campo.
export function calcularCostoUnitario(
  receta: RecetaCosto,
  precios: Map<string, InsumoPrecio>,
): DesgloseCosto {
  if (receta.alfajoresPorCaja <= 0) {
    throw new ValidationError('alfajoresPorCaja debe ser mayor a 0')
  }

  const omitidos: string[] = []
  const detalle: DesgloseCosto['detalle'] = []
  let costoMateriaPrima = 0

  for (const item of receta.items) {
    const insumo = precios.get(item.insumoId)
    if (!insumo) {
      omitidos.push(item.insumoId)
      continue
    }
    const costo = insumo.unidad === 'kg'
      ? (item.cantidad * insumo.precio) / 1000
      : item.cantidad * insumo.precio
    costoMateriaPrima += costo
    detalle.push({
      insumoId: insumo.id,
      nombre: insumo.nombre,
      cantidad: item.cantidad,
      costo: round2(costo),
    })
  }

  // Packaging: bloque separado de la receta. La bobina entra con su precio
  // entero por alfajor; la caja se prorratea por alfajoresPorCaja. Un
  // componente null vale 0.
  let costoPackaging = 0
  if (receta.bobinaInsumoId !== null) {
    const bobina = precios.get(receta.bobinaInsumoId)
    if (bobina) costoPackaging += bobina.precio
    else omitidos.push(receta.bobinaInsumoId)
  }
  if (receta.cajaInsumoId !== null) {
    const caja = precios.get(receta.cajaInsumoId)
    if (caja) costoPackaging += caja.precio / receta.alfajoresPorCaja
    else omitidos.push(receta.cajaInsumoId)
  }

  return {
    costoMateriaPrima: round2(costoMateriaPrima),
    costoPackaging: round2(costoPackaging),
    costoUnitario: round2(costoMateriaPrima + costoPackaging),
    detalle,
    omitidos,
  }
}
