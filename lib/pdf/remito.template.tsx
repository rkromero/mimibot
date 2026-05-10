import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export type PedidoData = {
  id: string
  fecha: Date
  clienteNombre: string
  clienteApellido: string
  clienteDireccion?: string
  clienteCuit?: string
  clienteTelefono?: string
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
  }
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    paddingBottom: 12,
  },
  empresaNombre: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  },
  empresaInfo: {
    fontSize: 9,
    color: '#444444',
    marginTop: 2,
  },
  docTipoBlock: {
    alignItems: 'flex-end',
  },
  docTipo: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  docNumero: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
  },
  docFecha: {
    fontSize: 9,
    textAlign: 'right',
    marginTop: 2,
    color: '#444444',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    color: '#666666',
    marginBottom: 4,
  },
  clienteRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  clienteLabel: {
    width: 70,
    fontSize: 9,
    color: '#666666',
  },
  clienteValue: {
    fontSize: 9,
    flex: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: '#000000',
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#000000',
  },
  tableHeaderCell: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    padding: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
  },
  tableCell: {
    fontSize: 9,
    padding: 5,
  },
  colProducto: { flex: 4 },
  colCantidad: { flex: 1, textAlign: 'right' },
  colPrecio: { flex: 2, textAlign: 'right' },
  colSubtotal: { flex: 2, textAlign: 'right' },
  totalBlock: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  totalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginRight: 8,
  },
  totalValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    minWidth: 80,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    paddingTop: 6,
    fontSize: 9,
    color: '#666666',
  },
})

function formatDate(date: Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function padNumero(n: number): string {
  return String(n).padStart(6, '0')
}

function formatCurrency(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num)) return value
  return num.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
}

type Props = { data: PedidoData; numero: number }

export function RemitoDocument({ data, numero }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.empresaNombre}>{data.empresa.nombre || 'Empresa'}</Text>
            {data.empresa.direccion && (
              <Text style={styles.empresaInfo}>{data.empresa.direccion}</Text>
            )}
            {data.empresa.telefono && (
              <Text style={styles.empresaInfo}>Tel: {data.empresa.telefono}</Text>
            )}
            {data.empresa.email && (
              <Text style={styles.empresaInfo}>{data.empresa.email}</Text>
            )}
          </View>
          <View style={styles.docTipoBlock}>
            <Text style={styles.docTipo}>REMITO</Text>
            <Text style={styles.docNumero}>N° {padNumero(numero)}</Text>
            <Text style={styles.docFecha}>Fecha: {formatDate(data.fecha)}</Text>
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Cliente</Text>
          <View style={styles.clienteRow}>
            <Text style={styles.clienteLabel}>Nombre:</Text>
            <Text style={styles.clienteValue}>{data.clienteNombre} {data.clienteApellido}</Text>
          </View>
          {data.clienteDireccion && (
            <View style={styles.clienteRow}>
              <Text style={styles.clienteLabel}>Dirección:</Text>
              <Text style={styles.clienteValue}>{data.clienteDireccion}</Text>
            </View>
          )}
          {data.clienteCuit && (
            <View style={styles.clienteRow}>
              <Text style={styles.clienteLabel}>CUIT:</Text>
              <Text style={styles.clienteValue}>{data.clienteCuit}</Text>
            </View>
          )}
          {data.clienteTelefono && (
            <View style={styles.clienteRow}>
              <Text style={styles.clienteLabel}>Teléfono:</Text>
              <Text style={styles.clienteValue}>{data.clienteTelefono}</Text>
            </View>
          )}
        </View>

        {/* Items table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colProducto]}>Producto</Text>
              <Text style={[styles.tableHeaderCell, styles.colCantidad]}>Cant.</Text>
              <Text style={[styles.tableHeaderCell, styles.colPrecio]}>Precio Unit.</Text>
              <Text style={[styles.tableHeaderCell, styles.colSubtotal]}>Subtotal</Text>
            </View>
            {data.items.map((item, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.colProducto]}>{item.productoNombre}</Text>
                <Text style={[styles.tableCell, styles.colCantidad]}>{item.cantidad}</Text>
                <Text style={[styles.tableCell, styles.colPrecio]}>{formatCurrency(item.precioUnitario)}</Text>
                <Text style={[styles.tableCell, styles.colSubtotal]}>{formatCurrency(item.subtotal)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalBlock}>
            <Text style={styles.totalLabel}>TOTAL:</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.total)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Vendedor: {data.vendedorNombre}</Text>
        </View>
      </Page>
    </Document>
  )
}
