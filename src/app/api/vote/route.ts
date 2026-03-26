import { NextRequest, NextResponse } from 'next/server';
import { getTableClient } from '@/lib/tableClient';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { log, logError, getClientIp, geoLookup } from '@/lib/logger';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';

  const { competitor } = await req.json();
  if (!competitor) return NextResponse.json({ error: 'Missing competitor' }, { status: 400 });

  // Check round is open
  const roundsClient = getTableClient('rounds');
  let round;
  try {
    round = await roundsClient.getEntity('round', 'current');
  } catch {
    log('vote.no_round', { ip, ua });
    return NextResponse.json({ error: 'No active round' }, { status: 400 });
  }
  if (round.status !== 'open') {
    log('vote.closed', { ip, ua });
    return NextResponse.json({ error: 'Voting is closed' }, { status: 400 });
  }

  // Validate competitor is in the list
  const competitors: string[] = JSON.parse(round.competitors as string);
  if (!competitors.includes(competitor)) {
    log('vote.invalid_competitor', { ip, ua, competitor });
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

  // Check if already voted — silent discard (voter always sees /thanks)
  const votesClient = getTableClient('votes');
  const existing = votesClient.listEntities({
    queryOptions: { filter: `voterHash eq '${voterHash}'` },
  });
  for await (const _ of existing) {
    geoLookup(ip, geo => log('vote.duplicate', { ip, ua, fingerprint: voterHash, ...geo }));
    return NextResponse.json({ ok: true });
  }

  // Store vote
  const voteRowKey = uuidv4();
  try {
    await votesClient.createEntity({
      partitionKey: 'vote',
      rowKey: voteRowKey,
      competitor,
      voterHash,
    });
  } catch (err) {
    logError('vote.store_failed', err, { ip, ua });
    return NextResponse.json({ error: 'Failed to store vote' }, { status: 500 });
  }

  // Async: attach geo data to vote entity and log
  geoLookup(ip, geo => {
    votesClient.updateEntity(
      { partitionKey: 'vote', rowKey: voteRowKey, ...geo },
      'Merge',
    ).catch(() => {});
    log('vote.success', { ip, ua, fingerprint: voterHash, competitor, round: round.name as string, ...geo });
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
