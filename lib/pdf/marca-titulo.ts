// La marca CDA se discontinuó: sus documentos (remito, proforma, etiqueta)
// salen con membrete ALIPRO. El dato de la marca en productos/pedidos no se
// toca — solo cambia cómo se muestra en los documentos.
const MARCAS_REEMPLAZADAS: Record<string, string> = {
  CDA: 'ALIPRO',
}

/**
 * Arma el título de marca de un documento a partir de las marcas de los
 * productos del pedido: aplica los reemplazos de marcas discontinuadas,
 * deduplica conservando el orden de aparición y une con " + ".
 * Devuelve undefined si no hay marcas (el documento cae al nombre de empresa).
 */
export function armarMarcaTitulo(nombres: Array<string | null | undefined>): string | undefined {
  const mapeados = nombres
    .filter((n): n is string => !!n)
    .map((n) => MARCAS_REEMPLAZADAS[n.toUpperCase()] ?? n)
  const unicos = [...new Set(mapeados)]
  return unicos.length > 0 ? unicos.join(' + ') : undefined
}
