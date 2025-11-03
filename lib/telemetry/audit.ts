export type AuditSeverity = "info" | "warning" | "error";

export type AuditEvent = {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  severity: AuditSeverity;
  message: string;
  meta?: Record<string, unknown>;
};

const MAX_EVENTS = 200;
const events: AuditEvent[] = [];

export function recordAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">) {
  const payload: AuditEvent = {
    ...event,
    id: cryptoRandomId(),
    timestamp: new Date().toISOString()
  };
  events.unshift(payload);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
  return payload;
}

export function listAuditEvents(limit = 20): AuditEvent[] {
  return events.slice(0, limit);
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}
