const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
}

const colorize = (value, color) => {
  if (process.env.NO_COLOR) {
    return value
  }

  return `${color}${value}${COLORS.reset}`
}

const getPathname = (req) => {
  try {
    return new URL(req.originalUrl, "http://localhost").pathname
  } catch {
    return req.originalUrl || req.path || "unknown"
  }
}

const getLogLevel = (statusCode, completed) => {
  if (!completed || statusCode >= 500) {
    return "error"
  }

  if (statusCode >= 400) {
    return "warn"
  }

  return "info"
}

const getLevelColor = (level) => {
  if (level === "error") {
    return COLORS.red
  }

  if (level === "warn") {
    return COLORS.yellow
  }

  return COLORS.green
}

const getStatusColor = (statusCode) => {
  if (statusCode >= 500) {
    return COLORS.red
  }

  if (statusCode >= 400) {
    return COLORS.yellow
  }

  return COLORS.green
}

const writeLog = (level, line) => {
  if (level === "error") {
    console.error(line)
    return
  }

  if (level === "warn") {
    console.warn(line)
    return
  }

  console.log(line)
}

export const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint()

  let logged = false

  const logRequest = (completed) => {
    if (logged) {
      return
    }

    logged = true

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    const statusCode = res.statusCode
    const level = getLogLevel(statusCode, completed)
    const time = new Date().toISOString()
    const lvl = level.toUpperCase().padEnd(5)
    const method = req.method.padEnd(7)
    const path = getPathname(req)
    const status = String(statusCode)
    const duration = `${durationMs.toFixed(2)}ms`

    const line = [
      colorize(time, COLORS.dim),
      colorize(lvl, getLevelColor(level)),
      colorize(method, COLORS.cyan),
      path,
      colorize(status, getStatusColor(statusCode)),
      duration,
    ].join(" ")

    writeLog(level, line)
  }

  res.on("finish", () => logRequest(true))
  res.on("close", () => {
    if (!res.writableEnded) {
      logRequest(false)
    }
  })

  next()
}
