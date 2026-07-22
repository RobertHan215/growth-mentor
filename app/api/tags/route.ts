import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeCharacterCount = searchParams.get('includeCharacterCount') === 'true';

    const tags = await prisma.tag.findMany();

    if (includeCharacterCount) {
      // Get character template counts per tag
      const templates = await prisma.aiCharacterTemplate.findMany();
      const countMap: Record<string, number> = {};

      templates.forEach(t => {
        try {
          const tagIds = JSON.parse(t.tagIds || '[]');
          tagIds.forEach((tagId: string) => {
            countMap[tagId] = (countMap[tagId] || 0) + 1;
          });
        } catch {
          // ignore parse errors
        }
      });

      const tagsWithCount = tags.map(tag => ({
        ...tag,
        characterTemplateCount: countMap[tag.id] || 0
      }));

      return NextResponse.json(tagsWithCount);
    }

    return NextResponse.json(tags);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, color } = await req.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const tag = await prisma.tag.create({
      data: { name, color }
    });

    return NextResponse.json(tag);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
