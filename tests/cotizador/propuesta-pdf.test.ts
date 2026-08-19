import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { PropuestaDocument, type PropuestaPdfData } from '@/lib/pdf/propuesta.template'
import { armarDatosPropuestaPdf } from '@/lib/pdf/propuesta.service'
import type { propuestas } from '@/db/schema'

// armarDatosPropuestaPdf es puro; el stub evita instanciar el cliente de db
vi.mock('@/db', () => ({ db: {} }))

type PropuestaRow = typeof propuestas.$inferSelect

// Datos de estrés: empresa y contacto largos, cantidades de 6 cifras,
// importes de 9 dígitos, condiciones extensas y setup de personalizado.
const DATA_ESTRES: PropuestaPdfData = {
  numero: 42,
  fechaEmision: new Date('2026-08-19T14:00:00Z'),
  vigenteHasta: '2026-08-26',
  cliente: {
    nombre: 'María de los Ángeles Fernández de Kirchhoff Etchegoyen',
    empresa: 'Distribuidora Panamericana de Alimentos, Golosinas y Productos Regionales del Sur S.R.L. — Casa Central Rosario',
    telefono: '+54 9 341 555-0199',
    email: 'compras.regionales@distribuidorapanamericana.com.ar',
  },
  cantidad: 100_000,
  gramaje: 80,
  packaging: 'personalizado',
  escenarios: [
    { cantidad: 100_000, precioUnitNeto: 1489.75, neto: 149_125_000, iva: 31_316_250, total: 180_441_250, setup: 150_000, elegido: true },
    { cantidad: 500_000, precioUnitNeto: 1415.26, neto: 707_780_000, iva: 148_633_800, total: 856_413_800, setup: 150_000, elegido: false },
    { cantidad: 999_999, precioUnitNeto: 1340.78, neto: 1_340_778_659, iva: 281_563_518.39, total: 1_622_342_177.39, setup: 150_000, elegido: false },
  ],
  condicionesComerciales:
    'Precios expresados en pesos argentinos, netos de IVA. Entrega en planta ALIPRO, Parque Industrial. ' +
    'Seña del 50% a la confirmación de la orden de compra y saldo contra aviso de despacho. ' +
    'El plazo de producción es de 15 días hábiles desde la aprobación del arte de packaging. ' +
    'Los precios pueden revisarse ante variaciones significativas del costo de materias primas.',
  validezDias: 7,
  vendedorNombre: 'Juan Ignacio Rodríguez Saá',
  empresa: {
    nombre: 'ALIPRO Alimentos Profesionales S.A.S.',
    cuit: '30-71234567-8',
    direccion: 'Av. de los Constituyentes 4550, Parque Industrial, CABA',
    telefono: '+54 11 4555-0100',
    email: 'ventas@alipro.com.ar',
  },
}

describe('PropuestaDocument (PDF)', () => {
  it('entra en UNA sola hoja A4 con datos de estrés', async () => {
    const element = React.createElement(PropuestaDocument, { data: DATA_ESTRES }) as React.ReactElement<DocumentProps>
    const buffer = await renderToBuffer(element)

    expect(Buffer.from(buffer).subarray(0, 5).toString()).toBe('%PDF-')

    const doc = await PDFDocument.load(new Uint8Array(buffer))
    expect(doc.getPageCount()).toBe(1)

    const page = doc.getPage(0)
    // A4 en puntos: 595.28 × 841.89
    expect(Math.round(page.getWidth())).toBe(595)
    expect(Math.round(page.getHeight())).toBe(842)
  }, 30_000)
})

describe('armarDatosPropuestaPdf — solo del snapshot congelado', () => {
  // Los importes del resultado congelado son centinelas: NO salen de recalcular
  // nada — si el builder consultara o recalculara desde la config vigente,
  // estos números no podrían aparecer en la salida.
  const RESULTADO_CONGELADO = {
    escenarios: [
      { cantidad: 1000, precioUnitNeto: 111_111.11, neto: 111_111_110, iva: 23_333_333.1, total: 134_444_443.1, setup: 0, elegido: true },
    ],
  }

  const PROPUESTA: PropuestaRow = {
    id: 'prop-1',
    numero: 42,
    leadId: 'lead-1',
    cantidad: 1000,
    gramaje: 60,
    packaging: 'cristal',
    descuentoManualPct: '0.00',
    snapshot: { validezDias: 14, condicionesComerciales: 'Condiciones congeladas al cotizar.' },
    resultado: RESULTADO_CONGELADO,
    estado: 'aprobada',
    vigenteHasta: '2026-09-02',
    creadoPor: 'user-1',
    aprobadoPor: null,
    createdAt: new Date('2026-08-19T14:00:00Z'),
    updatedAt: new Date('2026-08-19T14:00:00Z'),
    deletedAt: null,
  }

  it('copia escenarios, condiciones y validez de la propuesta guardada, sin recalcular', () => {
    const data = armarDatosPropuestaPdf(
      PROPUESTA,
      { name: 'Cliente Test', phone: '+549111111', email: 'c@test.com' },
      'Empresa Test SA',
      'Vendedor Test',
      { nombre: 'ALIPRO', cuit: null, direccion: null, telefono: null, email: null },
    )

    // Escenarios idénticos al resultado congelado (centinelas intactos)
    expect(data.escenarios).toEqual(RESULTADO_CONGELADO.escenarios)
    // Condiciones y validez del snapshot congelado, no de cotizador_config
    expect(data.condicionesComerciales).toBe('Condiciones congeladas al cotizar.')
    expect(data.validezDias).toBe(14)
    expect(data.vigenteHasta).toBe('2026-09-02')
    expect(data.numero).toBe(42)
  })
})
