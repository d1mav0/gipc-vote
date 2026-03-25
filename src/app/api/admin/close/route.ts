import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/session';
import { getTableClient } from '@/lib/tableClient';

export async function POST() {
  const session = await getAdminSession();
  if (!session.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = getTableClient('rounds');
  const round = await client.getEntity('round', 'current');
  await client.upsertEntity({ ...round, partitionKey: 'round', rowKey: 'current', status: 'closed' }, 'Replace');
  return NextResponse.json({ ok: true });
}
