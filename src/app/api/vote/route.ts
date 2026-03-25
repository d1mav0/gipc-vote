import { NextRequest, NextResponse } from 'next/server';
import { getTableClient } from '@/lib/tableClient';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: NextRequest) {
  const { competitor } = await req.json();
  if (!competitor) return NextResponse.json({ error: 'Missing competitor' }, { status: 400 });

  // Check round is open
  const roundsClient = getTableClient('rounds');
  let round;
  try {
    round = await roundsClient.getEntity('round', 'current');
  } catch {
    return NextResponse.json({ error: 'No active round' }, { status: 400 });
  }
  if (round.status !== 'open') {
    return NextResponse.json({ error: 'Voting is closed' }, { status: 400 });
  }

  // Validate competitor is in the list
  const competitors: string[] = JSON.parse(round.competitors as string);
  if (!competitors.includes(competitor)) {
    return NextResponse.json({ error: 'Invalid competitor' }, { status: 400 });
  }

  // Get or create voter token cookie
  const cookieStore = await cookies();
  let voterToken = cookieStore.get('voter_token')?.value;
  const isNew = !voterToken;
  if (!voterToken) {
    voterToken = uuidv4();
  }
  const voterHash = hashToken(voterToken);

  // Check if already voted
  const votesClient = getTableClient('votes');
  const existing = votesClient.listEntities({
    queryOptions: { filter: `voterHash eq '${voterHash}'` },
  });
  for await (const _ of existing) {
    const res = NextResponse.json({ error: 'Already voted' }, { status: 409 });
    return res;
  }

  // Store vote
  await votesClient.createEntity({
    partitionKey: 'vote',
    rowKey: uuidv4(),
    competitor,
    voterHash,
  });

  const res = NextResponse.json({ ok: true });
  if (isNew) {
    res.cookies.set('voter_token', voterToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}
