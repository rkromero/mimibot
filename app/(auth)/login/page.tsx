import { Suspense } from 'react'
import BrandLogo from '@/components/shared/BrandLogo'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo centrado arriba */}
        <div className="flex flex-col items-center mb-8">
          <BrandLogo className="h-8 w-auto text-primary dark:text-white" />
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">CRM</p>
        </div>

        {/* Tarjeta del formulario */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <div className="mb-6 text-center">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Iniciar sesión
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Ingresá con tu cuenta del CRM
            </p>
          </div>
          <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          © ALIPRO
        </p>
      </div>
    </div>
  )
}
