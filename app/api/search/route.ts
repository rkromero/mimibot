import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes, productos, contacts } from '@/db/schema'
import { ilike, or, isNull, and, eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const q = req.nextUrl.searchParams.get('q')?.trim()
    if (!q || q.length < 2) {
      return NextResponse.json({ clientes: [], productos: [], contactos: [] })
    }

    const pattern = `%${q}%`

    const [clientesRows, productosRows, contactosRows] = await Promise.all([
      db
        .select({
          id: clientes.id,
          nombre: clientes.nombre,
          apellido: clientes.apellido,
          telefono: clientes.telefono,
          email: clientes.email,
        })
        .from(clientes)
        .where(
          and(
            isNull(clientes.deletedAt),
            or(
              ilike(clientes.nombre, pattern),
              ilike(clientes.apellido, pattern),
              ilike(clientes.telefono, pattern),
              ilike(clientes.email, pattern),
              ilike(clientes.cuit, pattern),
            ),
          ),
        )
        .limit(6),

      db
        .select({
          id: productos.id,
          nombre: productos.nombre,
          sku: productos.sku,
          precio: productos.precio,
          categoria: productos.categoria,
        })
        .from(productos)
        .where(
          and(
            isNull(productos.deletedAt),
            eq(productos.activo, true),
            or(ilike(productos.nombre, pattern), ilike(productos.sku, pattern)),
          ),
        )
        .limit(6),

      db
        .select({
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(
          or(ilike(contacts.name, pattern), ilike(contacts.phone, pattern)),
        )
        .limit(4),
    ])

    return NextResponse.json({
      clientes: clientesRows,
      productos: productosRows,
      contactos: contactosRows,
    })
  } catch (err) {
    console.error('[search]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
