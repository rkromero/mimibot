/**
 * Respuestas rápidas del chat: mensajes predefinidos que el equipo carga una
 * vez y usa desde el inbox, ya sea desde el panel al lado de la conversación
 * o escribiendo el comando ("/" + atajo) en el cuadro de texto.
 *
 * Acá viven las reglas puras (sin React ni fetch): cómo se reemplazan las
 * variables, cómo se detecta un comando en lo que se está escribiendo y cómo
 * se filtran/ordenan las respuestas. La UI y la API las consumen.
 */

export type RespuestaRapida = {
  id: string
  /** Comando sin la barra: "hola" se invoca como "/hola" */
  atajo: string
  titulo: string
  /** Texto del mensaje; admite {nombre} y {producto} */
  body: string
}

export type VariablesRespuesta = {
  nombre?: string | null
  producto?: string | null
}

/** Variables que se pueden usar en el texto, con su descripción para la UI. */
export const VARIABLES_RESPUESTA: ReadonlyArray<{ token: string; descripcion: string }> = [
  { token: '{nombre}', descripcion: 'Nombre del contacto' },
  { token: '{producto}', descripcion: 'Producto de interés del lead' },
]

/**
 * Reemplaza {nombre} y {producto} por los datos de la conversación. Si un
 * dato no está disponible el marcador queda visible, así quien envía lo nota
 * en el cuadro de texto y lo corrige antes de mandar.
 */
export function reemplazarVariables(body: string, vars: VariablesRespuesta = {}): string {
  const nombre = vars.nombre?.trim()
  const producto = vars.producto?.trim()
  return body
    .replace(/\{nombre\}/g, nombre || '{nombre}')
    .replace(/\{producto\}/g, producto || '{producto}')
}

/**
 * Si lo escrito en el cuadro es un comando en curso ("/", "/ho", "/hola")
 * devuelve lo que va después de la barra (en minúsculas); si no, null.
 * Solo cuenta cuando la barra es lo primero y todavía no hay espacios: apenas
 * la persona sigue escribiendo un mensaje normal, deja de ser comando.
 */
export function detectarComando(texto: string): string | null {
  const m = /^\/(\S*)$/.exec(texto)
  return m ? m[1]!.toLowerCase() : null
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Orden estable para listar: por atajo alfabético. */
export function ordenarRespuestas(lista: RespuestaRapida[]): RespuestaRapida[] {
  return [...lista].sort((a, b) => a.atajo.localeCompare(b.atajo, 'es'))
}

/**
 * Opciones para el autocompletado del comando. Primero las que empiezan con lo
 * tipeado (el caso habitual), después las que lo contienen en el atajo o en el
 * título. Con la consulta vacía ("/") devuelve todas.
 */
export function filtrarPorComando(lista: RespuestaRapida[], consulta: string): RespuestaRapida[] {
  const q = sinTildes(consulta.trim())
  const ordenadas = ordenarRespuestas(lista)
  if (!q) return ordenadas
  const empiezan = ordenadas.filter((r) => r.atajo.startsWith(q))
  const contienen = ordenadas.filter(
    (r) => !r.atajo.startsWith(q) && (r.atajo.includes(q) || sinTildes(r.titulo).includes(q)),
  )
  return [...empiezan, ...contienen]
}

/** Búsqueda libre del panel: atajo, título o texto, sin distinguir tildes. */
export function buscarRespuestas(lista: RespuestaRapida[], texto: string): RespuestaRapida[] {
  const q = sinTildes(texto.trim().replace(/^\/+/, ''))
  const ordenadas = ordenarRespuestas(lista)
  if (!q) return ordenadas
  return ordenadas.filter(
    (r) => r.atajo.includes(q) || sinTildes(r.titulo).includes(q) || sinTildes(r.body).includes(q),
  )
}
