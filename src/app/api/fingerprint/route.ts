import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const h = req.headers;
  return NextResponse.json({
    ip:               getClientIp(req),
    userAgent:        h.get('user-agent'),
    acceptLanguage:   h.get('accept-language'),
    acceptEncoding:   h.get('accept-encoding'),
    accept:           h.get('accept'),
    dnt:              h.get('dnt'),
    secChUa:          h.get('sec-ch-ua'),
    secChUaMobile:    h.get('sec-ch-ua-mobile'),
    secChUaPlatform:  h.get('sec-ch-ua-platform'),
    secFetchSite:     h.get('sec-fetch-site'),
    secFetchMode:     h.get('sec-fetch-mode'),
    connection:       h.get('connection'),
    xForwardedFor:    h.get('x-forwarded-for'),
    xForwardedProto:  h.get('x-forwarded-proto'),
  });
}
