import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  generateSceneActions,
  buildCompleteScene,
  type SceneGenerationContext,
} from '@/lib/generation/generation-pipeline';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import {
  resolveTextModel,
  suppressThinking,
  suppressThinkingInUserPrompt,
} from '@/lib/server/resolve-model';

const log = createLogger('Regenerate Scene');

/**
 * POST /api/admin/courses/[id]/regenerate
 * Body: { outlineIndex: number }
 *
 * Re-generates a single scene (content + actions) from its outline,
 * then updates the corresponding Scene record in DB.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: stageId } = await params;
    const session = await getServerSession(authOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((session?.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { outlineIndex } = await req.json();
    if (typeof outlineIndex !== 'number') {
      return NextResponse.json({ error: 'outlineIndex is required (number)' }, { status: 400 });
    }

    // Load outlines
    const stageOutlines = await prisma.stageOutlines.findUnique({
      where: { stageId },
    });
    if (!stageOutlines) {
      return NextResponse.json({ error: 'No outlines found for this stage' }, { status: 404 });
    }

    const allOutlines = stageOutlines.outlines as unknown as SceneOutline[];
    if (outlineIndex < 0 || outlineIndex >= allOutlines.length) {
      return NextResponse.json(
        { error: `outlineIndex out of range (0-${allOutlines.length - 1})` },
        { status: 400 },
      );
    }

    const outline = allOutlines[outlineIndex];

    // Load stage info
    const stage = await prisma.stage.findUnique({
      where: { id: stageId },
      select: { name: true, description: true, language: true, style: true },
    });
    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Model resolution
    const { model: languageModel, modelInfo, modelString } = await resolveTextModel(req);
    log.info(`Regenerating scene: "${outline.title}" [model=${modelString}]`);

    // AI call function
    const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const effectiveSystem = suppressThinking(systemPrompt, modelString);
      const effectiveUser = suppressThinkingInUserPrompt(userPrompt, modelString);
      const contextWindow = modelInfo?.contextWindow ?? 16384;
      const configuredOutput = modelInfo?.outputWindow ?? 1536;
      const estimatedInput = Math.ceil((effectiveSystem.length + effectiveUser.length) / 3);
      const remaining = contextWindow - estimatedInput - 256;
      const safeOutput = Math.min(configuredOutput, Math.max(512, remaining));

      const result = await callLLM(
        {
          model: languageModel,
          system: effectiveSystem,
          prompt: effectiveUser,
          maxOutputTokens: safeOutput,
        },
        'regenerate-scene',
      );
      return result.text;
    };

    // Step 1: Find existing scene id (if any) so we overwrite instead of creating duplicates
    // outlineIndex is 0-based from frontend, but outline.order is 1-based
    const existingScene = await prisma.scene.findFirst({
      where: { stageId, order: outlineIndex + 1 },
      select: { id: true },
    });

    // Step 2: Generate content
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);
    const content = await generateSceneContent(effectiveOutline, aiCall);
    if (!content) {
      return NextResponse.json(
        { error: `Failed to generate content for: "${outline.title}"` },
        { status: 500 },
      );
    }

    // Step 3: Generate actions
    const allTitles = allOutlines.map((o) => o.title);
    const ctx: SceneGenerationContext = {
      pageIndex: outlineIndex + 1,
      totalPages: allOutlines.length,
      allTitles,
      previousSpeeches: [],
    };
    const actions = await generateSceneActions(outline, content, aiCall, ctx);

    // Step 4: Build complete scene (use existing id to overwrite)
    const scene = buildCompleteScene(outline, content, actions, stageId, existingScene?.id);
    if (!scene) {
      return NextResponse.json(
        { error: `Failed to build scene: "${outline.title}"` },
        { status: 500 },
      );
    }

    log.info(`Scene regenerated: "${outline.title}" — ${scene.actions?.length ?? 0} actions`);

    // Step 5: Upsert scene in DB (always update since we have the existing id)
    await prisma.scene.upsert({
      where: { id: scene.id },
      update: {
        title: scene.title,
        type: scene.type,
        content: scene.content as any,
        actions: scene.actions as any,
        order: scene.order,
      },
      create: {
        id: scene.id,
        stageId,
        title: scene.title,
        type: scene.type,
        content: scene.content as any,
        actions: scene.actions as any,
        order: scene.order,
      },
    });

    return NextResponse.json({ success: true, scene });
  } catch (error: unknown) {
    log.error('Regenerate error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
