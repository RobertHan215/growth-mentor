import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session as { user?: { role?: string } } | null)?.user?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function parseTagIds(tagIdsStr: string | null): string[] {
  if (!tagIdsStr) return [];
  try {
    return JSON.parse(tagIdsStr);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get('tagId');

    const where = tagId ? {
      tagIds: { contains: tagId }
    } : {};

    const templates = await prisma.aiCharacterTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    // Parse tagIds from JSON string to array
    const parsed = templates.map(t => ({
      ...t,
      tagIds: parseTagIds(t.tagIds)
    }));

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const body = await req.json();

    const template = await prisma.aiCharacterTemplate.create({
      data: {
        name: body.name,
        description: body.description || null,
        personalityType: body.personalityType || null,
        profile: body.profile || {},
        dimensions: body.dimensions || [],
        tagIds: JSON.stringify(body.tagIds || [])
      }
    });

    return NextResponse.json({
      ...template,
      tagIds: parseTagIds(template.tagIds)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
