import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/session';
import { getTableClient, ensureTables } from '@/lib/tableClient';

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.isAdmin) return false;
  return true;
}

// GET — fetch round + vote counts
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roundsClient = getTableClient('rounds');
  let round;
  try {
    round = await roundsClient.getEntity('round', 'current');
  } catch {
    return NextResponse.json({ round: null });
  }

  const competitors: string[] = JSON.parse(round.competitors as string);

  // Tally votes
  const votesClient = getTableClient('votes');
  const counts: Record<string, number> = {};
  for (const c of competitors) counts[c] = 0;

  for await (const vote of votesClient.listEntities()) {
    const c = vote.competitor as string;
    if (c in counts) counts[c]++;
  }

  return NextResponse.json({
    round: {
      name: round.name,
      status: round.status,
      competitors,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    },
  });
}

// POST — create/replace round
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, competitors } = await req.json();
  if (!name || !Array.isArray(competitors) || competitors.length === 0) {
    return NextResponse.json({ error: 'Invalid round data' }, { status: 400 });
  }

  await ensureTables();

  const roundsClient = getTableClient('rounds');
  const votesClient = getTableClient('votes');

  // Clear old votes
  for await (const vote of votesClient.listEntities()) {
    await votesClient.deleteEntity(vote.partitionKey!, vote.rowKey!);
  }

  await roundsClient.upsertEntity({
    partitionKey: 'round',
    rowKey: 'current',
    name,
    competitors: JSON.stringify(competitors),
    status: 'draft',
  }, 'Replace');

  return NextResponse.json({ ok: true });
}
