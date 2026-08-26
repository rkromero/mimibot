/**
 * Motivos por los que un lead se cierra como perdido. Se guardan como código
 * en `leads.motivo_perdida` para poder contarlos; el detalle libre va aparte.
 */
export const MOTIVOS_PERDIDA = [
  { codigo: 'precio', label: 'Precio' },
  { codigo: 'minimos', label: 'Mínimos de producción' },
  { codigo: 'inversion_packaging', label: 'Inversión en packaging' },
  { codigo: 'no_era_el_momento', label: 'No era el momento / lo deja para más adelante' },
  { codigo: 'otro_proveedor', label: 'Eligió otro proveedor' },
  { codigo: 'no_califica', label: 'No califica (producto, zona, rubro)' },
  { codigo: 'sin_respuesta', label: 'Dejó de responder' },
  { codigo: 'otro', label: 'Otro' },
] as const

export type MotivoPerdida = (typeof MOTIVOS_PERDIDA)[number]['codigo']

/** Códigos que setea el sistema solo (seguimiento automático). */
export const MOTIVO_AUTO_SIN_RESPUESTA: MotivoPerdida = 'sin_respuesta'
export const MOTIVO_AUTO_DESISTIO: MotivoPerdida = 'no_era_el_momento'

export const CODIGOS_MOTIVO_PERDIDA = MOTIVOS_PERDIDA.map((m) => m.codigo) as [MotivoPerdida, ...MotivoPerdida[]]

export function labelMotivoPerdida(codigo: string | null | undefined): string {
  if (!codigo) return 'Sin especificar'
  return MOTIVOS_PERDIDA.find((m) => m.codigo === codigo)?.label ?? codigo
}
