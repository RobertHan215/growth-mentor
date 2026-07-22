import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { runTrainingEvaluation } from '@/lib/server/training-evaluation';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runTrainingEvaluation(await req.json(), {
      sessionUser: { id: session.user.id, role: session.user.role },
      headers: req.headers,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'At least one user message is required' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
