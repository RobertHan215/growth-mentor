/**
 * Training Chat API — Independent channel for 1:1 training sessions.
 *
 * POST /api/training/chat
 *
 * Unlike /api/chat, this endpoint:
 * - Does NOT use Director/Agent orchestration
 * - Directly calls streamLLM with the training system prompt
 * - Outputs the same StatelessEvent SSE format for client compatibility
 *
 * This ensures training sessions are fully isolated from the
 * PlaybackEngine/Roundtable/Director multi-agent system.
 */

import { NextRequest } from 'next/server';
import type { StatelessEvent } from '@/lib/types/chat';
import { apiError } from '@/lib/server/api-response';
import {
  resolveModelWithDefaults,
  shouldUseFrontendModelConfigFromBody,
} from '@/lib/server/resolve-model';
import { callLLM, streamLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { checkSensitiveWords } from '@/lib/server/sensitive-word-checker';
import { rewriteSensitiveOutput } from '@/lib/server/sensitive-output-rewriter';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { retrieveRealSpeechPrompt } from '@/lib/server/real-speech-retrieval';

const log = createLogger('Training Chat API');

export const maxDuration = 60;

interface TrainingChatRequest {
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant';
    parts?: Array<{ type: string; text: string }>;
    content?: string;
  }>;
  systemPrompt: string;
  aiRoleName?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  useFrontendModelConfig?: boolean;
  mode?: string;
  selectedTemplateId?: string;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const createSensitiveWordStreamResponse = (
    source: 'user' | 'ai',
    matched: string[],
    message: string,
    category?: string,
  ) => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      try {
        const sensitivePayload = JSON.stringify({
          type: 'sensitive_word_detected',
          data: {
            matched,
            source,
            category,
          },
        });
        await writer.write(encoder.encode(`data: ${sensitivePayload}\n\n`));

        const sensitiveErrorPayload = JSON.stringify({
          type: 'error',
          data: {
            message,
            errorCode: 'SENSITIVE_WORD',
            matched,
            source,
            category,
          },
        });
        await writer.write(encoder.encode(`data: ${sensitiveErrorPayload}\n\n`));
        await writer.close();
      } catch {
        try {
          await writer.close();
        } catch {
          /* already closed */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };

  try {
    const body: TrainingChatRequest = await req.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
    }
    if (!body.systemPrompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: systemPrompt');
    }

    const isOneOnOne = body.mode === 'one-on-one';

    // ── Sensitive word check: user's last message ──
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id as string | undefined;
    const lastUserMsg = [...body.messages].reverse().find((m) => m.role === 'user');

    if (lastUserMsg) {
      const userText =
        lastUserMsg.parts?.find((p) => p.type === 'text')?.text || lastUserMsg.content || '';
      const userCheck = await checkSensitiveWords(userText, userId, 'user');
      if (userCheck.hit) {
        if (isOneOnOne) {
          return createSensitiveWordStreamResponse(
            'user',
            userCheck.matched ? [userCheck.matched] : [],
            '用词不当提醒：您的表达包含敏感词，请修改后重新发送',
            userCheck.category,
          );
        } else {
          return apiError(
            'SENSITIVE_WORD',
            400,
            `您的消息包含敏感词，对话已终止`,
            userCheck.matched,
          );
        }
      }
    }

    const { model: languageModel } = await resolveModelWithDefaults({
      modelString: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      providerType: body.providerType,
      useClientConfig: shouldUseFrontendModelConfigFromBody(body),
    });

    log.info(`Processing training chat: ${body.messages.length} messages`);

    const signal = req.signal;

    // Convert UI messages to AI SDK format
    const aiMessages = body.messages.map((msg) => {
      const text = msg.parts?.find((p) => p.type === 'text')?.text || msg.content || '';
      return {
        role: msg.role as 'user' | 'assistant',
        content: text,
      };
    });

    let finalSystemPrompt = body.systemPrompt;
    if (isOneOnOne && lastUserMsg) {
      const latestUserText =
        lastUserMsg.parts?.find((p) => p.type === 'text')?.text || lastUserMsg.content || '';
      try {
        const realSpeech = await retrieveRealSpeechPrompt({
          templateId: body.selectedTemplateId,
          latestUserText,
          roundCount: body.messages.filter((message) => message.role === 'user').length,
          recentMessages: aiMessages.slice(-8),
        });
        log.info('[真实话术增强] 检索结果', realSpeech.debug);
        if (realSpeech.prompt) {
          finalSystemPrompt = `${body.systemPrompt}${realSpeech.prompt}`;
          log.info('[真实话术增强] 已追加到本轮 system prompt', {
            selectedTemplateId: body.selectedTemplateId,
            originalSystemPromptLength: body.systemPrompt.length,
            realSpeechPromptLength: realSpeech.prompt.length,
            finalSystemPromptLength: finalSystemPrompt.length,
            appendedPrompt: realSpeech.prompt,
          });
        } else {
          log.info('[真实话术增强] 未追加真实话术 prompt', {
            selectedTemplateId: body.selectedTemplateId,
            reason: realSpeech.debug.reason,
          });
        }
      } catch (error) {
        log.warn('Real speech retrieval failed, continuing without speech samples:', error);
      }
    } else if (isOneOnOne) {
      log.info('[真实话术增强] 跳过检索', {
        hasLastUserMsg: Boolean(lastUserMsg),
        selectedTemplateId: body.selectedTemplateId || null,
      });
    }

    if (isOneOnOne) {
      log.info('[一对一对练] final system prompt before LLM', {
        length: finalSystemPrompt.length,
        baseLength: body.systemPrompt.length,
        realSpeechAppended: finalSystemPrompt.length !== body.systemPrompt.length,
        aiRoleName: body.aiRoleName || null,
        selectedTemplateId: body.selectedTemplateId || null,
        messageCount: body.messages.length,
      });
      log.info(
        `\n========== OneOnOne Final System Prompt Sent To LLM ==========\n${finalSystemPrompt}\n========== End OneOnOne Final System Prompt Sent To LLM ==========`,
      );
    }

    // Create SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const agentId = 'training-agent';
    const agentName = body.aiRoleName || '陪练';
    const messageId = `training-${Date.now()}`;

    // Stream in background
    (async () => {
      const HEARTBEAT_INTERVAL_MS = 15_000;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
          try {
            writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
          } catch {
            stopHeartbeat();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();
        let aiContent = '';

        // Emit agent_start
        const startEvent: StatelessEvent = {
          type: 'agent_start',
          data: { messageId, agentId, agentName },
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

        // Direct streamLLM call — no Director, no orchestration
        const result = streamLLM(
          {
            model: languageModel,
            system: finalSystemPrompt,
            messages: aiMessages,
          },
          'training',
          { enabled: false }, // No thinking/reasoning for training
        );

        // Collect the model output first so no sensitive AI text is sent before filtering.
        for await (const chunk of result.textStream) {
          if (signal.aborted) break;

          if (chunk) {
            aiContent += chunk;
          }
        }

        if (signal.aborted) {
          stopHeartbeat();
          await writer.close();
          return;
        }

        // ── Sensitive word check: AI response ──
        const safeOutput = await rewriteSensitiveOutput({
          text: aiContent,
          checkText: (text) => checkSensitiveWords(text, userId, 'ai'),
          rewriteText: async (prompt) => {
            const rewritten = await callLLM(
              {
                model: languageModel,
                system:
                  '你负责对 AI 陪练回复做合规改写。只改写命中的违规表达，保持原意、角色语气和必要控制标签。',
                prompt,
              },
              'training-sensitive-rewrite',
              { retries: 1 },
              { enabled: false },
            );
            return rewritten.text;
          },
        });

        if (safeOutput.initialCheck.hit) {
          log.info(
            `AI response sensitive words were rewritten or masked (rewritten=${safeOutput.rewritten}, masked=${safeOutput.masked})`,
          );
        }

        if (safeOutput.text) {
          const textEvent: StatelessEvent = {
            type: 'text_delta',
            data: { messageId, content: safeOutput.text },
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(textEvent)}\n\n`));
        }

        // Emit agent_end
        const endEvent: StatelessEvent = {
          type: 'agent_end',
          data: { messageId, agentId },
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(endEvent)}\n\n`));

        // Emit done
        const doneEvent: StatelessEvent = {
          type: 'done',
          data: { totalActions: 0, totalAgents: 1, agentHadContent: true },
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));

        stopHeartbeat();
        await writer.close();
      } catch (error) {
        stopHeartbeat();

        if (signal.aborted) {
          log.info('Training request aborted');
          try {
            await writer.close();
          } catch {
            /* already closed */
          }
          return;
        }

        log.error('Training stream error:', error);

        try {
          const errorEvent: StatelessEvent = {
            type: 'error',
            data: { message: error instanceof Error ? error.message : String(error) },
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          await writer.close();
        } catch {
          /* Writer may already be closed */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process training request',
    );
  }
}
