import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const courses = await prisma.stage.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        category: true,
        stageTags: {
          include: {
            tag: true
          }
        },
        user: {
          select: { name: true, email: true }
        }
      }
    });

    return NextResponse.json(courses);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
