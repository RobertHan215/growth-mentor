import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

/**
 * GET  - Fetch outlines for a stage
 *        Falls back to reconstructing outlines from scenes if stage_outlines is empty
 * PUT  - Update outlines for a stage
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((session?.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch scenes first to check consistency
    const scenes = await prisma.scene.findMany({
      where: { stageId: id },
      orderBy: { order: 'asc' },
      select: { id: true, type: true, title: true, order: true, content: true },
    });

    // Primary: try the stage_outlines table
    const stageOutlines = await prisma.stageOutlines.findUnique({
      where: { stageId: id },
    });

    // Helper function to reconstruct outlines from scenes
    const reconstructOutlines = (sceneList: typeof scenes) => {
      const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

      return sceneList.map((scene) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content = scene.content as any;
        let description = '';
        let keyPoints: string[] = [];

        if (content?.type === 'slide' && content?.canvas?.elements) {
          const textEls = (content.canvas.elements as any[])
            .filter((el: any) => el.type === 'text' && el.content)
            .map((el: any) => stripHtml(el.content));

          if (textEls.length > 1) {
            description = textEls[1];
          }
          for (let i = 2; i < textEls.length; i++) {
            const text = textEls[i].replace(/^[•·]\s*/, '').trim();
            if (text) keyPoints.push(text);
          }
        } else if (content?.type === 'quiz' && Array.isArray(content?.questions)) {
          description = `包含 ${content.questions.length} 道测验题`;
          keyPoints = content.questions
            .slice(0, 5)
            .map((q: any) => q.question || '')
            .filter(Boolean);
        } else if (content?.type === 'interactive') {
          description = '互动演示环节';
        } else if (content?.type === 'pbl') {
          description = content?.description || 'PBL项目学习';
          keyPoints = content?.keyPoints || [];
        }

        return {
          id: scene.id,
          type: scene.type,
          title: scene.title,
          description,
          keyPoints,
          teachingObjective: content?.teachingObjective || '',
          order: scene.order,
        };
      });
    };

    // Check if stage_outlines needs rebuild
    if (stageOutlines) {
      const savedOutlines = stageOutlines.outlines as Array<{ id: string }>;
      const savedIds = new Set(savedOutlines.map((o) => o.id));
      const currentIds = new Set(scenes.map((s) => s.id));

      // Check if scene IDs match saved outline IDs
      const idsMatch =
        scenes.length === savedOutlines.length &&
        scenes.every((s) => savedIds.has(s.id));

      if (!idsMatch) {
        // Scenes changed - rebuild outlines and update
        const reconstructedOutlines = reconstructOutlines(scenes);
        await prisma.stageOutlines.update({
          where: { stageId: id },
          data: { outlines: reconstructedOutlines as any },
        });
        return NextResponse.json({
          success: true,
          data: { stageId: id, outlines: reconstructedOutlines },
        });
      }

      return NextResponse.json({ success: true, data: stageOutlines });
    }

    // Fallback: reconstruct basic outline data from existing scenes
    if (scenes.length > 0) {
      const reconstructedOutlines = reconstructOutlines(scenes);

      try {
        await prisma.stageOutlines.create({
          data: { stageId: id, outlines: reconstructedOutlines as any },
        });
      } catch {
        // Ignore if stage doesn't exist (FK constraint)
      }

      return NextResponse.json({
        success: true,
        data: { stageId: id, outlines: reconstructedOutlines },
      });
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((session?.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { outlines } = await req.json();

    if (!outlines || !Array.isArray(outlines)) {
      return NextResponse.json({ error: 'outlines must be an array' }, { status: 400 });
    }

    const result = await prisma.stageOutlines.upsert({
      where: { stageId: id },
      update: { outlines: outlines as any },
      create: { stageId: id, outlines: outlines as any },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
