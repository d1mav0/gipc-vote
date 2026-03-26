import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRound, makeVote, makeTableClients, asyncIter, req } from './setup';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/tableClient', () => ({ getTableClient: vi.fn(), ensureTables: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
  geoLookup: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import * as tableLib from '@/lib/tableClient';
import * as nextHeaders from 'next/headers';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockCookies(token?: string) {
  vi.mocked(nextHeaders.cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(token ? { value: token } : undefined),
  } as never);
}

function mockClients(roundOverrides?: Record<string, unknown>, existingVotes: unknown[] = []) {
  const { rounds, votes } = makeTableClients();
  rounds.getEntity.mockResolvedValue(makeRound(roundOverrides));
  votes.listEntities.mockReturnValue(asyncIter(existingVotes));
  vi.mocked(tableLib.getTableClient).mockImplementation(
    (name: string) => (name === 'rounds' ? rounds : votes) as never,
  );
  return { rounds, votes };
}

// ── POST /api/vote ─────────────────────────────────────────────────────────────

describe('POST /api/vote', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(nextHeaders.cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    ({ POST } = await import('@/app/api/vote/route'));
  });

  it('returns 400 when competitor is missing', async () => {
    const res = await POST(req('POST', '/api/vote', {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when no active round exists', async () => {
    const { rounds } = makeTableClients();
    rounds.getEntity.mockRejectedValue(new Error('Not found'));
    vi.mocked(tableLib.getTableClient).mockReturnValue(rounds as never);
    mockCookies();

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active round/i);
  });

  it('returns 400 when round is in draft status', async () => {
    mockClients({ status: 'draft' });
    mockCookies();

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/closed/i);
  });

  it('returns 400 when round is closed', async () => {
    mockClients({ status: 'closed' });
    mockCookies();

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/closed/i);
  });

  it('returns 400 when competitor is not in the round', async () => {
    mockClients();
    mockCookies();

    const res = await POST(req('POST', '/api/vote', { competitor: 'Unknown Person' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid competitor/i);
  });

  it('silently returns 200 when voter has already voted', async () => {
    mockClients({}, [makeVote()]);
    mockCookies('existing-voter-token');

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('stores the vote and returns 200 on success', async () => {
    const { votes } = mockClients();
    mockCookies();

    const res = await POST(req('POST', '/api/vote', { competitor: 'Bob Rossi' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(votes.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({ partitionKey: 'vote', competitor: 'Bob Rossi' }),
    );
  });

  it('sets voter_token cookie for a new voter', async () => {
    mockClients();
    mockCookies(); // no existing cookie

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/voter_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('does not reset cookie when voter already has one', async () => {
    mockClients();
    mockCookies('existing-token-abc');

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(200);

    // Cookie should not be set again
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 500 when vote storage fails', async () => {
    const { votes } = mockClients();
    votes.createEntity.mockRejectedValue(new Error('Storage error'));
    mockCookies();

    const res = await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));
    expect(res.status).toBe(500);
  });

  it('calls geoLookup on successful vote', async () => {
    const { geoLookup } = await import('@/lib/logger');
    mockClients();
    mockCookies();

    await POST(req('POST', '/api/vote', { competitor: 'Carol Müller' }));

    expect(geoLookup).toHaveBeenCalledWith('1.2.3.4', expect.any(Function));
  });

  it('calls geoLookup for duplicate votes', async () => {
    const { geoLookup } = await import('@/lib/logger');
    mockClients({}, [makeVote()]);
    mockCookies('existing-token');

    await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));

    expect(geoLookup).toHaveBeenCalledWith('1.2.3.4', expect.any(Function));
  });

  it('logs vote.closed when round is not open', async () => {
    const { log } = await import('@/lib/logger');
    mockClients({ status: 'closed' });
    mockCookies();

    await POST(req('POST', '/api/vote', { competitor: 'Alice Chen' }));

    expect(log).toHaveBeenCalledWith('vote.closed', expect.objectContaining({ ip: '1.2.3.4' }));
  });
});
