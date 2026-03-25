import { NextResponse } from 'next/server';
import { getTableClient } from '@/lib/tableClient';

export async function GET() {
  try {
    const client = getTableClient('rounds');
    const entity = await client.getEntity('round', 'current');
    return NextResponse.json({
      status: entity.status,
      name: entity.name,
      competitors: JSON.parse(entity.competitors as string),
    });
  } catch {
    return NextResponse.json({ status: 'closed', name: '', competitors: [] });
  }
}
