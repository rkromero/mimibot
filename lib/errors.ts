export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class AuthzError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 403, 'AUTHZ_ERROR')
    this.name = 'AuthzError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} no encontrado`, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export function toApiError(err: unknown): { message: string; code?: string; status: number } {
  if (err instanceof AppError) {
    return { message: err.message, code: err.code, status: err.statusCode }
  }
  // Log with full context so the trace appears in Railway logs
  const rawMessage = err instanceof Error ? err.message : String(err)
  const rawStack = err instanceof Error ? err.stack : undefined
  console.error('[unhandled error]', { message: rawMessage, stack: rawStack, err })
  // Expose underlying error message only when explicitly enabled via env flag.
  // Useful for short-term diagnosis on a deployed environment without leaking
  // sensitive details by default.
  const expose = process.env['EXPOSE_ERROR_DETAILS'] === '1'
  return {
    message: expose ? `Error interno: ${rawMessage}` : 'Error interno del servidor',
    status: 500,
  }
}
