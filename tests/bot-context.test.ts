/**
 * El bot no debe preguntar lo que ya sabe: datos del formulario del landing
 * y mensajes que el equipo ya mandó (apertura con plantilla).
 */
import { describe, it, expect } from 'vitest'
import {
  armarContextoLead,
  armarHistorialClaude,
  armarInstruccionEmpresa,
  extraerEmpresa,
  separarResumen,
} from '@/lib/claude/bot-context'

describe('armarContextoLead', () => {
  it('sin datos ni mensajes previos devuelve vacío (no ensucia el prompt)', () => {
    expect(armarContextoLead({})).toBe('')
    expect(armarContextoLead({ contactName: '  ', notas: '' }, [])).toBe('')
  })

  it('incluye los datos del lead y las reglas de no repreguntar', () => {
    const ctx = armarContextoLead({
      contactName: 'Rodolfo',
      empresa: 'Confitería May Lunch',
      productoInteres: 'alfajores',
      localidad: 'Rosario',
      notas: 'Nueva consulta desde landing-cda\n\nMarca registrada: sí',
    })
    expect(ctx).toContain('Nombre: Rodolfo')
    expect(ctx).toContain('Empresa: Confitería May Lunch')
    expect(ctx).toContain('Producto que le interesa: alfajores')
    expect(ctx).toContain('Localidad: Rosario')
    expect(ctx).toContain('Marca registrada: sí')
    expect(ctx).toContain('NO vuelvas a preguntar')
  })

  it('suma los mensajes que el equipo ya mandó y la regla de no volver a saludar', () => {
    const ctx = armarContextoLead({ productoInteres: 'alfajores' }, ['Hola Rodolfo, soy Teo de ALIPRO.\nVi tu formulario.'])
    expect(ctx).toContain('El equipo ya le escribió')
    expect(ctx).toContain('> Hola Rodolfo, soy Teo de ALIPRO. Vi tu formulario.')
    expect(ctx).toContain('NO vuelvas a saludar')
  })

  it('recorta notas muy largas', () => {
    const ctx = armarContextoLead({ notas: 'x'.repeat(5000) })
    expect(ctx.length).toBeLessThan(2500)
    expect(ctx).toContain('…')
  })
})

describe('armarHistorialClaude', () => {
  it('contacto → user, bot y equipo → assistant; notas internas y adjuntos fuera', () => {
    const { turnos, previosDelEquipo } = armarHistorialClaude([
      { senderType: 'contact', contentType: 'text', body: 'Hola' },
      { senderType: 'agent', contentType: 'internal_note', body: 'ojo con este' },
      { senderType: 'contact', contentType: 'image', body: null },
      { senderType: 'bot', contentType: 'text', body: '¿Qué producto?' },
      { senderType: 'contact', contentType: 'text', body: 'Alfajores' },
    ])
    expect(previosDelEquipo).toEqual([])
    expect(turnos).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¿Qué producto?' },
      { role: 'user', content: 'Alfajores' },
    ])
  })

  it('la apertura con plantilla del equipo va a previosDelEquipo y el historial arranca con el usuario', () => {
    const { turnos, previosDelEquipo } = armarHistorialClaude([
      { senderType: 'agent', contentType: 'template', body: 'Hola Rodolfo, soy Teo de ALIPRO. Vi que te interesa alfajores.' },
      { senderType: 'contact', contentType: 'text', body: 'por el servicio de fason' },
    ])
    expect(previosDelEquipo).toEqual(['Hola Rodolfo, soy Teo de ALIPRO. Vi que te interesa alfajores.'])
    expect(turnos).toEqual([{ role: 'user', content: 'por el servicio de fason' }])
  })

  it('mensajes del equipo en el medio quedan como assistant y se unen los consecutivos', () => {
    const { turnos } = armarHistorialClaude([
      { senderType: 'contact', contentType: 'text', body: 'Hola' },
      { senderType: 'agent', contentType: 'text', body: 'Buenas!' },
      { senderType: 'bot', contentType: 'text', body: '¿Cuántas unidades?' },
      { senderType: 'contact', contentType: 'text', body: '1000' },
      { senderType: 'contact', contentType: 'text', body: 'por mes' },
    ])
    expect(turnos).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Buenas!\n\n¿Cuántas unidades?' },
      { role: 'user', content: '1000\n\npor mes' },
    ])
  })

  it('sin mensajes del contacto no hay turnos', () => {
    const { turnos } = armarHistorialClaude([{ senderType: 'agent', contentType: 'template', body: 'Hola' }])
    expect(turnos).toEqual([])
  })
})

describe('separarResumen', () => {
  it('sin marcadores devuelve el texto tal cual', () => {
    expect(separarResumen('Qué volumen tenés en mente?')).toEqual({ visible: 'Qué volumen tenés en mente?', resumen: null, handoff: false })
  })

  it('al derivar: el cliente ve solo el cierre; el resumen queda aparte', () => {
    const r = separarResumen('Listo, te derivo con un asesor.\n[HANDOFF]\n[RESUMEN]\nProducto: alfajores\nCantidad: 3000/mes')
    expect(r.visible).toBe('Listo, te derivo con un asesor.')
    expect(r.handoff).toBe(true)
    expect(r.resumen).toBe('Producto: alfajores\nCantidad: 3000/mes')
  })

  it('[HANDOFF] sin resumen y resumen vacío', () => {
    expect(separarResumen('Chau! [HANDOFF]')).toEqual({ visible: 'Chau!', resumen: null, handoff: true })
    expect(separarResumen('Chau! [HANDOFF] [RESUMEN]')).toEqual({ visible: 'Chau!', resumen: null, handoff: true })
  })
})

// El bot pregunta la empresa / marca si no la sabemos y la deja en el [RESUMEN]
// para que qualifyAndAssign la guarde en el lead.
describe('armarInstruccionEmpresa', () => {
  it('sin empresa conocida: pide preguntarla una vez y dejarla en el resumen', () => {
    const txt = armarInstruccionEmpresa(null)
    expect(txt).toContain('Preguntalo UNA sola vez')
    expect(txt).toContain('"Empresa: <nombre>"')
  })

  it('con empresa conocida: pide no repreguntar pero igual la quiere en el resumen', () => {
    const txt = armarInstruccionEmpresa('La Espiga')
    expect(txt).toContain('"La Espiga"')
    expect(txt).toContain('no lo vuelvas a preguntar')
    expect(txt).toContain('"Empresa: <nombre>"')
  })
})

describe('extraerEmpresa', () => {
  it('lee la línea "Empresa: X" del resumen, tolerante al formato', () => {
    expect(extraerEmpresa('Nombre: Ana\nEmpresa: Panadería La Espiga\nScore: 10/14 (A)')).toBe('Panadería La Espiga')
    expect(extraerEmpresa('- Empresa / marca: "Kiosco Sol".')).toBe('Kiosco Sol')
    expect(extraerEmpresa('EMPRESA:   Los   Alfajores  ')).toBe('Los Alfajores')
  })

  it('devuelve null si no tiene, no lo dijo o falta la línea', () => {
    expect(extraerEmpresa('Empresa: -')).toBeNull()
    expect(extraerEmpresa('Empresa: no tiene')).toBeNull()
    expect(extraerEmpresa('Empresa: No lo dijo')).toBeNull()
    expect(extraerEmpresa('Empresa: particular')).toBeNull()
    expect(extraerEmpresa('Nombre: Ana\nProducto: alfajores')).toBeNull()
    expect(extraerEmpresa(null)).toBeNull()
  })
})
