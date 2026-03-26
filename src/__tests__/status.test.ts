import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRound, makeTableClients } from './setup';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/tableClient', () => ({ getTableClient: vi.fn(), ensureTables: vi.fn() }));

import * as tableLib from '@/lib/tableClient';

// ── GET /api/status ────────────────────────────────────────────────────────────

describe('GET /api/status', () => {
  let GET: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import('@/app/api/status/route'));
  });

  it('returns closed defaults when no round exists', async () => {
    const { rounds } = makeTableClients();
    rounds.getEntity.mockRejectedValue(new Error('Not found'));
    vi.mocked(tableLib.getTableClient).mockReturnValue(rounds as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'closed', name: '', competitors: [] });
  });

  it('returns round status, name, and competitors when round exists', async () => {
    const { rounds } = makeTableClients();
    rounds.getEntity.mockResolvedValue(makeRound({ status: 'open' }));
    vi.mocked(tableLib.getTableClient).mockReturnValue(rounds as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('open');
    expect(body.name).toBe('GIPC 2026 — Audience Favourite');
    expect(body.competitors).toEqual(['Alice Chen', 'Bob Rossi', 'Carol Müller']);
  });

  it('returns draft status when round is in draft', async () => {
    const { rounds } = makeTableClients();
    rounds.getEntity.mockResolvedValue(makeRound({ status: 'draft' }));
    vi.mocked(tableLib.getTableClient).mockReturnValue(rounds as never);

    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe('draft');
  });

  it('returns closed status when round is closed', async () => {
    const { rounds } = makeTableClients();
    rounds.getEntity.mockResolvedValue(makeRound({ status: 'closed' }));
    vi.mocked(tableLib.getTableClient).mockReturnValue(rounds as never);

    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe('closed');
  });
});
