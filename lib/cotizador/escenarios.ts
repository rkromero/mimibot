import {
  calcularCotizacion,
  type CotizacionInput,
  type CotizacionDesglose,
  type CotizadorSnapshot,
} from '@/lib/cotizador/calculo'

export type EscenarioCotizacion = CotizacionDesglose & {
  cantidad: number
  /** true en el escenario de la cantidad pedida */
  elegido: boolean
}

// Escenarios de una cotización: la cantidad pedida más los dos escalones de
// volumen siguientes (si existen), todos calculados con el mismo snapshot,
// packaging y descuento manual. Función pura: se usa para el preview en vivo
// y su salida se congela en propuestas.resultado.
export function calcularEscenarios(
  input: CotizacionInput,
  snapshot: CotizadorSnapshot,
): EscenarioCotizacion[] {
  const elegido: EscenarioCotizacion = {
    ...calcularCotizacion(input, snapshot),
    cantidad: input.cantidad,
    elegido: true,
  }

  const siguientes = snapshot.escalones
    .filter((e) => e.cantidadMin > input.cantidad)
    .sort((a, b) => a.cantidadMin - b.cantidadMin)
    .slice(0, 2)

  return [
    elegido,
    ...siguientes.map((esc) => ({
      ...calcularCotizacion({ ...input, cantidad: esc.cantidadMin }, snapshot),
      cantidad: esc.cantidadMin,
      elegido: false,
    })),
  ]
}
