import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/session';
import { getTableClient } from '@/lib/tableClient';

// POST { countryCode, action: 'exclude' | 'include' }
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { countryCode, action } = await req.json();
  if (!countryCode || (action !== 'exclude' && action !== 'include')) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  }

  const client = getTableClient('rounds');
  const round = await client.getEntity('round', 'current');
  const excluded: string[] = JSON.parse((round.excludedCountries as string) || '[]');

  const updated = action === 'exclude'
    ? [...new Set([...excluded, countryCode])]
    : excluded.filter(c => c !== countryCode);

  await client.updateEntity(
    { partitionKey: 'round', rowKey: 'current', excludedCountries: JSON.stringify(updated) },
    'Merge',
  );

  return NextResponse.json({ ok: true, excludedCountries: updated });
}
