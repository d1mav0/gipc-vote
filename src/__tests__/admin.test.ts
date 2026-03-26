import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRound, makeVote, makeAdminSession, makeTableClients, asyncIter, req } from './setup';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/tableClient', () => ({ getTableClient: vi.fn(), ensureTables: vi.fn() }));
vi.mock('@/lib/session', () => ({ getAdminSession: vi.fn() }));

import * as tableLib from '@/lib/tableClient';
import * as sessionLib from '@/lib/session';

// ── Helpers ────────────────────────────────────────────────────────────────────

function asAdmin() {
  vi.mocked(sessionLib.getAdminSession).mockResolvedValue(makeAdminSession() as never);
}

function asGuest() {
  vi.mocked(sessionLib.getAdminSession).mockResolvedValue(
    makeAdminSession({ isAdmin: false }) as never,
  );
}

function mockClients(round?: Record<string, unknown>, votes: unknown[] = []) {
  const { rounds, votes: votesClient } = makeTableClients();
  if (round) rounds.getEntity.mockResolvedValue(makeRound(round));
  else rounds.getEntity.mockRejectedValue(new Error('Not found'));
  votesClient.listEntities.mockReturnValue(asyncIter(votes));
  vi.mocked(tableLib.getTableClient).mockImplementation(
    (name: string) => (name === 'rounds' ? rounds : votesClient) as never,
  );
  return { rounds, votes: votesClient };
}

// ── POST /api/admin/login ──────────────────────────────────────────────────────

describe('POST /api/admin/login', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.ADMIN_PASSWORD = 'secret123';
    ({ POST } = await import('@/app/api/admin/login/route'));
  });

  it('returns 401 on wrong password', async () => {
    asGuest();
    const res = await POST(req('POST', '/api/admin/login', { password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 and saves session on correct password', async () => {
    const session = makeAdminSession({ isAdmin: false });
    vi.mocked(sessionLib.getAdminSession).mockResolvedValue(session as never);

    const res = await POST(req('POST', '/api/admin/login', { password: 'secret123' }));
    expect(res.status).toBe(200);
    expect(session.isAdmin).toBe(true);
    expect(session.save).toHaveBeenCalled();
  });
});

// ── POST /api/admin/logout ─────────────────────────────────────────────────────

describe('POST /api/admin/logout', () => {
  let POST: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import('@/app/api/admin/logout/route'));
  });

  it('returns 200 and destroys session', async () => {
    const session = makeAdminSession();
    vi.mocked(sessionLib.getAdminSession).mockResolvedValue(session as never);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(session.destroy).toHaveBeenCalled();
  });
});

// ── GET /api/admin/round ───────────────────────────────────────────────────────

describe('GET /api/admin/round', () => {
  let GET: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import('@/app/api/admin/round/route'));
  });

  it('returns 401 when not admin', async () => {
    asGuest();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns round: null when no round exists', async () => {
    asAdmin();
    mockClients(); // no round
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).round).toBeNull();
  });

  it('returns round with zero counts when no votes cast', async () => {
    asAdmin();
    mockClients({});
    const res = await GET();
    const { round } = await res.json();
    expect(round.name).toBe('GIPC 2026 — Audience Favourite');
    expect(round.status).toBe('open');
    expect(round.competitors).toEqual(['Alice Chen', 'Bob Rossi', 'Carol Müller']);
    expect(round.counts).toEqual({ 'Alice Chen': 0, 'Bob Rossi': 0, 'Carol Müller': 0 });
    expect(round.total).toBe(0);
  });

  it('tallies votes correctly', async () => {
    asAdmin();
    mockClients({}, [
      makeVote('Alice Chen'),
      makeVote('Alice Chen'),
      makeVote('Bob Rossi'),
    ]);
    const res = await GET();
    const { round } = await res.json();
    expect(round.counts['Alice Chen']).toBe(2);
    expect(round.counts['Bob Rossi']).toBe(1);
    expect(round.counts['Carol Müller']).toBe(0);
    expect(round.total).toBe(3);
  });

  it('ignores votes for competitors not in the current list', async () => {
    asAdmin();
    mockClients({}, [makeVote('Removed Competitor')]);
    const res = await GET();
    const { round } = await res.json();
    expect(round.total).toBe(0);
  });
});

// ── POST /api/admin/round ──────────────────────────────────────────────────────

describe('POST /api/admin/round', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import('@/app/api/admin/round/route'));
  });

  it('returns 401 when not admin', async () => {
    asGuest();
    const res = await POST(req('POST', '/api/admin/round', { name: 'Test', competitors: ['A'] }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    asAdmin();
    const res = await POST(req('POST', '/api/admin/round', { competitors: ['A'] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when competitors is not an array', async () => {
    asAdmin();
    const res = await POST(req('POST', '/api/admin/round', { name: 'Test', competitors: 'A' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when competitors array is empty', async () => {
    asAdmin();
    const res = await POST(req('POST', '/api/admin/round', { name: 'Test', competitors: [] }));
    expect(res.status).toBe(400);
  });

  it('creates round with draft status and clears old votes', async () => {
    asAdmin();
    const { rounds, votes } = mockClients(
      {},
      [makeVote('Alice Chen'), makeVote('Bob Rossi')],
    );
    votes.listEntities.mockReturnValue(
      asyncIter([makeVote('Alice Chen'), makeVote('Bob Rossi')]),
    );

    const res = await POST(
      req('POST', '/api/admin/round', {
        name: 'New Round',
        competitors: ['X', 'Y', 'Z'],
      }),
    );
    expect(res.status).toBe(200);
    expect(rounds.upsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: 'round',
        rowKey: 'current',
        name: 'New Round',
        status: 'draft',
        competitors: JSON.stringify(['X', 'Y', 'Z']),
      }),
      'Replace',
    );
    expect(votes.deleteEntity).toHaveBeenCalledTimes(2);
  });

  it('calls ensureTables when creating a round', async () => {
    asAdmin();
    mockClients({}, []);
    await POST(req('POST', '/api/admin/round', { name: 'Test', competitors: ['A'] }));
    expect(tableLib.ensureTables).toHaveBeenCalled();
  });
});

// ── POST /api/admin/open ───────────────────────────────────────────────────────

describe('POST /api/admin/open', () => {
  let POST: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import('@/app/api/admin/open/route'));
  });

  it('returns 401 when not admin', async () => {
    asGuest();
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('sets round status to open', async () => {
    asAdmin();
    const { rounds } = mockClients({ status: 'draft' });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(rounds.upsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open' }),
      'Replace',
    );
  });
});

// ── POST /api/admin/close ──────────────────────────────────────────────────────

describe('POST /api/admin/close', () => {
  let POST: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import('@/app/api/admin/close/route'));
  });

  it('returns 401 when not admin', async () => {
    asGuest();
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('sets round status to closed', async () => {
    asAdmin();
    const { rounds } = mockClients({ status: 'open' });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(rounds.upsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed' }),
      'Replace',
    );
  });
});
