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

/** Fire-and-forget IP geolocation via ipinfo.io (free, no key, 50k/month) */
export function geoLookup(ip: string, onResult: (geo: Record<string, string>) => void): void {
  if (ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::1')) return;
  fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(4000) })
    .then(r => r.ok ? r.json() : {})
    .then((data: Record<string, string>) => onResult({
      country:  data.country  ?? '',
      region:   data.region   ?? '',
      city:     data.city     ?? '',
      org:      data.org      ?? '',
    }))
    .catch(() => {}); // swallow — geo is best-effort
}
