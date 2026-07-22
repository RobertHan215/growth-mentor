import type { UIMessage } from 'ai';
import type { ChatMessageMetadata } from '@/lib/types/chat';

export interface TrainingCurrentTurn {
  userText: string | null;
  aiText: string | null;
  aiRoleName?: string;
  isAiStreaming: boolean;
  aiMessageId?: string | null;
}

interface DeriveTrainingCurrentTurnParams {
  messages: UIMessage<ChatMessageMetadata>[];
  isStreaming: boolean;
  streamingSessionId: string | null;
  sessionId: string;
}

function extractText(message: UIMessage<ChatMessageMetadata> | undefined): string | null {
  if (!message) return null;

  const text = (message.parts || [])
    .filter((part): part is { type: 'text'; text: string } => {
      return part.type === 'text' && typeof (part as { text?: unknown }).text === 'string';
    })
    .map((part) => part.text)
    .join('')
    .trim();

  return text || null;
}

export function deriveTrainingCurrentTurn({
  messages,
  isStreaming,
  streamingSessionId,
  sessionId,
}: DeriveTrainingCurrentTurnParams): TrainingCurrentTurn | null {
  const latestUserIndex = messages.reduce(
    (latest, message, index) => (message.role === 'user' ? index : latest),
    -1,
  );

  const latestAssistantBeforeOrAtTurn = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  const latestAssistantAfterUser = [...messages].reverse().find((message, reverseIndex) => {
    const index = messages.length - 1 - reverseIndex;
    return message.role === 'assistant' && (latestUserIndex === -1 || index > latestUserIndex);
  });

  const assistantMessage =
    latestUserIndex === -1 ? latestAssistantBeforeOrAtTurn : latestAssistantAfterUser;
  const latestUser = latestUserIndex >= 0 ? messages[latestUserIndex] : undefined;
  const userText = extractText(latestUser);
  const aiText = extractText(assistantMessage);

  if (!userText && !aiText) return null;

  return {
    userText,
    aiText,
    aiRoleName: assistantMessage?.metadata?.senderName ?? latestAssistantBeforeOrAtTurn?.metadata?.senderName,
    isAiStreaming: isStreaming && streamingSessionId === sessionId,
    aiMessageId: assistantMessage?.id ?? null,
  };
}
