export function log(event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data, ts: new Date().toISOString() }));
}

export function logError(event: string, error: unknown, data?: Record<string, unknown>) {
  console.error(JSON.stringify({
    event,
    ...data,
    error: error instanceof Error ? error.message : String(error),
    ts: new Date().toISOString(),
  }));
}

/** Extract the real client IP from Azure App Service headers */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
