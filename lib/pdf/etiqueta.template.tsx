import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// Label size: 10 × 15 cm in points (1 cm = 28.346 pt)
const LABEL_SIZE: [number, number] = [283.46, 425.2]

export type EtiquetaData = {
  pedidoId: string
  clienteNombre: string
  clienteApellido: string
  clienteTelefono?: string
  /** Resolved delivery address lines (ready to display) */
  entregaLineas: string[]
  empresa: { nombre: string }
  totalItems: number
  observaciones?: string
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 16,
    color: '#000000',
  },
  remitente: {
    fontSize: 8,
    color: '#555555',
    marginBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    paddingBottom: 6,
  },
  paraLabel: {
    fontSize: 9,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  destinatario: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 12,
    lineHeight: 1.2,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#aaaaaa',
    marginBottom: 10,
  },
  entregaLabel: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  entregaLinea: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
    lineHeight: 1.3,
  },
  entregaSubLinea: {
    fontSize: 11,
    marginBottom: 2,
    color: '#222222',
  },
  spacer: {
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  metaLabel: {
    fontSize: 9,
    color: '#666666',
    width: 50,
  },
  metaValue: {
    fontSize: 9,
    flex: 1,
  },
  numeroPedido: {
    marginTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    paddingTop: 6,
  },
  numeroPedidoText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
})

export function EtiquetaDocument({ data }: { data: EtiquetaData }) {
  const [firstLinea, ...restLineas] = data.entregaLineas

  return (
    <Document>
      <Page size={LABEL_SIZE} style={styles.page}>

        {/* Remitente */}
        <Text style={styles.remitente}>
          De: {data.empresa.nombre || 'Empresa'}
        </Text>

        {/* Destinatario */}
        <Text style={styles.paraLabel}>Para</Text>
        <Text style={styles.destinatario}>
          {data.clienteNombre} {data.clienteApellido}
        </Text>

        <View style={styles.divider} />

        {/* Entrega */}
        <Text style={styles.entregaLabel}>Dirección de entrega</Text>
        {firstLinea && (
          <Text style={styles.entregaLinea}>{firstLinea}</Text>
        )}
        {restLineas.map((linea, i) => (
          <Text key={i} style={styles.entregaSubLinea}>{linea}</Text>
        ))}

        <View style={styles.spacer} />

        {/* Teléfono */}
        {data.clienteTelefono && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Tel:</Text>
            <Text style={styles.metaValue}>{data.clienteTelefono}</Text>
          </View>
        )}

        {/* Bultos */}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bultos:</Text>
          <Text style={styles.metaValue}>{data.totalItems}</Text>
        </View>

        {/* Observaciones */}
        {data.observaciones && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Obs:</Text>
            <Text style={styles.metaValue}>{data.observaciones}</Text>
          </View>
        )}

        {/* Número de pedido */}
        <View style={styles.numeroPedido}>
          <Text style={styles.numeroPedidoText}>
            Pedido #{data.pedidoId.slice(-8).toUpperCase()}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
