import { describe, it, expect } from 'vitest'
import { intakeSchema, normalizeIntake, buildIntakeResumen } from '@/lib/validations/lead'

describe('intakeSchema + normalizeIntake', () => {
  it('acepta el payload de la landing ALIPRO (claves en español)', () => {
    const parsed = intakeSchema.safeParse({
      lead_grade: 'A', lead_score: 8,
      nombre: 'Juan Pérez', empresa: 'Dulces SA',
      whatsapp: '11 5555-4444', email: 'juan@dulces.com',
      provincia: 'Buenos Aires', producto: 'Alfajores',
      cantidad: '5.000 a 20.000', plazo: 'Este mes', canal: 'Kioscos',
      situacion: 'Ya vendo', packaging: 'Flowpack',
      acepta_inversion_bobina: 'Sí', segmento: 'PyME',
      mensaje: 'Quiero cotizar', origen: 'web-alipro',
      pagina: '/', fecha: '2026-08-13T12:00:00Z',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const d = normalizeIntake(parsed.data)
    expect(d.name).toBe('Juan Pérez')
    expect(d.phone).toBe('11 5555-4444')
    expect(d.email).toBe('juan@dulces.com')
    expect(d.message).toBe('Quiero cotizar')
    expect(d.source).toBe('web-alipro')
    expect(d.empresa).toBe('Dulces SA')
    expect(d.producto).toBe('Alfajores')
    expect(d.extras['provincia']).toBe('Buenos Aires')
    expect(d.extras['lead_score']).toBe(8)
    // la fecha y el honeypot no viajan a extras
    expect(d.extras['fecha']).toBeUndefined()
  })

  it('acepta el payload de la landing CDA (telefono/volumen/envasado)', () => {
    const parsed = intakeSchema.safeParse({
      nombre: 'Ana', empresa: 'Marca X', email: 'ana@marca.com',
      telefono: '1155556666', producto: 'alfajores', marca: 'si-registrada',
      volumen: '1000-5000', envasado: 'flowpack-personalizado',
      mensaje: 'Hola', inversionEstimada: '$2.500.000', origen: 'landing-cda',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const d = normalizeIntake(parsed.data)
    expect(d.name).toBe('Ana')
    expect(d.phone).toBe('1155556666')
    expect(d.source).toBe('landing-cda')
    expect(d.extras['volumen']).toBe('1000-5000')
    expect(d.extras['inversionEstimada']).toBe('$2.500.000')
  })

  it('sigue aceptando el shape original (name/phone/source)', () => {
    const parsed = intakeSchema.safeParse({
      name: 'Leo', phone: '+5491155557777', message: 'Info', source: 'landing',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const d = normalizeIntake(parsed.data)
    expect(d.name).toBe('Leo')
    expect(d.phone).toBe('+5491155557777')
    expect(d.source).toBe('landing')
  })

  it('normaliza direccion y ciudad a campos propios (no van a extras)', () => {
    const parsed = intakeSchema.safeParse({
      nombre: 'Ana', telefono: '1155556666', origen: 'landing-cda',
      direccion: 'Av. Siempreviva 742', ciudad: 'Lanús',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const d = normalizeIntake(parsed.data)
    expect(d.direccion).toBe('Av. Siempreviva 742')
    expect(d.localidad).toBe('Lanús')
    expect(d.extras['direccion']).toBeUndefined()
    expect(d.extras['ciudad']).toBeUndefined()

    const resumen = buildIntakeResumen(d)
    expect(resumen).toContain('Dirección: Av. Siempreviva 742')
    expect(resumen).toContain('Localidad: Lanús')
  })

  it('acepta los alias domicilio/localidad', () => {
    const parsed = intakeSchema.safeParse({
      nombre: 'Beto', domicilio: 'Mitre 100', localidad: 'Avellaneda',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const d = normalizeIntake(parsed.data)
    expect(d.direccion).toBe('Mitre 100')
    expect(d.localidad).toBe('Avellaneda')
  })

  it('tolera email vacío y aplica source por defecto', () => {
    const parsed = intakeSchema.safeParse({ nombre: 'Sin Mail', email: '' })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const d = normalizeIntake(parsed.data)
    expect(d.email).toBeNull()
    expect(d.source).toBe('landing')
  })

  it('rechaza payloads sin nombre', () => {
    const parsed = intakeSchema.safeParse({ email: 'x@y.com', phone: '123' })
    expect(parsed.success).toBe(false)
  })
})

describe('buildIntakeResumen', () => {
  it('arma el resumen con etiquetas legibles y el mensaje al final', () => {
    const parsed = intakeSchema.safeParse({
      nombre: 'Juan', empresa: 'Dulces SA', whatsapp: '1155554444',
      producto: 'Alfajores', cantidad: '5.000 a 20.000',
      provincia: 'Córdoba', mensaje: 'Necesito precios',
      origen: 'web-alipro', lead_grade: 'A', lead_score: 8,
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const resumen = buildIntakeResumen(normalizeIntake(parsed.data))
    expect(resumen).toContain('Nueva consulta desde web-alipro')
    expect(resumen).toContain('Empresa: Dulces SA')
    expect(resumen).toContain('Producto: Alfajores')
    expect(resumen).toContain('Volumen mensual: 5.000 a 20.000')
    expect(resumen).toContain('Provincia: Córdoba')
    expect(resumen).toContain('Calificación: A')
    expect(resumen.endsWith('Mensaje: Necesito precios')).toBe(true)
  })

  it('no duplica la etiqueta si vienen cantidad y volumen a la vez', () => {
    const parsed = intakeSchema.safeParse({
      nombre: 'X', cantidad: '1000', volumen: '2000',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const resumen = buildIntakeResumen(normalizeIntake(parsed.data))
    expect(resumen.match(/Volumen mensual:/g)?.length).toBe(1)
    expect(resumen).toContain('Volumen mensual: 1000')
  })
})
