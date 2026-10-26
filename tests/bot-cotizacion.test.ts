import { describe, it, expect } from 'vitest'
import {
  armarNotaPropuestaCreada,
  armarSeccionCotizacion,
  extraerDatosCotizacion,
  parsearCantidad,
  parsearPackaging,
} from '@/lib/claude/bot-cotizacion'

describe('armarSeccionCotizacion', () => {
  it('lista los gramajes del cotizador, el default y el formato del resumen', () => {
    const s = armarSeccionCotizacion([80, 40, 60, 60], 60)
    expect(s).toContain('## Datos para cotizar')
    expect(s).toContain('Opciones: 40 g, 60 g, 80 g')
    expect(s).toContain('es 60 g: no insistas')
    expect(s).toContain('Cantidad: <número de alfajores>')
    expect(s).toContain('Packaging: cristal | personalizado')
  })

  it('sin recetas cargadas ofrece el default como única opción', () => {
    expect(armarSeccionCotizacion([], 60)).toContain('Opciones: 60 g')
  })
})

describe('parsearCantidad', () => {
  it('entiende números con miles, k, mil, unidades y rangos', () => {
    expect(parsearCantidad('500')).toBe(500)
    expect(parsearCantidad('500 unidades')).toBe(500)
    expect(parsearCantidad('2.000')).toBe(2000)
    expect(parsearCantidad('2 000 alfajores')).toBe(2000)
    expect(parsearCantidad('2k')).toBe(2000)
    expect(parsearCantidad('1.5k')).toBe(1500)
    expect(parsearCantidad('2 mil')).toBe(2000)
    expect(parsearCantidad('entre 500 y 1000')).toBe(500)
    expect(parsearCantidad('60 g')).toBe(60)
  })

  it('devuelve null sin número o con cero', () => {
    expect(parsearCantidad('no sabe')).toBeNull()
    expect(parsearCantidad('0')).toBeNull()
    expect(parsearCantidad(null)).toBeNull()
  })
})

describe('parsearPackaging', () => {
  it('mapea sinónimos a cristal / personalizado', () => {
    expect(parsearPackaging('cristal')).toBe('cristal')
    expect(parsearPackaging('flow pack transparente')).toBe('cristal')
    expect(parsearPackaging('personalizado')).toBe('personalizado')
    expect(parsearPackaging('bobina impresa con su marca')).toBe('personalizado')
    expect(parsearPackaging('a definir')).toBeNull()
  })
})

const RESUMEN_COMPLETO = [
  'Empresa: Panadería La Espiga',
  '- Cantidad: 1.200 alfajores por mes',
  '- Gramaje: 80 g',
  '- Packaging: personalizado (con su marca)',
  'Score: 11/14, grado A',
].join('\n')

describe('extraerDatosCotizacion', () => {
  const opts = { gramajesDisponibles: [40, 60, 80], gramajeDefault: 60 }

  it('lee cantidad, gramaje y packaging del resumen', () => {
    const r = extraerDatosCotizacion(RESUMEN_COMPLETO, opts)
    expect(r).toEqual({ ok: true, datos: { cantidad: 1200, gramaje: 80, packaging: 'personalizado', supuestos: [] } })
  })

  it('sin gramaje usa el default y lo aclara; sin packaging asume cristal', () => {
    const r = extraerDatosCotizacion('Cantidad: 300\nGramaje: -\nPackaging: -', opts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos).toMatchObject({ cantidad: 300, gramaje: 60, packaging: 'cristal' })
    expect(r.datos.supuestos).toEqual(['gramaje no indicado: se cotizó 60 g', 'packaging no indicado: se cotizó cristal'])
  })

  it('sin cantidad no cotiza (nunca la inventa)', () => {
    expect(extraerDatosCotizacion('Cantidad: -\nGramaje: 60\nPackaging: cristal', opts)).toEqual({
      ok: false,
      motivo: 'el bot no relevó la cantidad de alfajores',
    })
    expect(extraerDatosCotizacion('Gramaje: 60\nPackaging: cristal', opts).ok).toBe(false)
    expect(extraerDatosCotizacion(null, opts).ok).toBe(false)
  })

  it('con un gramaje que no tiene receta no cotiza', () => {
    expect(extraerDatosCotizacion('Cantidad: 500\nGramaje: 70 g\nPackaging: cristal', opts)).toEqual({
      ok: false,
      motivo: 'no hay receta del cotizador para 70 g',
    })
  })

  it('la línea "Cantidad" no confunde a "Cantidad estimada" ni a otros campos con números', () => {
    const r = extraerDatosCotizacion('Presupuesto: 500000\nCantidad estimada: 800 u\nPackaging: cristal', opts)
    expect(r.ok && r.datos.cantidad).toBe(800)
  })
})

describe('armarNotaPropuestaCreada', () => {
  it('arma la nota con número, datos, total, vigencia y supuestos', () => {
    const nota = armarNotaPropuestaCreada({
      numero: 12,
      datos: { cantidad: 1200, gramaje: 60, packaging: 'cristal', supuestos: ['gramaje no indicado: se cotizó 60 g'] },
      total: 1234567.89,
      vigenteHasta: '02/11/2026',
    })
    expect(nota).toContain('Propuesta PROP-00012 creada automáticamente')
    expect(nota).toContain('1.200 alfajores de 60 g, packaging cristal')
    expect(nota).toContain('total $1.234.568 (IVA incluido)')
    expect(nota).toContain('vigente hasta 02/11/2026')
    expect(nota).toContain('Ojo: gramaje no indicado: se cotizó 60 g.')
  })
})
