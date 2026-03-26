import { describe, it, expect, vi, afterEach } from 'vitest';
import { log, logError, getClientIp } from '@/lib/logger';

// ── log() ──────────────────────────────────────────────────────────────────────

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes JSON to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('test.event', { foo: 'bar' });
    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.event).toBe('test.event');
    expect(output.foo).toBe('bar');
  });

  it('includes an ISO timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('ts.test');
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('works with no extra data', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('bare.event');
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.event).toBe('bare.event');
  });
});

// ── logError() ─────────────────────────────────────────────────────────────────

describe('logError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes JSON to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('err.event', new Error('boom'));
    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.event).toBe('err.event');
    expect(output.error).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('err.event', 'plain string error');
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.error).toBe('plain string error');
  });

  it('includes extra data alongside the error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('err.event', new Error('fail'), { ip: '1.2.3.4' });
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.ip).toBe('1.2.3.4');
    expect(output.error).toBe('fail');
  });
});

// ── getClientIp() ──────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  function r(headers: Record<string, string>) {
    return new Request('http://localhost/', { headers });
  }

  it('returns the first IP from x-forwarded-for', () => {
    expect(getClientIp(r({ 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
  });

  it('returns only the first IP when multiple are present', () => {
    expect(getClientIp(r({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 172.16.0.1' }))).toBe('203.0.113.5');
  });

  it('trims whitespace from the IP', () => {
    expect(getClientIp(r({ 'x-forwarded-for': '  203.0.113.5  ' }))).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(r({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIp(r({}))).toBe('unknown');
  });
});
