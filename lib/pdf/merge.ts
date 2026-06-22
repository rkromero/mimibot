import { PDFDocument } from 'pdf-lib'

/**
 * Combina varios PDFs (buffers) en uno solo, en orden, copiando todas las
 * páginas de cada documento. Se usa para imprimir en un solo click los
 * remitos/proformas/etiquetas de varios pedidos seleccionados.
 */
export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) {
    const only = buffers[0]
    if (only) return only
  }

  const merged = await PDFDocument.create()

  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }

  const bytes = await merged.save()
  return Buffer.from(bytes)
}
