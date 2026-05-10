import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EmpresaConfigForm from '@/components/admin/EmpresaConfigForm'

export const metadata = { title: 'Configuración de Empresa' }

export default async function EmpresaConfigPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'admin') redirect('/')

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Configuración de Empresa</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Datos que aparecerán en los documentos emitidos (remitos y proformas)
        </p>
      </div>
      <div className="flex-1 p-6 max-w-xl">
        <EmpresaConfigForm />
      </div>
    </div>
  )
}
