/**
 * Señales del bot calificador, sin DB (testeable):
 * - marcadores que el modelo deja en su respuesta ([LISTA_ESPERA: x], [FOTO: cat])
 * - detección determinista sobre el mensaje de la persona (pide reunión, pide fotos)
 * - categorías de la galería de medios
 */

export const CATEGORIAS_BOT_MEDIA = ['producto_terminado', 'flow_pack_cristal', 'bobina_impresa', 'planta'] as const
export type CategoriaBotMedia = (typeof CATEGORIAS_BOT_MEDIA)[number]

export const LABEL_CATEGORIA: Record<CategoriaBotMedia, string> = {
  producto_terminado: 'Producto terminado',
  flow_pack_cristal: 'Flow pack cristal',
  bobina_impresa: 'Bobina impresa (packaging personalizado)',
  planta: 'Planta / fábrica',
}

export function esCategoriaBotMedia(valor: string): valor is CategoriaBotMedia {
  return (CATEGORIAS_BOT_MEDIA as readonly string[]).includes(valor)
}

/** Máximo de medios que manda el bot por turno. */
export const MAX_MEDIOS_POR_TURNO = 2

export const LISTA_ESPERA_MARKER = '[LISTA_ESPERA:'
export const FOTO_MARKER = '[FOTO:'

const RE_LISTA_ESPERA = /\[LISTA_ESPERA:\s*([^\]]+?)\s*\]/gi
const RE_FOTO = /\[FOTO:\s*([a-z_ ]+?)\s*\]/gi

export type SenalesRespuesta = {
  /** Texto sin marcadores (todavía puede traer [HANDOFF] / [RESUMEN]) */
  texto: string
  /** Productos que la persona pidió y no hacemos (uno por marcador, sin repetir) */
  listaEspera: string[]
  /** Categorías de medios que el bot quiere mandar, en orden, sin repetir */
  medios: CategoriaBotMedia[]
}

/** Saca los marcadores [LISTA_ESPERA: ...] y [FOTO: ...] de la respuesta del modelo. */
export function extraerSenales(respuesta: string): SenalesRespuesta {
  const listaEspera: string[] = []
  const medios: CategoriaBotMedia[] = []

  let texto = respuesta.replace(RE_LISTA_ESPERA, (_m, p: string) => {
    const producto = p.replace(/\s+/g, ' ').trim()
    if (producto && !listaEspera.some((x) => x.toLowerCase() === producto.toLowerCase())) listaEspera.push(producto)
    return ''
  })
  texto = texto.replace(RE_FOTO, (_m, c: string) => {
    const cat = c.trim().toLowerCase().replace(/\s+/g, '_')
    if (esCategoriaBotMedia(cat) && !medios.includes(cat)) medios.push(cat)
    return ''
  })

  return {
    texto: texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    listaEspera,
    medios: medios.slice(0, MAX_MEDIOS_POR_TURNO),
  }
}

const RE_REUNION = [
  // "llamada", "llamame", "pueden llamarme", "llamá". No "se llama X" / "me llamo X".
  /\bllamad[ao]s?\b/i,
  /\bllam(?:ame|arme|enme|á|ar(?:nos|los|la|lo)?)\b/i,
  /\bme (?:pueden|podr[ií]an|podés|puede) llamar\b/i,
  /\breuni[oó]n(?:es)?\b/i,
  /\breunirnos\b|\bjuntarnos\b|\bjuntarme\b/i,
  /\bvisit(?:a|ar|arlos|arla|arme|en)\b/i,
  /\bpasar (?:por|a ver) (?:la )?(?:planta|f[aá]brica)\b/i,
  /\bconocer (?:la )?(?:planta|f[aá]brica)\b/i,
  /\bvideo ?llamada\b|\bmeet\b|\bzoom\b/i,
  /\bpor tel[eé]fono\b|\btelef[oó]nicamente\b/i,
  /\bcoordinar (?:una )?(?:llamada|reuni[oó]n|visita)\b/i,
]

/** La persona pide que la llamen, una visita o una reunión. */
export function detectarPedidoReunion(texto: string | null | undefined): boolean {
  if (!texto) return false
  const t = texto.normalize('NFC')
  return RE_REUNION.some((re) => re.test(t))
}

const RE_PIDE_FOTO =
  /\b(fotos?|fotitos?|im[aá]ge?n(?:es)?|videos?|ver (?:el|los|un|una|c[oó]mo (?:es|son|queda|quedan))|mostr(?:ame|arme|ar|an)|muestra(?:s|me)?|cat[aá]logo)\b/i

/**
 * La persona pide ver el producto / el packaging / la planta. Devuelve las
 * categorías más relevantes según lo que nombró (producto terminado si no
 * dice nada específico), o null si no está pidiendo ver nada.
 */
export function detectarPedidoMedios(texto: string | null | undefined): CategoriaBotMedia[] | null {
  if (!texto || !RE_PIDE_FOTO.test(texto)) return null
  const t = texto.toLowerCase()
  const cats: CategoriaBotMedia[] = []
  if (/\bbobina|impres[oa]|personalizad[oa]|con (?:mi|nuestra|su) marca|dise[ñn]o propio/.test(t)) cats.push('bobina_impresa')
  if (/\bflow ?pack|cristal|transparente|packaging|envase|envoltorio|empaque/.test(t)) cats.push('flow_pack_cristal')
  if (/\bplanta|f[aá]brica|instalaciones|producci[oó]n|m[aá]quina/.test(t)) cats.push('planta')
  if (cats.length === 0 || /\bproducto|alfajor|terminado|queda|quedan/.test(t)) cats.unshift('producto_terminado')
  return [...new Set(cats)].slice(0, MAX_MEDIOS_POR_TURNO)
}

const RE_72HS = /\b72\s*(?:hs\.?|horas?|h)\s*h[aá]biles\b/gi

/** Cualquier "72 hs hábiles" que haya quedado en el prompt pasa al plazo configurado. */
export function reemplazarPlazoPropuesta(prompt: string, plazo: string): string {
  const p = plazo.trim()
  if (!p) return prompt
  return prompt.replace(RE_72HS, p)
}

export type MedioGaleria = {
  id: string
  categoria: CategoriaBotMedia
  titulo: string
  r2Key: string
  mimeType: string
  orden: number
}

/**
 * Elige hasta `max` medios: el primero (por orden) de cada categoría pedida;
 * si se pidió una sola categoría y tiene más de un medio, manda los dos primeros.
 */
export function elegirMedios(
  disponibles: readonly MedioGaleria[],
  categorias: readonly CategoriaBotMedia[],
  max: number = MAX_MEDIOS_POR_TURNO,
): MedioGaleria[] {
  const porCategoria = (c: CategoriaBotMedia) =>
    disponibles.filter((m) => m.categoria === c).sort((a, b) => a.orden - b.orden)

  const elegidos: MedioGaleria[] = []
  for (const c of categorias) {
    const primero = porCategoria(c)[0]
    if (primero && !elegidos.includes(primero)) elegidos.push(primero)
    if (elegidos.length >= max) return elegidos
  }
  if (elegidos.length === 1 && categorias.length === 1) {
    const segundo = porCategoria(categorias[0]!)[1]
    if (segundo) elegidos.push(segundo)
  }
  return elegidos.slice(0, max)
}
