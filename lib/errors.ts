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
  console.error('[unhandled error]', err)
  return { message: 'Error interno del servidor', status: 500 }
}
