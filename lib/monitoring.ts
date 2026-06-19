type LogLevel = 'info' | 'warn' | 'error'

type LogPayload = {
  event: string
  level?: LogLevel
  userId?: string | null
  route?: string
  metadata?: Record<string, unknown>
  error?: unknown
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    }
  }

  return error
}

export function logServerEvent(payload: LogPayload) {
  const level = payload.level ?? 'info'
  const entry = {
    ts: new Date().toISOString(),
    app: 'ballsai',
    level,
    event: payload.event,
    userId: payload.userId ?? null,
    route: payload.route,
    metadata: payload.metadata ?? {},
    error: payload.error ? serializeError(payload.error) : undefined,
  }

  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

export function logServerError(payload: Omit<LogPayload, 'level'>) {
  logServerEvent({ ...payload, level: 'error' })
}
