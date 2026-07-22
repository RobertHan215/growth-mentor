/**
 * Chat Storage - Hybrid persistence (IndexedDB + MySQL async sync)
 *
 * Independent from stage/scene storage cycle.
 * Handles serialization, truncation, and batch writes.
 */

import type { ChatSession, ChatMessageMetadata, SessionStatus } from '@/lib/types/chat';
import type { UIMessage } from 'ai';
import {
  getChatSessionsByStageId,
  createChatSession,
  updateChatSession,
  deleteChatSession,
} from '@/lib/hybrid-storage';

const MAX_MESSAGES_PER_SESSION = 200;

/**
 * Save chat sessions for a stage to MySQL.
 */
export async function saveChatSessions(stageId: string, sessions: ChatSession[]): Promise<void> {
  const existingSessions = await getChatSessionsByStageId(stageId);
  const existingIds = new Set(existingSessions.map((s) => s.id));

  for (const session of sessions) {
    const record = {
      id: session.id,
      stageId,
      type: session.type,
      title: session.title,
      status: (session.status === 'active' ? 'interrupted' : session.status) as SessionStatus,
      messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION),
      config: session.config,
      toolCalls: session.toolCalls,
      pendingToolCalls: [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      sceneId: session.sceneId,
      lastActionIndex: session.lastActionIndex,
    };

    if (existingIds.has(session.id)) {
      await updateChatSession(session.id, {
        title: record.title,
        status: record.status,
        messages: record.messages,
        config: record.config,
        toolCalls: record.toolCalls,
        pendingToolCalls: record.pendingToolCalls,
        lastActionIndex: record.lastActionIndex,
      });
    } else {
      await createChatSession(record);
    }
  }

  const newSessionIds = new Set(sessions.map((s) => s.id));
  for (const existing of existingSessions) {
    if (!newSessionIds.has(existing.id)) {
      await deleteChatSession(existing.id);
    }
  }
}

/**
 * Load chat sessions for a stage from MySQL.
 */
export async function loadChatSessions(stageId: string): Promise<ChatSession[]> {
  const records = await getChatSessionsByStageId(stageId);

  return records.map((record) => ({
    id: record.id,
    type: record.type as ChatSession['type'],
    title: record.title,
    status: record.status,
    messages: record.messages as UIMessage<ChatMessageMetadata>[],
    config: record.config,
    toolCalls: record.toolCalls,
    pendingToolCalls: record.pendingToolCalls,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sceneId: record.sceneId,
    lastActionIndex: record.lastActionIndex,
  })) as ChatSession[];
}

/**
 * Delete all chat sessions for a stage.
 */
export async function deleteChatSessions(stageId: string): Promise<void> {
  const sessions = await getChatSessionsByStageId(stageId);
  for (const session of sessions) {
    await deleteChatSession(session.id);
  }
}
