/**
 * Admin API: Sensitive Words Management
 *
 * GET  /api/admin/sensitive-words          - 查询列表（支持 ?category=&enabled=）
 * POST /api/admin/sensitive-words          - 批量新增（body: { words: string[], category?: string }）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { invalidateSensitiveWordCache } from '@/lib/server/sensitive-word-checker';

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((session as any)?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const enabledParam = searchParams.get('enabled');

  const where: Record<string, unknown> = {};
  if (category !== null && category !== '') where.category = category;
  if (enabledParam !== null) where.enabled = enabledParam === 'true';

  const words = await prisma.sensitiveWord.findMany({
    where,
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(words);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const body = await req.json();
  const { words, category = '' }: { words: string[]; category?: string } = body;

  if (!Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: '请提供至少一个敏感词' }, { status: 400 });
  }

  const userId = session!.user!.id as string;
  const trimmed = [...new Set(words.map((w: string) => w.trim()).filter(Boolean))];

  // Upsert: skip duplicates silently
  const results = await Promise.allSettled(
    trimmed.map((word) =>
      prisma.sensitiveWord.upsert({
        where: { word },
        update: { category, enabled: true },
        create: { word, category, enabled: true, createdBy: userId },
      }),
    ),
  );

  const created = results.filter((r) => r.status === 'fulfilled').length;
  invalidateSensitiveWordCache();

  return NextResponse.json({ created, total: trimmed.length });
}
