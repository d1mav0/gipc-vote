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
  const excludedCountries: string[] = JSON.parse((round.excludedCountries as string) || '[]');

  // Collect all votes with location data
  const votesClient = getTableClient('votes');
  const allVotes: Array<{ competitor: string; country: string }> = [];
  for await (const vote of votesClient.listEntities()) {
    allVotes.push({
      competitor: vote.competitor as string,
      country:    (vote.country as string) || '',
    });
  }

  // Location breakdown
  const locationMap: Record<string, number> = {};
  for (const v of allVotes) {
    const code = v.country || '';
    locationMap[code] = (locationMap[code] ?? 0) + 1;
  }
  const locations = Object.entries(locationMap)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, excluded: excludedCountries.includes(code) }));

  // Filtered counts (exclude votes from excluded countries)
  const counts: Record<string, number> = {};
  for (const c of competitors) counts[c] = 0;
  for (const v of allVotes) {
    if (v.competitor in counts && !excludedCountries.includes(v.country)) {
      counts[v.competitor]++;
    }
  }

  return NextResponse.json({
    round: {
      name: round.name,
      status: round.status,
      competitors,
      excludedCountries,
      counts,
      total:    Object.values(counts).reduce((a, b) => a + b, 0),
      totalRaw: allVotes.length,
      locations,
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
    excludedCountries: '[]',
    status: 'draft',
  }, 'Replace');

  return NextResponse.json({ ok: true });
}
