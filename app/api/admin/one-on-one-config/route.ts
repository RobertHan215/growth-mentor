import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getOneOnOneGlobalConfig, saveOneOnOneGlobalConfig } from '@/lib/server/one-on-one-config';

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session as { user?: { role?: string } } | null)?.user?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const config = await getOneOnOneGlobalConfig();
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const body = await req.json();
  const config = await saveOneOnOneGlobalConfig(body);
  return NextResponse.json(config);
}
