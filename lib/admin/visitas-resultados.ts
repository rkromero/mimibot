// Tipos de resultado de una visita (compartido entre el servicio y la UI).
// Sin imports de servidor: seguro para importar desde componentes cliente.

export const RESULTADOS = [
  { value: 'compro', label: 'Compró', color: '#10b981' },
  { value: 'no_compro', label: 'No compró', color: '#ef4444' },
  { value: 'no_estaba', label: 'No estaba', color: '#6b7280' },
  { value: 'reprogramar', label: 'Reprogramar', color: '#3b82f6' },
] as const

export type ResultadoVisita = (typeof RESULTADOS)[number]['value']

// Visitas completadas sin resultado cargado.
export const OTRO = { value: 'otro', label: 'Otro', color: '#cbd5e1' } as const

/** Todas las claves de segmento posibles (los 4 resultados + "otro"). */
export const SEGMENTOS = [...RESULTADOS, OTRO] as const
