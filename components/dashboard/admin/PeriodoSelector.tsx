'use client'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface PeriodoSelectorProps {
  anio: number
  mes: number
  onChange: (anio: number, mes: number) => void
}

export default function PeriodoSelector({ anio, mes, onChange }: PeriodoSelectorProps) {
  function prev() {
    if (mes === 1) {
      onChange(anio - 1, 12)
    } else {
      onChange(anio, mes - 1)
    }
  }

  function next() {
    if (mes === 12) {
      onChange(anio + 1, 1)
    } else {
      onChange(anio, mes + 1)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={prev}
        className="flex items-center justify-center w-8 h-8 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-100"
        aria-label="Mes anterior"
      >
        ←
      </button>
      <span className="text-sm font-medium text-foreground min-w-[140px] text-center">
        {MESES[mes - 1]} {anio}
      </span>
      <button
        onClick={next}
        className="flex items-center justify-center w-8 h-8 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-100"
        aria-label="Mes siguiente"
      >
        →
      </button>
    </div>
  )
}
