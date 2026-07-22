import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  resolveModelWithDefaults,
  shouldUseFrontendModelConfigFromBody,
} from '@/lib/server/resolve-model';
import {
  buildTurnAnalysisPrompt,
  emptyTurnAnalysisResult,
  normalizeTurnAnalysisResult,
  type TrainingTurnAnalysisInput,
  type TrainingTurnMessage,
} from '@/lib/training/turn-analysis';

const log = createLogger('Training Turn Analysis API');

export const maxDuration = 30;

interface TrainingTurnAnalysisRequest extends TrainingTurnAnalysisInput {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  useFrontendModelConfig?: boolean;
}

function normalizeMessages(value: unknown): TrainingTurnMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const raw = message as Record<string, unknown>;
      if (raw.role !== 'user' && raw.role !== 'assistant') return null;
      return {
        role: raw.role,
        content: typeof raw.content === 'string' ? raw.content.trim() : '',
      };
    })
    .filter((message): message is TrainingTurnMessage => Boolean(message?.content))
    .slice(-8);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TrainingTurnAnalysisRequest;
    const latestUserMessage =
      typeof body.latestUserMessage === 'string' ? body.latestUserMessage.trim() : '';
    const latestAiMessage =
      typeof body.latestAiMessage === 'string' ? body.latestAiMessage.trim() : '';

    if (!latestUserMessage || !latestAiMessage) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: latestUserMessage/latestAiMessage',
      );
    }

    const input: TrainingTurnAnalysisInput = {
      aiRoleName:
        typeof body.aiRoleName === 'string' && body.aiRoleName.trim()
          ? body.aiRoleName.trim()
          : 'AI',
      userRoleName:
        typeof body.userRoleName === 'string' && body.userRoleName.trim()
          ? body.userRoleName.trim()
          : '用户',
      latestUserMessage,
      latestAiMessage,
      closingPrompt:
        typeof body.closingPrompt === 'string' && body.closingPrompt.trim()
          ? body.closingPrompt.trim()
          : undefined,
      recentMessages: normalizeMessages(body.recentMessages),
      round: typeof body.round === 'number' ? body.round : undefined,
    };

    const { model: languageModel, modelString } = await resolveModelWithDefaults({
      modelString: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      providerType: body.providerType,
      useClientConfig: shouldUseFrontendModelConfigFromBody(body),
    });

    const prompt = buildTurnAnalysisPrompt(input);
    log.info('[一对一对练] analyzing latest turn', {
      modelString,
      round: input.round || null,
      aiRoleName: input.aiRoleName,
      userRoleName: input.userRoleName,
      promptLength: prompt.length,
    });

    const result = await callLLM(
      {
        model: languageModel,
        system:
          '你是一对一对练的回合分析器。你只做结构化判断，不参与角色扮演。必须返回严格 JSON。',
        prompt,
        maxOutputTokens: 1000,
      },
      'one-on-one-turn-analysis',
      { retries: 1 },
      { enabled: false },
    );

    const parsed = parseJsonResponse<Record<string, unknown>>(result.text);
    const analysis = normalizeTurnAnalysisResult(parsed);

    if (!parsed) {
      log.warn('[一对一对练] turn analysis parse failed, using empty analysis', {
        responsePreview: result.text.slice(0, 1000),
      });
    } else {
      log.info('[一对一对练] turn analysis result', {
        analysis,
        responsePreview: result.text.slice(0, 1000),
      });
    }

    return apiSuccess({ analysis });
  } catch (error) {
    log.error('Turn analysis failed:', error);
    return apiSuccess({
      analysis: emptyTurnAnalysisResult(),
      warning: 'TURN_ANALYSIS_FAILED',
    });
  }
}
