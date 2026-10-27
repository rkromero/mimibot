import { describe, it, expect } from 'vitest'
import {
  armarNotaMuestraCargada,
  armarSeccionDerivacionPost,
  armarSeccionMuestra,
  armarSeccionPropuestaEnviada,
  camposFichaDesdeMuestra,
  EXPRESO_MUESTRA,
  extraerSenalesPostPropuesta,
  faltantesMuestra,
} from '@/lib/claude/bot-post-propuesta-reglas'

describe('armarSeccionPropuestaEnviada', () => {
  it('lista la propuesta con sus escenarios y marca la cantidad pedida', () => {
    const s = armarSeccionPropuestaEnviada({
      numero: 51,
      cantidad: 1000,
      gramaje: 60,
      packaging: 'cristal',
      vigenteHasta: '03/11/2026',
      enviadaEl: '27/10/2026',
      escenarios: [
        { cantidad: 1000, precioUnitNeto: 450, total: 544500, elegido: true },
        { cantidad: 3000, precioUnitNeto: 420, total: 1524600, elegido: false },
      ],
    })
    expect(s).toContain('Propuesta PROP-00051, enviada el 27/10/2026: 1.000 alfajores de 60 g, packaging cristal, vigente hasta el 03/11/2026.')
    expect(s).toContain('- 1.000 unidades: $450 + IVA por alfajor, total $544.500 (la cantidad que pidió)')
    expect(s).toContain('- 3.000 unidades: $420 + IVA por alfajor, total $1.524.600')
    expect(s).toContain('no inventes un número')
  })
})

describe('armarSeccionMuestra', () => {
  it('explica retiro o expreso VIA CARGO, qué datos pedir y el bloque [MUESTRA]', () => {
    const s = armarSeccionMuestra({
      yaCargada: null,
      retiroFabricaInfo: 'Av. Siempreviva 123, Lanús, lunes a viernes de 9 a 16',
      datosLead: { localidad: 'Lanús', cuit: '20-12345678-9' },
    })
    expect(s).toContain('pasa a buscar por la fábrica')
    expect(s).toContain('Av. Siempreviva 123, Lanús, lunes a viernes de 9 a 16')
    expect(s).toContain(`siempre ${EXPRESO_MUESTRA}`)
    expect(s).toContain('CUIT o DNI de quien la recibe')
    expect(s).toContain('Datos que ya tenemos en la ficha (confirmalos, no los vuelvas a pedir): localidad: Lanús; CUIT/DNI: 20-12345678-9.')
    expect(s).toContain('[MUESTRA]\nEntrega: retiro | expreso')
  })

  it('con una muestra ya cargada no ofrece otra', () => {
    const pendiente = armarSeccionMuestra({
      yaCargada: { fecha: '20/10/2026', metodoEntrega: 'expreso', entregada: false },
      retiroFabricaInfo: null,
      datosLead: {},
    })
    expect(pendiente).toContain('Ya tiene una muestra cargada el 20/10/2026, sale por expreso')
    expect(pendiente).not.toContain('[MUESTRA]')

    const entregada = armarSeccionMuestra({
      yaCargada: { fecha: '20/10/2026', metodoEntrega: 'retiro_fabrica', entregada: true },
      retiroFabricaInfo: null,
      datosLead: {},
    })
    expect(entregada).toContain('Ya recibió una muestra')
    expect(entregada).toContain('llevala al primer pedido')
  })
})

describe('extraerSenalesPostPropuesta', () => {
  it('lee el bloque [MUESTRA] por expreso con todos los datos y lo saca del texto visible', () => {
    const r = extraerSenalesPostPropuesta(
      [
        '¡Genial! Te cargo la muestra y te aviso cuando salga por Via Cargo.',
        '',
        '[MUESTRA]',
        'Entrega: expreso',
        'Direccion: Av. Rivadavia 1234, piso 2',
        'Localidad: Morón',
        'Provincia: Buenos Aires',
        'CP: 1708',
        'CUIT: 20-30123456-7',
      ].join('\n'),
    )
    expect(r.visible).toBe('¡Genial! Te cargo la muestra y te aviso cuando salga por Via Cargo.')
    expect(r.muestraMarcada).toBe(true)
    expect(r.muestra).toEqual({
      entrega: 'expreso',
      direccion: 'Av. Rivadavia 1234, piso 2',
      localidad: 'Morón',
      provincia: 'Buenos Aires',
      codigoPostal: '1708',
      cuit: '20-30123456-7',
    })
    expect(r.pedido).toBe(false)
    expect(r.handoff).toBe(false)
  })

  it('retiro en fábrica: los demás campos vienen en "-" y quedan null', () => {
    const r = extraerSenalesPostPropuesta('Dale, te espero en la fábrica.\n[MUESTRA]\nEntrega: retiro\nDireccion: -\nLocalidad: -\nProvincia: -\nCP: -\nCUIT: -')
    expect(r.visible).toBe('Dale, te espero en la fábrica.')
    expect(r.muestra).toEqual({ entrega: 'retiro_fabrica', direccion: null, localidad: null, provincia: null, codigoPostal: null, cuit: null })
  })

  it('tolera tildes y variantes de clave, y texto después del bloque', () => {
    const r = extraerSenalesPostPropuesta('Listo.\n[MUESTRA]\nEntrega: la enviamos\nDirección: Calle 1 100\nLocalidad: X\nProvincia: Y\nCódigo postal: 1900\nCUIT/DNI: 30111222\n\nCualquier cosa me decís.')
    expect(r.muestra).toMatchObject({ entrega: 'expreso', direccion: 'Calle 1 100', codigoPostal: '1900', cuit: '30111222' })
    expect(r.visible).toBe('Listo.\n\nCualquier cosa me decís.')
  })

  it('[MUESTRA] sin entrega reconocible: marcada pero sin datos', () => {
    const r = extraerSenalesPostPropuesta('Ok [MUESTRA]\nEntrega: no sé')
    expect(r.muestraMarcada).toBe(true)
    expect(r.muestra).toBeNull()
    expect(r.visible).toBe('Ok')
  })

  it('[PEDIDO] + [HANDOFF] + [RESUMEN]: pedido decidido, nada de eso llega a la persona', () => {
    const r = extraerSenalesPostPropuesta('¡Buenísimo! Te cargo el pedido y te llega la proforma. [PEDIDO] [HANDOFF]\n[RESUMEN]\nQuiere 600 negros y 400 blancos.\nPide factura A.')
    expect(r.visible).toBe('¡Buenísimo! Te cargo el pedido y te llega la proforma.')
    expect(r.pedido).toBe(true)
    expect(r.handoff).toBe(true)
    expect(r.resumen).toBe('Quiere 600 negros y 400 blancos.\nPide factura A.')
  })

  it('sin marcadores: solo texto', () => {
    const r = extraerSenalesPostPropuesta('¿Pudiste ver la propuesta?')
    expect(r).toEqual({ visible: '¿Pudiste ver la propuesta?', muestra: null, muestraMarcada: false, pedido: false, handoff: false, resumen: null })
  })
})

describe('faltantesMuestra / camposFichaDesdeMuestra / nota', () => {
  const expreso = { entrega: 'expreso' as const, direccion: 'Calle 1', localidad: null, provincia: 'Buenos Aires', codigoPostal: null, cuit: null }

  it('para expreso faltan los datos que no vinieron ni están en la ficha', () => {
    expect(faltantesMuestra(expreso, {})).toEqual(['localidad', 'código postal', 'CUIT o DNI'])
    expect(faltantesMuestra(expreso, { localidad: 'Morón', codigoPostal: '1708', cuit: '20-1-1' })).toEqual([])
    expect(faltantesMuestra({ ...expreso, entrega: 'retiro_fabrica' }, {})).toEqual([])
  })

  it('solo actualiza la ficha con lo que vino', () => {
    expect(camposFichaDesdeMuestra(expreso)).toEqual({ direccion: 'Calle 1', provincia: 'Buenos Aires' })
  })

  it('la nota dice por dónde va y a dónde, mezclando bloque y ficha', () => {
    const nota = armarNotaMuestraCargada(expreso, { localidad: 'Morón', codigoPostal: '1708', cuit: '20-1-1' })
    expect(nota).toBe(
      `Muestra cargada por el bot: va por expreso ${EXPRESO_MUESTRA} a Calle 1, Morón, Buenos Aires, CP 1708, CUIT/DNI 20-1-1. Los datos quedaron en la ficha. El pedido de muestra quedó confirmado para fábrica.`,
    )
    expect(armarNotaMuestraCargada({ ...expreso, entrega: 'retiro_fabrica' }, {})).toContain('la retira en fábrica')
  })

  it('la sección de derivación explica [PEDIDO] y [HANDOFF] con [RESUMEN]', () => {
    const s = armarSeccionDerivacionPost()
    expect(s).toContain('[PEDIDO] seguido de [HANDOFF]')
    expect(s).toContain('descuento')
    expect(s).toContain('[RESUMEN]')
  })
})
