/**
 * Respuestas rápidas del chat: reglas puras (variables, detección del
 * comando "/", filtrado) y la validación/normalización del atajo.
 */
import { describe, it, expect } from 'vitest'
import {
  reemplazarVariables,
  detectarComando,
  filtrarPorComando,
  buscarRespuestas,
  ordenarRespuestas,
  type RespuestaRapida,
} from '@/lib/inbox/respuestas-rapidas'
import {
  normalizarAtajo,
  respuestaRapidaSchema,
  respuestaRapidaUpdateSchema,
} from '@/lib/validations/respuesta-rapida'

const lista: RespuestaRapida[] = [
  { id: '1', atajo: 'hola', titulo: 'Saludo inicial', body: 'Hola {nombre}! ¿Cómo estás?' },
  { id: '2', atajo: 'precios', titulo: 'Lista de precios', body: 'Te paso la lista de precios de {producto}.' },
  { id: '3', atajo: 'horarios', titulo: 'Horarios de atención', body: 'Atendemos de lunes a viernes de 9 a 18.' },
  { id: '4', atajo: 'gracias', titulo: 'Cierre', body: 'Gracias por tu consulta, {nombre}.' },
]

describe('reemplazarVariables', () => {
  it('reemplaza {nombre} y {producto} con los datos de la conversación', () => {
    expect(reemplazarVariables('Hola {nombre}, te paso {producto}', { nombre: 'Ana', producto: 'alfajores' }))
      .toBe('Hola Ana, te paso alfajores')
  })

  it('deja el marcador visible si falta el dato (para que quien envía lo note)', () => {
    expect(reemplazarVariables('Hola {nombre}', {})).toBe('Hola {nombre}')
    expect(reemplazarVariables('Hola {nombre}', { nombre: '   ' })).toBe('Hola {nombre}')
    expect(reemplazarVariables('{producto}', { producto: null })).toBe('{producto}')
  })
})

describe('detectarComando', () => {
  it('reconoce la barra al inicio y devuelve lo tipeado en minúsculas', () => {
    expect(detectarComando('/')).toBe('')
    expect(detectarComando('/ho')).toBe('ho')
    expect(detectarComando('/HOLA')).toBe('hola')
  })

  it('deja de ser comando si hay espacios, saltos o la barra no es lo primero', () => {
    expect(detectarComando('/hola juan')).toBeNull()
    expect(detectarComando('/hola\n')).toBeNull()
    expect(detectarComando(' /hola')).toBeNull()
    expect(detectarComando('hola /precios')).toBeNull()
    expect(detectarComando('')).toBeNull()
  })
})

describe('filtrarPorComando', () => {
  it('con "/" solo devuelve todas ordenadas por atajo', () => {
    expect(filtrarPorComando(lista, '').map((r) => r.atajo)).toEqual(['gracias', 'hola', 'horarios', 'precios'])
  })

  it('prioriza las que empiezan con lo tipeado y después las que lo contienen', () => {
    expect(filtrarPorComando(lista, 'ho').map((r) => r.atajo)).toEqual(['hola', 'horarios'])
    // "rio" no es prefijo de nada pero está dentro de "horarios" (atajo) y "precios"? no: solo horarios
    expect(filtrarPorComando(lista, 'rio').map((r) => r.atajo)).toEqual(['horarios'])
  })

  it('también matchea por título, sin distinguir tildes', () => {
    expect(filtrarPorComando(lista, 'atencion').map((r) => r.atajo)).toEqual(['horarios'])
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(filtrarPorComando(lista, 'zzz')).toEqual([])
  })
})

describe('buscarRespuestas', () => {
  it('busca en atajo, título y texto, ignorando la barra y las tildes', () => {
    expect(buscarRespuestas(lista, '/gracias').map((r) => r.id)).toEqual(['4'])
    expect(buscarRespuestas(lista, 'como estas').map((r) => r.id)).toEqual(['1'])
    expect(buscarRespuestas(lista, 'lunes').map((r) => r.id)).toEqual(['3'])
  })

  it('vacío devuelve todas ordenadas', () => {
    expect(buscarRespuestas(lista, '   ')).toEqual(ordenarRespuestas(lista))
  })
})

describe('normalizarAtajo', () => {
  it('saca la barra, pasa a minúsculas, quita tildes y usa guiones por espacios', () => {
    expect(normalizarAtajo('/Hola')).toBe('hola')
    expect(normalizarAtajo('  //Más Info  ')).toBe('mas-info')
    expect(normalizarAtajo('Envío   rápido')).toBe('envio-rapido')
  })
})

describe('respuestaRapidaSchema', () => {
  it('normaliza el atajo y recorta título y texto', () => {
    const r = respuestaRapidaSchema.safeParse({ atajo: '/Hola', titulo: '  Saludo ', body: ' Hola {nombre} ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ atajo: 'hola', titulo: 'Saludo', body: 'Hola {nombre}' })
  })

  it('rechaza atajos con caracteres inválidos o vacíos', () => {
    expect(respuestaRapidaSchema.safeParse({ atajo: '/', titulo: 'x', body: 'y' }).success).toBe(false)
    expect(respuestaRapidaSchema.safeParse({ atajo: 'ho.la', titulo: 'x', body: 'y' }).success).toBe(false)
    expect(respuestaRapidaSchema.safeParse({ atajo: '-hola', titulo: 'x', body: 'y' }).success).toBe(false)
  })

  it('exige título y mensaje', () => {
    expect(respuestaRapidaSchema.safeParse({ atajo: 'hola', titulo: '', body: 'y' }).success).toBe(false)
    expect(respuestaRapidaSchema.safeParse({ atajo: 'hola', titulo: 'x', body: '   ' }).success).toBe(false)
  })
})

describe('respuestaRapidaUpdateSchema', () => {
  it('acepta campos parciales pero no un body vacío', () => {
    expect(respuestaRapidaUpdateSchema.safeParse({ titulo: 'Nuevo' }).success).toBe(true)
    expect(respuestaRapidaUpdateSchema.safeParse({}).success).toBe(false)
  })
})
