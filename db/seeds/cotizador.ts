import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../schema'
import * as relations from '../relations'
import { eq, and, isNull } from 'drizzle-orm'

const { insumos, recetas, recetaItems, cotizadorConfig } = schema

const client = postgres(process.env['DATABASE_URL']!)
const db = drizzle(client, { schema: { ...schema, ...relations } })

// Valores placeholder: el admin los edita después desde /admin/cotizador

const INSUMOS = [
  { nombre: 'Galletita', tipo: 'galletita', unidad: 'kg', precio: '6000.00' },
  { nombre: 'Dulce de leche', tipo: 'dulce_de_leche', unidad: 'kg', precio: '4500.00' },
  { nombre: 'Chocolate', tipo: 'chocolate', unidad: 'kg', precio: '9000.00' },
  { nombre: 'Bobina', tipo: 'bobina', unidad: 'unidad', precio: '35.00' },
  { nombre: 'Caja', tipo: 'caja', unidad: 'unidad', precio: '550.00' },
] as const

// Componentes por gramaje (gramos de cada insumo kg; suman el gramaje)
const RECETAS: Record<number, { galletita: number; dulce_de_leche: number; chocolate: number }> = {
  55: { galletita: 25, dulce_de_leche: 19, chocolate: 11 },
  60: { galletita: 27, dulce_de_leche: 21, chocolate: 12 },
  70: { galletita: 32, dulce_de_leche: 24, chocolate: 14 },
  80: { galletita: 36, dulce_de_leche: 28, chocolate: 16 },
}

// Cláusula que el PDF agrega solo en propuestas con packaging personalizado
const CONDICIONES_PACKAGING_PERSONALIZADO =
  'Packaging personalizado. La bobina de flowpack impresa es provista por el cliente, ' +
  'quien define el arte, contrata la impresión y asume su costo. ALIPRO puede facilitar ' +
  'contactos de proveedores de impresión y las especificaciones técnicas del material ' +
  '(ancho de bobina, espesor y tipo de film) para asegurar la compatibilidad con nuestra ' +
  'envasadora. El material debe encontrarse en planta antes del inicio de la producción; ' +
  'las demoras en su entrega desplazan el plazo de producción.'

async function seed() {
  console.log('Seeding insumos...')
  for (const insumo of INSUMOS) {
    await db.insert(insumos).values(insumo).onConflictDoNothing()
  }

  const insumosPorTipo = new Map(
    (await db.select().from(insumos)).map((i) => [i.tipo, i.id]),
  )

  console.log('Seeding recetas...')
  for (const [gramajeStr, componentes] of Object.entries(RECETAS)) {
    const gramaje = Number(gramajeStr)
    const existente = await db.query.recetas.findFirst({ where: eq(recetas.gramaje, gramaje) })
    if (existente) {
      console.log(`  ~ receta ${gramaje}g exists`)
      continue
    }
    const [receta] = await db
      .insert(recetas)
      .values({ gramaje, nombre: `Alfajor ${gramaje}g`, esCotizador: true })
      .returning()
    const items = (Object.entries(componentes) as [keyof typeof componentes, number][])
      .map(([tipo, gramos]) => {
        const insumoId = insumosPorTipo.get(tipo)
        if (!insumoId) throw new Error(`Falta el insumo tipo "${tipo}" para la receta de ${gramaje}g`)
        return { recetaId: receta!.id, insumoId, gramos: gramos.toFixed(2) }
      })
    await db.insert(recetaItems).values(items)
    console.log(`  + receta ${gramaje}g`)
  }

  console.log('Seeding condiciones de packaging personalizado...')
  // Solo completa el campo si está vacío: no pisa lo que el admin haya editado
  await db
    .insert(cotizadorConfig)
    .values({ id: 1, condicionesPackagingPersonalizado: CONDICIONES_PACKAGING_PERSONALIZADO })
    .onConflictDoNothing()
  const actualizadas = await db
    .update(cotizadorConfig)
    .set({ condicionesPackagingPersonalizado: CONDICIONES_PACKAGING_PERSONALIZADO })
    .where(and(eq(cotizadorConfig.id, 1), isNull(cotizadorConfig.condicionesPackagingPersonalizado)))
    .returning({ id: cotizadorConfig.id })
  console.log(actualizadas.length > 0 ? '  + texto default cargado' : '  ~ ya tenía texto, no se pisa')

  console.log('Done.')
  await client.end()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
