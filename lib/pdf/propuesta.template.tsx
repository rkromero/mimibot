import React from 'react'
import path from 'path'
import fs from 'fs'
import { Document, Page, View, Text, Image, Font, StyleSheet } from '@react-pdf/renderer'

// ─── Fuentes ──────────────────────────────────────────────────────────────────
// Montserrat estático para el PDF: la carga de next/font en app/layout.tsx solo
// aplica a la web; @react-pdf necesita los TTF (public/fonts).
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')
Font.register({
  family: 'Montserrat',
  fonts: [
    { src: path.join(FONTS_DIR, 'Montserrat-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(FONTS_DIR, 'Montserrat-SemiBold.ttf'), fontWeight: 'bold' },
  ],
})

// ⚠️ LOGO ALIPRO — public/icon-512.png es BAJA RESOLUCIÓN (icono de PWA).
// Cuando esté el archivo en alta, reemplazar SOLO esta constante con la ruta
// nueva (ej: public/brand/alipro-logo.png). Es el único lugar que la referencia.
const LOGO_PATH = path.join(process.cwd(), 'public', 'icon-512.png')

// Se embebe como buffer: pasarle la ruta a <Image> hace que react-pdf intente
// un fetch (falla con paths locales). Si el archivo falta, el PDF sale sin logo.
const LOGO_SRC = (() => {
  try {
    return { data: fs.readFileSync(LOGO_PATH), format: 'png' as const }
  } catch {
    return null
  }
})()

// ─── Paleta ALIPRO (manual de marca v2.2) ─────────────────────────────────────
const ROJO = '#C8102E'
const CARBON = '#2B2E33'
const GRIS = '#6A7076'
const ROJO_SUAVE = '#FBE9EC'
const GRIS_CLARO = '#F2F2F0'
const BORDE = '#E4E6E8'

// ─── Datos ────────────────────────────────────────────────────────────────────

export type PropuestaEscenarioPdf = {
  cantidad: number
  precioUnitNeto: number
  neto: number
  iva: number
  total: number
  setup: number
  elegido: boolean
}

export type PropuestaPdfData = {
  numero: number
  fechaEmision: Date
  /** YYYY-MM-DD (congelado en la propuesta) */
  vigenteHasta: string
  cliente: {
    nombre: string
    empresa: string | null
    telefono: string | null
    email: string | null
  }
  cantidad: number
  gramaje: number
  packaging: 'cristal' | 'personalizado'
  escenarios: PropuestaEscenarioPdf[]
  condicionesComerciales: string | null
  validezDias: number
  vendedorNombre: string
  empresa: {
    nombre: string
    cuit: string | null
    direccion: string | null
    telefono: string | null
    email: string | null
  }
}

export function formatNumeroPropuesta(n: number): string {
  return `PROP-${String(n).padStart(5, '0')}`
}

export type CondicionClausula = {
  /** Numeración + texto hasta el primer punto (va en negrita); '' si no hay punto */
  titulo: string
  resto: string
}

// Parsea el texto de condiciones comerciales: cláusulas separadas por línea en
// blanco, con el título en negrita hasta el primer punto (salteando la
// numeración inicial "1." / "1)" para no cortar ahí). Si la primera línea es
// "CONDICIONES COMERCIALES" se descarta: el bloque ya tiene su encabezado.
export function parseCondiciones(texto: string): CondicionClausula[] {
  const limpio = texto.trim().replace(/^condiciones comerciales:?[ \t]*(\r?\n+|$)/i, '')
  return limpio
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((parrafo) => {
      const numeracion = /^(\d+[.)][ \t]*)/.exec(parrafo)?.[1] ?? ''
      const cuerpo = parrafo.slice(numeracion.length)
      const punto = cuerpo.indexOf('.')
      if (punto === -1) return { titulo: '', resto: parrafo }
      return {
        titulo: numeracion + cuerpo.slice(0, punto + 1),
        resto: cuerpo.slice(punto + 1).trim(),
      }
    })
}

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
}

function cantidad(n: number): string {
  return n.toLocaleString('es-AR')
}

function fechaLarga(d: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const E = StyleSheet.create({
  page: {
    fontFamily: 'Montserrat',
    fontSize: 9,
    paddingTop: 32,
    paddingBottom: 92,
    paddingHorizontal: 42,
    color: CARBON,
    backgroundColor: '#FFFFFF',
  },
  // Cabezal
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 34, height: 34, marginRight: 10 },
  brandName: { fontSize: 20, fontWeight: 'bold', color: CARBON, letterSpacing: 2 },
  headerMeta: { alignItems: 'flex-end' },
  propNumero: { fontSize: 15, fontWeight: 'bold', color: ROJO },
  headerMetaText: { fontSize: 8.5, color: GRIS, marginTop: 2 },
  franjaRoja: { height: 4, backgroundColor: ROJO, marginBottom: 16 },

  // Cliente
  clientBox: {
    flexDirection: 'row',
    backgroundColor: GRIS_CLARO,
    borderLeftWidth: 3,
    borderLeftColor: ROJO,
    borderRadius: 3,
    padding: 10,
    marginBottom: 16,
  },
  clientCol: { flex: 1, paddingRight: 6 },
  label: { fontSize: 7, fontWeight: 'bold', color: GRIS, textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: 9.5, color: CARBON },

  // Servicio
  servicioTitle: { fontSize: 13, fontWeight: 'bold', color: CARBON, marginBottom: 3 },
  servicioDetalle: { fontSize: 9.5, color: GRIS, marginBottom: 14 },

  // Tabla de escenarios
  tableTitle: { fontSize: 9, fontWeight: 'bold', color: CARBON, textTransform: 'uppercase', marginBottom: 5, letterSpacing: 0.5 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: CARBON,
    paddingBottom: 4,
  },
  th: { fontSize: 8, fontWeight: 'bold', color: GRIS, textTransform: 'uppercase' },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDE,
    paddingVertical: 6,
    alignItems: 'center',
  },
  trElegido: { backgroundColor: ROJO_SUAVE },
  td: { fontSize: 9.5, color: CARBON },
  tdBold: { fontWeight: 'bold' },
  colCant: { flex: 1.4, paddingLeft: 4 },
  colNum: { flex: 1.6, textAlign: 'right', paddingRight: 4 },
  elegidoTag: { fontSize: 6.5, fontWeight: 'bold', color: ROJO, textTransform: 'uppercase' },
  setupLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: GRIS_CLARO,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  setupText: { fontSize: 8.5, color: CARBON },
  notaTabla: { fontSize: 7.5, color: GRIS, marginTop: 5 },

  // Condiciones
  condBox: {
    backgroundColor: GRIS_CLARO,
    borderWidth: 1,
    borderColor: BORDE,
    borderRadius: 3,
    padding: 10,
    marginTop: 16,
  },
  condTitle: { fontSize: 8.5, fontWeight: 'bold', color: CARBON, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  condText: { fontSize: 7.5, color: GRIS, lineHeight: 1.4, marginBottom: 3 },
  condClausulaTitulo: { fontWeight: 'bold', color: CARBON },
  condValidez: { fontSize: 7.5, color: GRIS, lineHeight: 1.4, marginTop: 1 },

  // Pie
  footer: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 34,
    borderTopWidth: 1.5,
    borderTopColor: ROJO,
    paddingTop: 8,
  },
  footerEmpresa: { fontSize: 8, fontWeight: 'bold', color: CARBON, marginBottom: 2 },
  footerMeta: { fontSize: 7.5, color: GRIS, marginBottom: 1 },
})

// ─── Documento (una sola hoja A4) ─────────────────────────────────────────────

export function PropuestaDocument({ data }: { data: PropuestaPdfData }) {
  const numeroFmt = formatNumeroPropuesta(data.numero)
  const setupElegido = data.escenarios.find((e) => e.elegido)?.setup ?? 0

  const footerLinea1 = [
    data.empresa.nombre || 'ALIPRO',
    data.empresa.cuit ? `CUIT ${data.empresa.cuit}` : null,
  ].filter(Boolean).join(' · ')
  const footerLinea2 = [data.empresa.direccion, data.empresa.telefono, data.empresa.email]
    .filter(Boolean).join(' · ')

  return (
    <Document title={numeroFmt} author="ALIPRO">
      <Page size="A4" style={E.page}>

        {/* 1 ── Cabezal */}
        <View style={E.headerRow}>
          <View style={E.headerBrand}>
            {LOGO_SRC && <Image src={LOGO_SRC} style={E.logo} />}
            <Text style={E.brandName}>ALIPRO</Text>
          </View>
          <View style={E.headerMeta}>
            <Text style={E.propNumero}>{numeroFmt}</Text>
            <Text style={E.headerMetaText}>Emitida el {fechaLarga(data.fechaEmision)}</Text>
            <Text style={E.headerMetaText}>Válida hasta {fechaCorta(data.vigenteHasta)}</Text>
          </View>
        </View>
        <View style={E.franjaRoja} />

        {/* 2 ── Cliente */}
        <View style={E.clientBox}>
          <View style={E.clientCol}>
            <Text style={E.label}>Contacto</Text>
            <Text style={E.value}>{data.cliente.nombre}</Text>
          </View>
          <View style={E.clientCol}>
            <Text style={E.label}>Empresa</Text>
            <Text style={E.value}>{data.cliente.empresa ?? '—'}</Text>
          </View>
          <View style={E.clientCol}>
            <Text style={E.label}>Teléfono</Text>
            <Text style={E.value}>{data.cliente.telefono ?? '—'}</Text>
          </View>
          <View style={E.clientCol}>
            <Text style={E.label}>Email</Text>
            <Text style={E.value}>{data.cliente.email ?? '—'}</Text>
          </View>
        </View>

        {/* 3 ── Servicio cotizado */}
        <Text style={E.servicioTitle}>Producción de alfajores a fasón</Text>
        <Text style={E.servicioDetalle}>
          {cantidad(data.cantidad)} unidades · alfajor de {data.gramaje} g · packaging{' '}
          {data.packaging === 'personalizado' ? 'personalizado' : 'cristal'}
        </Text>

        {/* 4 ── Escenarios */}
        <Text style={E.tableTitle}>Precios por volumen</Text>
        <View style={E.tableHeader}>
          <Text style={[E.th, E.colCant]}>Cantidad</Text>
          <Text style={[E.th, E.colNum]}>Precio unit.</Text>
          <Text style={[E.th, E.colNum]}>Neto</Text>
          <Text style={[E.th, E.colNum]}>IVA 21%</Text>
          <Text style={[E.th, E.colNum]}>Total</Text>
        </View>
        {data.escenarios.map((esc) => (
          <View key={esc.cantidad} style={esc.elegido ? [E.tr, E.trElegido] : E.tr}>
            <View style={E.colCant}>
              <Text style={esc.elegido ? [E.td, E.tdBold] : E.td}>{cantidad(esc.cantidad)} u.</Text>
              {esc.elegido && <Text style={E.elegidoTag}>Cotizada</Text>}
            </View>
            <Text style={esc.elegido ? [E.td, E.tdBold, E.colNum] : [E.td, E.colNum]}>{money(esc.precioUnitNeto)}</Text>
            <Text style={esc.elegido ? [E.td, E.tdBold, E.colNum] : [E.td, E.colNum]}>{money(esc.neto)}</Text>
            <Text style={esc.elegido ? [E.td, E.tdBold, E.colNum] : [E.td, E.colNum]}>{money(esc.iva)}</Text>
            <Text style={esc.elegido ? [E.td, E.tdBold, E.colNum] : [E.td, E.colNum]}>{money(esc.total)}</Text>
          </View>
        ))}
        {data.packaging === 'personalizado' && setupElegido > 0 && (
          <View style={E.setupLine}>
            <Text style={[E.setupText, E.tdBold]}>Cargo por única vez — setup de packaging personalizado</Text>
            <Text style={[E.setupText, E.tdBold]}>{money(setupElegido)}</Text>
          </View>
        )}
        <Text style={E.notaTabla}>
          Importes netos con IVA 21% discriminado.
          {data.packaging === 'personalizado' && setupElegido > 0
            ? ' El cargo de setup ya está incluido en el neto y el total de cada escenario.'
            : ''}
        </Text>

        {/* 5 ── Condiciones comerciales */}
        <View style={E.condBox}>
          <Text style={E.condTitle}>Condiciones comerciales</Text>
          {parseCondiciones(data.condicionesComerciales ?? '').map((clausula, i) => (
            <Text key={i} style={E.condText}>
              {clausula.titulo ? (
                <Text style={E.condClausulaTitulo}>{clausula.titulo}{clausula.resto ? ' ' : ''}</Text>
              ) : null}
              {clausula.resto}
            </Text>
          ))}
          <Text style={E.condValidez}>
            Propuesta válida por {data.validezDias} días desde su emisión (hasta el {fechaCorta(data.vigenteHasta)}).
          </Text>
        </View>

        {/* 6 ── Pie */}
        <View style={E.footer} fixed>
          <Text style={E.footerEmpresa}>{footerLinea1}</Text>
          {footerLinea2 ? <Text style={E.footerMeta}>{footerLinea2}</Text> : null}
          <Text style={E.footerMeta}>Atendido por {data.vendedorNombre}</Text>
        </View>

      </Page>
    </Document>
  )
}
