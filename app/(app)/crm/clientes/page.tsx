import { Suspense } from 'react'
import ClientesListView from '@/components/crm/clientes/ClientesListView'

export default function ClientesPage() {
  return (
    <Suspense>
      <ClientesListView />
    </Suspense>
  )
}
