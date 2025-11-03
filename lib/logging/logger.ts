type LogLevel = "info" | "warn" | "error";

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const payload = meta ? { ...meta } : undefined;
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${
    payload ? ` | ${JSON.stringify(payload)}` : ""
  }`;
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log(formatMessage("info", message, meta));
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  console.warn(formatMessage("warn", message, meta));
}

export function logError(message: string, meta?: Record<string, unknown>) {
  console.error(formatMessage("error", message, meta));
}
