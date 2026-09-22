/**
 * "Marcar Entregado" a mano desde el detalle del pedido (admin / gerente).
 *
 * Un pedido se puede dar por entregado en cualquier estado posterior a la
 * aprobación: confirmado, listo para repartir o en reparto. Antes de aprobarse
 * no, porque la aprobación es la que genera el débito en cuenta corriente y
 * la salida de stock; marcarlo entregado desde pendiente saltearía todo eso.
 */
export const ESTADOS_ENTREGABLES_A_MANO = ['confirmado', 'listo_para_repartir', 'en_reparto'] as const

export type EstadoEntregable = (typeof ESTADOS_ENTREGABLES_A_MANO)[number]

export function puedeMarcarEntregadoAMano(estado: string): estado is EstadoEntregable {
  return (ESTADOS_ENTREGABLES_A_MANO as readonly string[]).includes(estado)
}

export const MOTIVO_NO_ENTREGABLE =
  'Para marcarlo entregado el pedido tiene que estar aprobado (confirmado, listo para repartir o en reparto)'
