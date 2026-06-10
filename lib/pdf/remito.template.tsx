import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// ─── Shared type ─────────────────────────────────────────────────────────────

export type PedidoData = {
  id: string
  fecha: Date
  clienteNombre: string
  clienteApellido: string
  clienteDireccion?: string
  clienteLocalidad?: string
  clienteProvincia?: string
  clienteCuit?: string
  clienteTelefono?: string
  clienteEmail?: string
  items: Array<{
    productoNombre: string
    cantidad: number
    precioUnitario: string
    subtotal: string
  }>
  total: string
  vendedorNombre: string
  empresa: {
    nombre: string
    direccion?: string
    telefono?: string
    email?: string
    cuit?: string
    condicionIva?: string
    puntoVenta?: string
  }
  metodoEntrega?: 'retiro_fabrica' | 'expreso' | null
  expresoNombre?: string
  expresoDireccion?: string
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export function formatDateLong(date: Date): string {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  return `${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

export function padNumero(n: number): string {
  return String(n).padStart(6, '0')
}

export function formatCurrency(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num)) return value
  return num.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
}

// ─── Shared styles (exported for proforma to reuse) ───────────────────────────

export const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    paddingTop: 28,
    paddingBottom: 130,
    paddingLeft: 40,
    paddingRight: 40,
    color: '#111111',
  },
  // Header: 2-column layout
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  empresaNombre: {
    fontSize: 19,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  empresaMeta: {
    fontSize: 10,
    color: '#555555',
    marginBottom: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  headerRightText: {
    fontSize: 10,
    textAlign: 'right',
    marginBottom: 2,
    color: '#333333',
  },
  // Title block (PROFORMA / REMITO + Nº + thick rule)
  docTitle: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  docNumero: {
    fontSize: 12,
    color: '#444444',
    marginBottom: 3,
  },
  docVendedor: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 8,
  },
  thickRule: {
    borderBottomWidth: 2,
    borderBottomColor: '#111111',
    marginBottom: 14,
  },
  // Client box
  clientBox: {
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#e5e7eb',
    borderRightColor: '#e5e7eb',
    borderBottomColor: '#e5e7eb',
    borderLeftWidth: 3,
    borderLeftColor: '#111111',
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  clientBoxTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  clientRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  clientCol: {
    flex: 1,
    paddingRight: 4,
  },
  clientLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#555555',
    marginBottom: 1,
  },
  clientValue: {
    fontSize: 10,
    color: '#111111',
  },
  // Section title above table
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    padding: 5,
    color: '#111111',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableCell: {
    fontSize: 10,
    padding: 5,
    color: '#222222',
  },
  tableClosingRule: {
    borderBottomWidth: 2,
    borderBottomColor: '#111111',
    marginBottom: 10,
  },
  // Remito column widths (2 columns)
  colDesc: { flex: 5 },
  colQty: { flex: 1, textAlign: 'right' },
  // Bultos
  bultosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  bultosLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginRight: 12,
  },
  bultosBox: {
    width: 42,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#111111',
  },
  // Signatures
  firmasSection: {
    position: 'absolute',
    bottom: 50,
    left: 40,
    right: 40,
    flexDirection: 'row',
  },
  firmaBloque: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  firmaBox: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderColor: '#aaaaaa',
    marginBottom: 5,
  },
  firmaLabel: {
    fontSize: 9,
    color: '#444444',
    textAlign: 'center',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#777777',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 5,
  },
})

// ─── RemitoDocument ───────────────────────────────────────────────────────────

type Props = { data: PedidoData; numero: number }

export function RemitoDocument({ data, numero }: Props) {
  const footerText = [
    data.empresa.nombre,
    data.empresa.cuit ? `CUIT: ${data.empresa.cuit}` : null,
    data.empresa.condicionIva,
  ].filter(Boolean).join(' - ')

  const address = [data.clienteDireccion, data.clienteLocalidad, data.clienteProvincia]
    .filter(Boolean).join(', ') || 'No especificada'

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── Encabezado ──────────────────────────────────────────────────── */}
        <View style={S.header}>
          <View style={{ flex: 1, marginRight: 20 }}>
            <Text style={S.empresaNombre}>{data.empresa.nombre || 'Empresa'}</Text>
            {data.empresa.cuit && (
              <Text style={S.empresaMeta}>CUIT: {data.empresa.cuit}</Text>
            )}
            {data.empresa.direccion && (
              <Text style={S.empresaMeta}>Dirección: {data.empresa.direccion}</Text>
            )}
            {data.empresa.telefono && (
              <Text style={S.empresaMeta}>Tel: {data.empresa.telefono}</Text>
            )}
            {data.empresa.condicionIva && (
              <Text style={S.empresaMeta}>Condición IVA: {data.empresa.condicionIva}</Text>
            )}
          </View>
          <View style={S.headerRight}>
            <Text style={S.headerRightText}>Fecha: {formatDateLong(data.fecha)}</Text>
            {data.empresa.puntoVenta && (
              <Text style={S.headerRightText}>Punto de Venta: {data.empresa.puntoVenta}</Text>
            )}
            <Text style={S.headerRightText}>Comprobante: REMITO</Text>
          </View>
        </View>

        {/* ── Título ──────────────────────────────────────────────────────── */}
        <Text style={S.docTitle}>REMITO</Text>
        <Text style={S.docNumero}>Nº {padNumero(numero)}</Text>
        <Text style={S.docVendedor}>Vendedor: {data.vendedorNombre}</Text>
        <View style={S.thickRule} />

        {/* ── Datos del cliente ────────────────────────────────────────────── */}
        <View style={S.clientBox}>
          <Text style={S.clientBoxTitle}>Datos del Cliente</Text>
          <View style={S.clientRow}>
            <View style={S.clientCol}>
              <Text style={S.clientLabel}>Razón Social</Text>
              <Text style={S.clientValue}>{data.clienteNombre} {data.clienteApellido}</Text>
            </View>
            <View style={S.clientCol}>
              <Text style={S.clientLabel}>CUIT / DNI</Text>
              <Text style={S.clientValue}>{data.clienteCuit ?? 'No especificado'}</Text>
            </View>
          </View>
          <View style={S.clientRow}>
            <View style={S.clientCol}>
              <Text style={S.clientLabel}>Teléfono</Text>
              <Text style={S.clientValue}>{data.clienteTelefono ?? '—'}</Text>
            </View>
            <View style={S.clientCol}>
              <Text style={S.clientLabel}>Email</Text>
              <Text style={S.clientValue}>{data.clienteEmail ?? '—'}</Text>
            </View>
          </View>
          <View style={S.clientRow}>
            <View style={{ flex: 1 }}>
              <Text style={S.clientLabel}>Dirección</Text>
              <Text style={S.clientValue}>{address}</Text>
            </View>
          </View>
        </View>

        {/* ── Método de entrega (si aplica) ────────────────────────────────── */}
        {data.metodoEntrega && (
          <View style={{ marginBottom: 12 }}>
            <Text style={S.sectionTitle}>Método de Entrega</Text>
            <Text style={{ fontSize: 10, color: '#333333' }}>
              {data.metodoEntrega === 'retiro_fabrica'
                ? 'Retiro en fábrica'
                : `Envío por expreso${data.expresoNombre ? ` — ${data.expresoNombre}` : ''}${data.expresoDireccion ? `, ${data.expresoDireccion}` : ''}`}
            </Text>
          </View>
        )}

        {/* ── Detalle de productos ─────────────────────────────────────────── */}
        <Text style={S.sectionTitle}>Detalle de Productos</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderCell, S.colDesc]}>Descripción</Text>
          <Text style={[S.tableHeaderCell, S.colQty]}>Cantidad</Text>
        </View>
        {data.items.map((item, i) => (
          <View key={i} style={S.tableRow}>
            <Text style={[S.tableCell, S.colDesc]}>{item.productoNombre}</Text>
            <Text style={[S.tableCell, S.colQty]}>{item.cantidad}</Text>
          </View>
        ))}
        <View style={S.tableClosingRule} />

        {/* ── Cantidad de bultos ───────────────────────────────────────────── */}
        <View style={S.bultosRow}>
          <Text style={S.bultosLabel}>Cantidad de bultos:</Text>
          <View style={S.bultosBox} />
        </View>

        {/* ── Firmas ──────────────────────────────────────────────────────── */}
        <View style={S.firmasSection}>
          <View style={S.firmaBloque}>
            <View style={S.firmaBox} />
            <Text style={S.firmaLabel}>Firma del cliente</Text>
          </View>
          <View style={S.firmaBloque}>
            <View style={S.firmaBox} />
            <Text style={S.firmaLabel}>Firma del repartidor</Text>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <Text style={S.footer}>{footerText}</Text>

      </Page>
    </Document>
  )
}
