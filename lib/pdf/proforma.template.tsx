import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { S, type PedidoData, formatDateLong, padNumero, formatCurrency } from './remito.template'

// ─── Proforma-specific styles ─────────────────────────────────────────────────

const P = StyleSheet.create({
  // Table columns (4 columns)
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 2, textAlign: 'right' },
  colSubtotal: { flex: 2, textAlign: 'right' },
  // Totals block (right-aligned)
  totalsSection: {
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  totalRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  totalLabel: {
    fontSize: 9,
    color: '#333333',
    textAlign: 'right',
    marginRight: 10,
    minWidth: 70,
  },
  totalValue: {
    fontSize: 9,
    color: '#111111',
    textAlign: 'right',
    minWidth: 80,
  },
  totalDivider: {
    width: 165,
    borderBottomWidth: 1,
    borderBottomColor: '#111111',
    marginBottom: 4,
  },
  totalFinalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    marginRight: 10,
    minWidth: 70,
  },
  totalFinalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    minWidth: 80,
  },
  // Información Fiscal box
  infoBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  infoBullet: {
    fontSize: 8,
    color: '#1e40af',
    marginBottom: 2,
  },
})

// ─── ProformaDocument ─────────────────────────────────────────────────────────

type Props = { data: PedidoData; numero: number; saldoPendiente?: string }

export function ProformaDocument({ data, numero }: Props) {
  const footerText = [
    data.empresa.nombre,
    data.empresa.cuit ? `CUIT: ${data.empresa.cuit}` : null,
    data.empresa.condicionIva,
  ].filter(Boolean).join(' - ')

  const address = [data.clienteDireccion, data.clienteLocalidad, data.clienteProvincia]
    .filter(Boolean).join(', ') || 'No especificada'

  // El costo de envío ya viene incluido en data.total; lo separamos para mostrarlo
  // como un concepto aparte y dejar el subtotal solo con los productos.
  const envio = parseFloat(data.costoEnvio ?? '0') || 0
  const subtotalProductos = (parseFloat(data.total) - envio).toFixed(2)

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
            {data.empresa.condicionIva && (
              <Text style={S.empresaMeta}>Condición IVA: {data.empresa.condicionIva}</Text>
            )}
          </View>
          <View style={S.headerRight}>
            <Text style={S.headerRightText}>Fecha: {formatDateLong(data.fecha)}</Text>
            {data.empresa.puntoVenta && (
              <Text style={S.headerRightText}>Punto de Venta: {data.empresa.puntoVenta}</Text>
            )}
            <Text style={S.headerRightText}>Comprobante: PROFORMA</Text>
          </View>
        </View>

        {/* ── Título ──────────────────────────────────────────────────────── */}
        <Text style={S.docTitle}>PROFORMA</Text>
        <Text style={S.docNumero}>Nº {padNumero(numero)}</Text>
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

        {/* ── Detalle de productos ─────────────────────────────────────────── */}
        <Text style={S.sectionTitle}>Detalle de Productos</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderCell, P.colDesc]}>Descripción</Text>
          <Text style={[S.tableHeaderCell, P.colQty]}>Cantidad</Text>
          <Text style={[S.tableHeaderCell, P.colPrice]}>Precio Unit.</Text>
          <Text style={[S.tableHeaderCell, P.colSubtotal]}>Subtotal</Text>
        </View>
        {data.items.map((item, i) => (
          <View key={i} style={S.tableRow}>
            <Text style={[S.tableCell, P.colDesc]}>
              {item.productoNombre}
              {item.productoDescripcion ? (
                <Text style={S.itemDescripcion}>{'  '}{item.productoDescripcion}</Text>
              ) : null}
            </Text>
            <Text style={[S.tableCell, P.colQty]}>{item.cantidad}</Text>
            <Text style={[S.tableCell, P.colPrice]}>{formatCurrency(item.precioUnitario)}</Text>
            <Text style={[S.tableCell, P.colSubtotal]}>{formatCurrency(item.subtotal)}</Text>
          </View>
        ))}
        <View style={S.tableClosingRule} />

        {/* ── Totales ──────────────────────────────────────────────────────── */}
        <View style={P.totalsSection}>
          <View style={P.totalRow}>
            <Text style={P.totalLabel}>Subtotal:</Text>
            <Text style={P.totalValue}>{formatCurrency(subtotalProductos)}</Text>
          </View>
          {envio > 0 && (
            <View style={P.totalRow}>
              <Text style={P.totalLabel}>Envío:</Text>
              <Text style={P.totalValue}>{formatCurrency(envio.toFixed(2))}</Text>
            </View>
          )}
          <View style={P.totalRow}>
            <Text style={P.totalLabel}>IVA 21%:</Text>
            <Text style={P.totalValue}>$ 0,00</Text>
          </View>
          <View style={P.totalDivider} />
          <View style={P.totalRow}>
            <Text style={P.totalFinalLabel}>TOTAL:</Text>
            <Text style={P.totalFinalValue}>{formatCurrency(data.total)}</Text>
          </View>
        </View>

        {/* ── Información Fiscal ───────────────────────────────────────────── */}
        <View style={P.infoBox}>
          <Text style={P.infoTitle}>Información Fiscal</Text>
          <Text style={P.infoBullet}>• Este documento es una proforma según normativa AFIP</Text>
          <Text style={P.infoBullet}>• No corresponde IVA discriminado</Text>
          <Text style={P.infoBullet}>• Conserve este comprobante para su contabilidad</Text>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <Text style={S.footer}>{footerText}</Text>

      </Page>
    </Document>
  )
}
