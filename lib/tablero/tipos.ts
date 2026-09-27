/**
 * Tablero de comando (Análisis → Tablero de comando): tipos compartidos entre
 * la API (/api/admin/tablero) y la pantalla. Todos los importes van como
 * número en pesos, tal como están cargados (con IVA en ventas).
 */

export type ResultadoMes = {
  ventas: number
  cantidadPedidos: number
  costoDirecto: number
  gastoOperativo: number
  margenBruto: number
  resultadoNeto: number
}

export type Semaforo = 'ganando' | 'equilibrio' | 'perdiendo' | 'sin-datos'

export type PuntoEquilibrio = {
  /** Margen bruto sobre ventas, 0..1 */
  margenBrutoPct: number
  /** Ventas necesarias en el mes para cubrir los gastos operativos */
  ventasNecesarias: number
  /** Ventas del mes / ventas necesarias, 0..n */
  avance: number
  /** Cuánto falta vender (0 si ya se superó) */
  faltante: number
} | null

export type Proyeccion = {
  diaActual: number
  diasDelMes: number
  ventas: number
  resultadoNeto: number
} | null

export type CobrosPorMetodo = { metodo: string; cobrado: number; pagado: number }

export type AntiguedadDeuda = {
  alDia: number
  d30: number
  d60: number
  mas60: number
  total: number
  pedidos: number
}

export type Deudor = { clienteId: string; nombre: string; saldo: number; pedidos: number; diasMax: number }

export type VentaMarca = { marcaId: string; marca: string; facturado: number; pedidos: number; anterior: number }

export type VentaVendedor = {
  vendedorId: string
  nombre: string
  ventas: number
  pedidos: number
  metaPedidos: number | null
  metaCobrado: number | null
}

export type Embudo = {
  leadsNuevos: number
  propuestasEnviadas: number
  ganados: number
  perdidos: number
  muestrasEntregadas: number
  muestrasConPedido: number
  motivosPerdida: Array<{ motivo: string; cantidad: number }>
}

export type GastoCategoria = { categoria: string; tipo: string; total: number; anterior: number }

export type TableroData = {
  mes: string
  esMesActual: boolean
  resultado: { actual: ResultadoMes; anterior: ResultadoMes }
  semaforo: Semaforo
  puntoEquilibrio: PuntoEquilibrio
  proyeccion: Proyeccion
  caja: {
    porMetodo: CobrosPorMetodo[]
    cobrado: number
    pagado: number
    cobranzaPct: number | null
    diasDeCobro: number | null
  }
  deuda: { antiguedad: AntiguedadDeuda; top: Deudor[] }
  ventas: {
    porMarca: VentaMarca[]
    ticketPromedio: number
    clientesQueCompraron: number
    clientesNuevos: number
    porVendedor: VentaVendedor[]
  }
  embudo: Embudo
  gastos: GastoCategoria[]
}
