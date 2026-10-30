/**
 * Señales del bot (sin DB): marcadores del modelo, detección de pedidos de
 * reunión / fotos, reemplazo del plazo y elección de medios.
 */
import { describe, it, expect } from 'vitest'
import {
  armarSeccionDatosFijos,
  conProductosExcluidosFijos,
  DIRECCION_FABRICA,
  detectarPedidoMedios,
  detectarPedidoReunion,
  elegirMedios,
  extraerSenales,
  reemplazarPlazoPropuesta,
  type MedioGaleria,
} from '@/lib/claude/bot-reglas'
import { tagListaEspera } from '@/lib/leads/tags'

describe('extraerSenales', () => {
  it('saca [LISTA_ESPERA: x] y [FOTO: cat] del texto y los devuelve aparte', () => {
    const r = extraerSenales(
      'Por ahora no hacemos triples, pero sí el clásico de 50 g. ¿Te sirve? [LISTA_ESPERA: triple]\n\n[FOTO: producto_terminado] [FOTO: flow pack cristal]',
    )
    expect(r.texto).toBe('Por ahora no hacemos triples, pero sí el clásico de 50 g. ¿Te sirve?')
    expect(r.listaEspera).toEqual(['triple'])
    expect(r.medios).toEqual(['producto_terminado', 'flow_pack_cristal'])
  })

  it('ignora categorías desconocidas, no repite y deja pasar [HANDOFF] / [RESUMEN]', () => {
    const r = extraerSenales('Listo [FOTO: otra_cosa] [FOTO: planta] [FOTO: planta] [LISTA_ESPERA: sin TACC] [LISTA_ESPERA: Sin tacc] [HANDOFF]\n[RESUMEN]\nEmpresa: X')
    expect(r.medios).toEqual(['planta'])
    expect(r.listaEspera).toEqual(['sin TACC'])
    expect(r.texto).toContain('[HANDOFF]')
    expect(r.texto).toContain('[RESUMEN]')
  })

  it('sin marcadores devuelve el texto tal cual', () => {
    expect(extraerSenales('Hola, ¿qué buscás?')).toEqual({ texto: 'Hola, ¿qué buscás?', listaEspera: [], medios: [] })
  })
})

describe('tagListaEspera', () => {
  it('arma "lista-espera-<producto>" como slug', () => {
    expect(tagListaEspera('triple')).toBe('lista-espera-triple')
    expect(tagListaEspera('sin TACC')).toBe('lista-espera-sin-tacc')
    expect(tagListaEspera('Alfajor de maicena ')).toBe('lista-espera-alfajor-de-maicena')
  })
})

describe('detectarPedidoReunion', () => {
  it.each([
    'me pueden llamar?',
    'Prefiero una llamada',
    'podemos coordinar una reunión',
    'quisiera visitar la planta',
    'me gustaría pasar por la fábrica a ver',
    'hablemos por teléfono mejor',
    'hacemos un meet?',
  ])('detecta "%s"', (t) => {
    expect(detectarPedidoReunion(t)).toBe(true)
  })

  it.each([
    'quiero 300 alfajores',
    'cuánto sale?',
    'tienen sin tacc?',
    'mi empresa se llama Dulce Tentación',
    'me llamo Rodolfo',
    '',
    null,
  ])('no detecta "%s"', (t) => {
    expect(detectarPedidoReunion(t)).toBe(false)
  })
})

describe('detectarPedidoMedios', () => {
  it('pedir fotos sin más va a producto terminado', () => {
    expect(detectarPedidoMedios('me mandás fotos?')).toEqual(['producto_terminado'])
    expect(detectarPedidoMedios('puedo ver el producto?')).toEqual(['producto_terminado'])
  })

  it('nombra packaging, bobina o planta → esas categorías (máximo 2)', () => {
    expect(detectarPedidoMedios('tenés fotos del flow pack cristal?')).toEqual(['flow_pack_cristal'])
    expect(detectarPedidoMedios('quiero ver cómo queda la bobina impresa con mi marca')).toEqual(['producto_terminado', 'bobina_impresa'])
    expect(detectarPedidoMedios('hay video de la planta?')).toEqual(['planta'])
  })

  it('sin pedido de ver nada devuelve null', () => {
    expect(detectarPedidoMedios('quiero 500 unidades')).toBeNull()
    expect(detectarPedidoMedios(null)).toBeNull()
  })
})

describe('reemplazarPlazoPropuesta', () => {
  it('cambia cualquier "72 hs hábiles" por el plazo configurado', () => {
    const p = 'La propuesta sale en 72 hs hábiles. En 72 horas hábiles como mucho; 72hs habiles.'
    expect(reemplazarPlazoPropuesta(p, 'hoy mismo en horario hábil')).toBe(
      'La propuesta sale en hoy mismo en horario hábil. En hoy mismo en horario hábil como mucho; hoy mismo en horario hábil.',
    )
  })

  it('con plazo vacío no toca el prompt', () => {
    expect(reemplazarPlazoPropuesta('72 hs hábiles', '  ')).toBe('72 hs hábiles')
  })
})

describe('elegirMedios', () => {
  const galeria: MedioGaleria[] = [
    { id: 'a', categoria: 'producto_terminado', titulo: 'A', r2Key: 'k/a', mimeType: 'image/jpeg', orden: 2 },
    { id: 'b', categoria: 'producto_terminado', titulo: 'B', r2Key: 'k/b', mimeType: 'image/jpeg', orden: 1 },
    { id: 'c', categoria: 'planta', titulo: 'C', r2Key: 'k/c', mimeType: 'video/mp4', orden: 0 },
  ]

  it('una categoría con varios medios → los dos primeros por orden', () => {
    expect(elegirMedios(galeria, ['producto_terminado']).map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('dos categorías → el primero de cada una', () => {
    expect(elegirMedios(galeria, ['planta', 'producto_terminado']).map((m) => m.id)).toEqual(['c', 'b'])
  })

  it('categoría sin medios → vacío', () => {
    expect(elegirMedios(galeria, ['bobina_impresa'])).toEqual([])
  })
})

describe('datos fijos de la fábrica', () => {
  it('la sección fija colores de film, dirección única y congelados', () => {
    const s = armarSeccionDatosFijos()
    expect(s).toContain('## Datos fijos (no inventes ni prometas otra cosa)')
    expect(s).toContain('cristal (transparente) o negro liso. NO existe film blanco')
    expect(s).toContain(`La planta está en ${DIRECCION_FABRICA}. Es la ÚNICA dirección`)
    expect(DIRECCION_FABRICA).toBe('José Ignacio de la Rosa 6276, Mataderos, CABA')
    expect(s).toContain('NO hacemos nada congelado')
  })

  it('los congelados se suman a los productos excluidos de Ajustes, sin repetir', () => {
    expect(conProductosExcluidosFijos(null)).toEqual(['productos congelados'])
    expect(conProductosExcluidosFijos(['sin TACC', ' triple '])).toEqual(['sin TACC', 'triple', 'productos congelados'])
    expect(conProductosExcluidosFijos(['Productos Congelados', ''])).toEqual(['Productos Congelados'])
  })
})
