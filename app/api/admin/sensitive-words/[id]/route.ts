/**
 * Admin API: Single Sensitive Word Operations
 *
 * PUT    /api/admin/sensitive-words/:id  - 修改词/分类/启用状态
 * DELETE /api/admin/sensitive-words/:id  - 删除
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json();
  const { word, category, enabled } = body as {
    word?: string;
    category?: string;
    enabled?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (word !== undefined) data.word = word.trim();
  if (category !== undefined) data.category = category;
  if (enabled !== undefined) data.enabled = enabled;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
  }

  try {
    const updated = await prisma.sensitiveWord.update({ where: { id }, data });
    invalidateSensitiveWordCache();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: '更新失败，词条可能不存在' }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { id } = await params;

  try {
    await prisma.sensitiveWord.delete({ where: { id } });
    invalidateSensitiveWordCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '删除失败，词条可能不存在' }, { status: 404 });
  }
}
