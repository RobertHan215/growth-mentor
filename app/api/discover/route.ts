import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { buildVisibilityWhereClause } from '@/lib/server/course-visibility';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; role?: string } | undefined;
    const user = sessionUser?.id
      ? { id: sessionUser.id, role: sessionUser.role || 'user' }
      : null;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(12, Math.max(1, parseInt(searchParams.get('pageSize') || '12', 10)));
    const search = (searchParams.get('search') || '').trim();
    const mode = searchParams.get('mode') || 'all';

    const visibilityFilter = buildVisibilityWhereClause(user);

    const where: Record<string, unknown> = {
      ...visibilityFilter,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    };

    if (mode === 'teaching' || mode === 'oneOnOne') {
      where.learningMode = mode;
    }

    const [courses, total] = await Promise.all([
      prisma.stage.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          updatedAt: true,
          learningMode: true,
          directorConfig: true,
          visibilityRoles: true,
          visibilityUsers: true,
          coverImage: true,
          user: { select: { name: true } },
          category: { select: { id: true, name: true } },
          stageTags: { select: { tag: { select: { id: true, name: true, color: true } } } }
        }
      }),
      prisma.stage.count({ where }),
    ]);

    return NextResponse.json({
      data: courses,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
