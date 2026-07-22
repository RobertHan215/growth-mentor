import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return apiError('INVALID_REQUEST', 403, 'Admin only');
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get('type')?.trim();
    const status = searchParams.get('status')?.trim();
    const search = searchParams.get('search')?.trim();

    const where: Prisma.AsyncTaskWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { user: { name: { contains: search } } },
        { stage: { name: { contains: search } } },
      ];
    }

    const tasks = await prisma.asyncTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    return apiSuccess({ tasks });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to load async tasks',
      error instanceof Error ? error.message : String(error),
    );
  }
}
