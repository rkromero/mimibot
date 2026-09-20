/**
 * Chips de marca del selector de productos (cargar pedido → "Agregar producto").
 * Reglas puras: qué marcas ofrecer según los productos visibles y cómo filtrar.
 */

export type ProductoConMarca = {
  marcaId?: string | null
  marcaNombre?: string | null
}

export type MarcaChip = {
  id: string
  nombre: string
  /** Cantidad de productos visibles de la marca */
  count: number
}

/** Valor del chip que no filtra por marca. */
export const TODAS_LAS_MARCAS = 'todas'

/**
 * Marcas presentes entre los productos que el usuario puede ver, ordenadas
 * por nombre. Con una sola marca no tiene sentido mostrar chips: devuelve [].
 */
export function marcasDisponibles(productos: ProductoConMarca[]): MarcaChip[] {
  const porId = new Map<string, MarcaChip>()
  for (const p of productos) {
    if (!p.marcaId || !p.marcaNombre) continue
    const actual = porId.get(p.marcaId)
    if (actual) actual.count++
    else porId.set(p.marcaId, { id: p.marcaId, nombre: p.marcaNombre, count: 1 })
  }
  const lista = [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return lista.length >= 2 ? lista : []
}

/** Deja solo los productos de la marca elegida; con "todas" (o null) no filtra. */
export function filtrarPorMarca<T extends ProductoConMarca>(productos: T[], marcaId: string | null): T[] {
  if (!marcaId || marcaId === TODAS_LAS_MARCAS) return productos
  return productos.filter((p) => p.marcaId === marcaId)
}
