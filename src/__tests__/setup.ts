import { vi } from 'vitest';
import { NextRequest } from 'next/server';

export function makeRound(overrides: Record<string, unknown> = {}) {
  return {
    partitionKey: 'round',
    rowKey: 'current',
    name: 'GIPC 2026 — Audience Favourite',
    competitors: JSON.stringify(['Alice Chen', 'Bob Rossi', 'Carol Müller']),
    status: 'open',
    ...overrides,
  };
}

export function makeVote(competitor = 'Alice Chen', voterHash = 'hash-abc') {
  return { partitionKey: 'vote', rowKey: 'vote-uuid', competitor, voterHash };
}

export function makeAdminSession(overrides: Record<string, unknown> = {}) {
  return {
    isAdmin: true,
    save: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...overrides,
  };
}

/** Returns an async iterable that yields the given items */
export function asyncIter<T>(items: T[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item;
    },
  };
}

/** Build a NextRequest with optional body and headers */
export function req(
  method: string,
  url: string,
  body?: object,
  headers?: Record<string, string>,
) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
  });
}

/** Returns a pair of mock table clients keyed by table name */
export function makeTableClients() {
  const rounds = {
    getEntity: vi.fn(),
    listEntities: vi.fn().mockReturnValue(asyncIter([])),
    createEntity: vi.fn().mockResolvedValue(undefined),
    upsertEntity: vi.fn().mockResolvedValue(undefined),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
  };
  const votes = {
    getEntity: vi.fn(),
    listEntities: vi.fn().mockReturnValue(asyncIter([])),
    createEntity: vi.fn().mockResolvedValue(undefined),
    upsertEntity: vi.fn().mockResolvedValue(undefined),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
  };
  return { rounds, votes };
}
