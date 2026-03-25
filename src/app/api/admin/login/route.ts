import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const session = await getAdminSession();
  session.isAdmin = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
