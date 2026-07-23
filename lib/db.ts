import { PrismaClient } from '@prisma/client';
import type { Scene, SceneType, SceneContent, Whiteboard } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type {
  SessionType,
  SessionStatus,
  SessionConfig,
  ToolCallRecord,
  ToolCallRequest,
} from '@/lib/types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import type { UIMessage } from 'ai';
import { createLogger } from '@/lib/logger';

const log = createLogger('MySQLDatabase');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma(): PrismaClient {
  const connectionUrl = process.env.DATABASE_URL + '?connection_limit=2&pool_timeout=10';
  return new PrismaClient({
    datasources: { db: { url: connectionUrl } },
    log: ['error', 'warn'],
  });
}

export const prisma: PrismaClient =
  process.env.NODE_ENV === 'production'
    ? (globalForPrisma.prisma ??= createPrisma())
    : (globalForPrisma.prisma ??= createPrisma());

export default prisma;

// ==================== Type Definitions ====================

export interface StageRecord {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  language?: string;
  style?: string;
  currentSceneId?: string;
  agentIds?: string[];
  learningMode?: 'teaching' | 'oneOnOne';
  directorConfig?: Record<string, unknown>;
  visibilityRoles?: string;
  visibilityUsers?: string;
  coverImage?: string;
  oneOnOneTagId?: string;
  characterTemplateIds?: string[];
}

export interface SceneRecord {
  id: string;
  stageId: string;
  type: SceneType;
  title: string;
  order: number;
  content: SceneContent;
  actions?: Action[];
  whiteboard?: Whiteboard[];
  createdAt: number;
  updatedAt: number;
}

export interface AudioFileRecord {
  id: string;
  blob: Buffer;
  duration?: number;
  format: string;
  text?: string;
  voice?: string;
  ossKey?: string;
  createdAt: number;
}

export interface ImageFileRecord {
  id: string;
  blob: Buffer;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

export interface ChatSessionRecord {
  id: string;
  userId?: string;
  stageId: string;
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: UIMessage[];
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
  lastActionIndex?: number;
}

export interface PlaybackStateRecord {
  stageId: string;
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  updatedAt: number;
}

export interface StageOutlinesRecord {
  stageId: string;
  outlines: SceneOutline[];
  createdAt: number;
  updatedAt: number;
}

export interface MediaFileRecord {
  id: string;
  stageId: string;
  type: 'image' | 'video';
  blob: Buffer;
  mimeType: string;
  size: number;
  poster?: Buffer;
  prompt: string;
  params: string;
  error?: string;
  errorCode?: string;
  ossKey?: string;
  posterOssKey?: string;
  createdAt: number;
}

export interface GeneratedAgentRecord {
  id: string;
  stageId: string;
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  createdAt: number;
}

export interface CourseSummaryRecord {
  id: string;
  userId: string;
  stageId: string;
  content: any; // CourseSummaryContent
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  id?: number;
  index: number;
  slides: Scene[];
}

// ==================== Helper Functions ====================

function stageFromDB(record: {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  language: string | null;
  style: string | null;
  currentSceneId: string | null;
  agentIds: string | null;
  directorConfig?: unknown;
  learningMode?: string | null;
  visibilityRoles?: string | null;
  visibilityUsers?: string | null;
  coverImage?: string | null;
  oneOnOneTagId?: string | null;
  characterTemplateIds?: string | null;
}): StageRecord & { directorConfig?: Record<string, unknown> } {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    description: record.description || undefined,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
    language: record.language || undefined,
    style: record.style || undefined,
    currentSceneId: record.currentSceneId || undefined,
    agentIds: record.agentIds ? JSON.parse(record.agentIds) : undefined,
    learningMode: record.learningMode === 'oneOnOne' ? 'oneOnOne' : 'teaching',
    ...(record.directorConfig ? { directorConfig: record.directorConfig as Record<string, unknown> } : {}),
    visibilityRoles: record.visibilityRoles || undefined,
    visibilityUsers: record.visibilityUsers || undefined,
    coverImage: record.coverImage || undefined,
    oneOnOneTagId: record.oneOnOneTagId || undefined,
    characterTemplateIds: record.characterTemplateIds ? JSON.parse(record.characterTemplateIds) : undefined,
  };
}

// MySQL String defaults to VARCHAR(191); keep names/titles inside the column limit.
const DB_VARCHAR_LIMIT = 191;

function clipVarchar(value: string | null | undefined, limit = DB_VARCHAR_LIMIT): string | null {
  if (value == null) return null;
  return value.length > limit ? value.slice(0, limit) : value;
}

function stageToDB(record: Partial<StageRecord> & { id: string; userId: string; name: string }) {
  return {
    id: record.id,
    userId: record.userId,
    name: clipVarchar(record.name) || 'Untitled',
    description: record.description || null,
    language: record.language || null,
    style: record.style || null,
    currentSceneId: record.currentSceneId || null,
    agentIds: record.agentIds ? JSON.stringify(record.agentIds) : null,
    learningMode: record.learningMode || 'teaching',
    oneOnOneTagId: record.oneOnOneTagId || null,
    characterTemplateIds: record.characterTemplateIds ? JSON.stringify(record.characterTemplateIds) : null,
  };
}

function sceneFromDB(record: {
  id: string;
  stageId: string;
  type: string;
  title: string;
  order: number;
  content: any;
  actions: any;
  whiteboard: any;
  createdAt: Date;
  updatedAt: Date;
}): SceneRecord {
  return {
    id: record.id,
    stageId: record.stageId,
    type: record.type as SceneType,
    title: record.title,
    order: record.order,
    content: record.content as SceneContent,
    actions: (record.actions as Action[]) || undefined,
    whiteboard: (record.whiteboard as Whiteboard[]) || undefined,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };
}

function sceneToDB(record: SceneRecord) {
  return {
    id: record.id,
    stageId: record.stageId,
    type: record.type,
    title: clipVarchar(record.title) || 'Untitled',
    order: record.order,
    content: record.content,
    actions: record.actions || null,
    whiteboard: record.whiteboard || null,
  };
}

// ==================== Stage Operations ====================

export async function listStages(userId: string): Promise<StageRecord[]> {
  const stages = await prisma.stage.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return stages.map(stageFromDB);
}

export async function getStage(stageId: string): Promise<StageRecord | null> {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
  });
  return stage ? stageFromDB(stage) : null;
}

export async function createStage(record: StageRecord): Promise<void> {
  const dbData = stageToDB(record);
  // Upsert: generation may retry after a partial local-only save.
  await prisma.stage.upsert({
    where: { id: dbData.id },
    create: dbData as any,
    update: {
      name: dbData.name,
      description: dbData.description,
      language: dbData.language,
      style: dbData.style,
      currentSceneId: dbData.currentSceneId,
      agentIds: dbData.agentIds,
      learningMode: dbData.learningMode,
      oneOnOneTagId: dbData.oneOnOneTagId,
      characterTemplateIds: dbData.characterTemplateIds,
    },
  });
}

export async function updateStage(
  stageId: string,
  data: Partial<Omit<StageRecord, 'id' | 'userId' | 'createdAt'>> & {
    directorConfig?: Record<string, unknown>;
    userId?: string;
  },
): Promise<void> {
  const updateData: Record<string, unknown> = {
    name: data.name !== undefined ? clipVarchar(data.name) || 'Untitled' : undefined,
    description: data.description !== undefined ? data.description || null : undefined,
    language: data.language !== undefined ? data.language || null : undefined,
    style: data.style !== undefined ? data.style || null : undefined,
    currentSceneId: data.currentSceneId !== undefined ? data.currentSceneId || null : undefined,
    agentIds: data.agentIds !== undefined ? (data.agentIds ? JSON.stringify(data.agentIds) : null) : undefined,
    learningMode: data.learningMode,
    oneOnOneTagId: data.oneOnOneTagId !== undefined ? data.oneOnOneTagId || null : undefined,
    characterTemplateIds:
      data.characterTemplateIds !== undefined
        ? data.characterTemplateIds
          ? JSON.stringify(data.characterTemplateIds)
          : null
        : undefined,
  };

  // Deep-merge directorConfig: read existing value, then spread new fields on top
  if (data.directorConfig) {
    const existing = await prisma.stage.findUnique({
      where: { id: stageId },
      select: { directorConfig: true },
    });
    const existingConfig = (existing?.directorConfig as Record<string, unknown>) || {};
    updateData.directorConfig = { ...existingConfig, ...data.directorConfig };
  }

  // Remove undefined keys so Prisma doesn't accidentally null out untouched fields
  for (const key of Object.keys(updateData)) {
    if (updateData[key] === undefined) delete updateData[key];
  }

  try {
    await prisma.stage.update({
      where: { id: stageId },
      data: updateData as Parameters<typeof prisma.stage.update>[0]['data'],
    });
  } catch (error: any) {
    // Local IndexedDB may already have the stage while MySQL create previously failed.
    // Recover by creating when the caller still has a userId.
    if (error?.code === 'P2025' && data.userId) {
      await createStage({
        id: stageId,
        userId: data.userId,
        name: (data.name as string) || 'Untitled',
        description: data.description,
        language: data.language,
        style: data.style,
        currentSceneId: data.currentSceneId,
        agentIds: data.agentIds,
        learningMode: data.learningMode,
        oneOnOneTagId: data.oneOnOneTagId,
        characterTemplateIds: data.characterTemplateIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      if (data.directorConfig) {
        await prisma.stage.update({
          where: { id: stageId },
          data: { directorConfig: data.directorConfig } as any,
        });
      }
      return;
    }
    throw error;
  }
}

export async function deleteStage(stageId: string): Promise<void> {
  await prisma.stage.delete({
    where: { id: stageId },
  });
}

// ==================== Scene Operations ====================

export async function getScenesByStageId(stageId: string): Promise<SceneRecord[]> {
  const scenes = await prisma.scene.findMany({
    where: { stageId },
    orderBy: { order: 'asc' },
  });
  return scenes.map(sceneFromDB);
}

export async function getScene(sceneId: string): Promise<SceneRecord | null> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
  });
  return scene ? sceneFromDB(scene) : null;
}

export async function createScene(record: SceneRecord): Promise<void> {
  const dbData = sceneToDB(record);
  await prisma.scene.upsert({
    where: { id: dbData.id },
    create: dbData as any,
    update: dbData as any,
  });
}

export async function updateScene(
  sceneId: string,
  data: Partial<Omit<SceneRecord, 'id' | 'stageId' | 'createdAt'>>,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.order !== undefined) updateData.order = data.order;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.actions !== undefined) updateData.actions = data.actions || null;
  if (data.whiteboard !== undefined) updateData.whiteboard = data.whiteboard || null;

  await prisma.scene.update({
    where: { id: sceneId },
    data: updateData as any,
  });
}

export async function deleteScene(sceneId: string): Promise<void> {
  await prisma.scene.delete({
    where: { id: sceneId },
  });
}

export async function deleteScenesByStageId(stageId: string): Promise<void> {
  await prisma.scene.deleteMany({
    where: { stageId },
  });
}

// ==================== Chat Session Operations ====================

export async function getChatSessionsByStageId(stageId: string, userId?: string): Promise<ChatSessionRecord[]> {
  const sessions = await prisma.chatSession.findMany({
    where: { ...(userId ? { userId } : {}), stageId },
    orderBy: { createdAt: 'desc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId ?? undefined,
    stageId: s.stageId,
    sceneId: s.sceneId || undefined,
    type: s.type as SessionType,
    title: s.title,
    status: s.status as SessionStatus,
    messages: s.messages as any as UIMessage[],
    config: s.config as any as SessionConfig,
    toolCalls: s.toolCalls as any as ToolCallRecord[],
    pendingToolCalls: s.pendingToolCalls as any as ToolCallRequest[],
    lastActionIndex: s.lastActionIndex || undefined,
    createdAt: s.createdAt.getTime(),
    updatedAt: s.updatedAt.getTime(),
  }));
}

export async function getChatSession(sessionId: string): Promise<ChatSessionRecord | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return null;
  return {
    id: session.id,
    userId: session.userId ?? undefined,
    stageId: session.stageId,
    sceneId: session.sceneId || undefined,
    type: session.type as SessionType,
    title: session.title,
    status: session.status as SessionStatus,
    messages: session.messages as any as UIMessage[],
    config: session.config as any as SessionConfig,
    toolCalls: session.toolCalls as any as ToolCallRecord[],
    pendingToolCalls: session.pendingToolCalls as any as ToolCallRequest[],
    lastActionIndex: session.lastActionIndex || undefined,
    createdAt: session.createdAt.getTime(),
    updatedAt: session.updatedAt.getTime(),
  };
}

export async function createChatSession(record: ChatSessionRecord): Promise<void> {
  await prisma.chatSession.create({
    data: {
      id: record.id,
      userId: record.userId,
      stageId: record.stageId,
      sceneId: record.sceneId || null,
      type: record.type,
      title: record.title,
      status: record.status,
      messages: record.messages as any,
      config: record.config as any,
      toolCalls: record.toolCalls as any,
      pendingToolCalls: record.pendingToolCalls as any,
      lastActionIndex: record.lastActionIndex || null,
    },
  });
}

export async function updateChatSession(
  sessionId: string,
  userId: string,
  data: Partial<Omit<ChatSessionRecord, 'id' | 'userId' | 'stageId' | 'createdAt'>>,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.messages !== undefined) updateData.messages = data.messages;
  if (data.config !== undefined) updateData.config = data.config;
  if (data.toolCalls !== undefined) updateData.toolCalls = data.toolCalls;
  if (data.pendingToolCalls !== undefined) updateData.pendingToolCalls = data.pendingToolCalls;
  if (data.lastActionIndex !== undefined) updateData.lastActionIndex = data.lastActionIndex;

  try {
    await prisma.chatSession.update({
      where: { id: sessionId, userId },
      data: updateData,
    });
  } catch (error: unknown) {
    // P2025: Record not found — skip silently since the session may have been
    // deleted or not yet created (race condition between create and update).
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      log.warn(`chatSession.update skipped: session ${sessionId} not found (P2025)`);
      return;
    }
    throw error;
  }
}

export async function deleteChatSession(sessionId: string, userId: string): Promise<void> {
  await prisma.chatSession.delete({
    where: { id: sessionId, userId },
  });
}

// ==================== Playback State Operations ====================

export async function getPlaybackState(stageId: string): Promise<PlaybackStateRecord | null> {
  const state = await prisma.playbackState.findUnique({
    where: { stageId },
  });
  if (!state) return null;
  return {
    stageId: state.stageId,
    sceneIndex: state.sceneIndex,
    actionIndex: state.actionIndex,
    consumedDiscussions: state.consumedDiscussions as string[],
    updatedAt: state.updatedAt.getTime(),
  };
}

export async function savePlaybackState(record: PlaybackStateRecord): Promise<void> {
  await prisma.playbackState.upsert({
    where: { stageId: record.stageId },
    update: {
      sceneIndex: record.sceneIndex,
      actionIndex: record.actionIndex,
      consumedDiscussions: record.consumedDiscussions,
    },
    create: {
      stageId: record.stageId,
      sceneIndex: record.sceneIndex,
      actionIndex: record.actionIndex,
      consumedDiscussions: record.consumedDiscussions,
    },
  });
}

export async function deletePlaybackState(stageId: string): Promise<void> {
  await prisma.playbackState.delete({
    where: { stageId },
  });
}

// ==================== Stage Outlines Operations ====================

export async function getStageOutlines(stageId: string): Promise<StageOutlinesRecord | null> {
  const outlines = await prisma.stageOutlines.findUnique({
    where: { stageId },
  });
  if (!outlines) return null;
  return {
    stageId: outlines.stageId,
    outlines: outlines.outlines as any as SceneOutline[],
    createdAt: outlines.createdAt.getTime(),
    updatedAt: outlines.updatedAt.getTime(),
  };
}

export async function saveStageOutlines(record: StageOutlinesRecord): Promise<void> {
  const exists = await prisma.stage.findUnique({ where: { id: record.stageId } });
  if (!exists) {
    return;
  }

  await prisma.stageOutlines.upsert({
    where: { stageId: record.stageId },
    update: { outlines: record.outlines as any },
    create: {
      stageId: record.stageId,
      outlines: record.outlines as any,
    },
  });
}

export async function deleteStageOutlines(stageId: string): Promise<void> {
  await prisma.stageOutlines.delete({
    where: { stageId },
  });
}

// ==================== Audio File Operations ====================

export async function getAudioFile(id: string): Promise<AudioFileRecord | null> {
  const file = await prisma.audioFile.findUnique({
    where: { id },
  });
  if (!file) return null;
  return {
    id: file.id,
    blob: Buffer.from(file.blob) as any,
    duration: file.duration || undefined,
    format: file.format,
    text: file.text || undefined,
    voice: file.voice || undefined,
    ossKey: file.ossKey || undefined,
    createdAt: file.createdAt.getTime(),
  };
}

export async function saveAudioFile(
  record: AudioFileRecord & { blobBase64?: string },
): Promise<void> {
  let blobData: Buffer;
  const raw = record as AudioFileRecord & { blobBase64?: string; blob?: unknown };

  if (typeof raw.blobBase64 === 'string' && raw.blobBase64) {
    blobData = Buffer.from(raw.blobBase64, 'base64');
  } else if (Buffer.isBuffer(raw.blob)) {
    blobData = raw.blob;
  } else if (raw.blob && typeof raw.blob === 'object' && ArrayBuffer.isView(raw.blob as ArrayBufferView)) {
    blobData = Buffer.from(raw.blob as Uint8Array);
  } else if (raw.blob && typeof raw.blob === 'object' && (raw.blob as ArrayBuffer).byteLength !== undefined) {
    blobData = Buffer.from(new Uint8Array(raw.blob as ArrayBuffer));
  } else {
    throw new Error('Audio blob missing (expected blobBase64 or Buffer)');
  }

  const data = {
    id: record.id,
    blob: new Uint8Array(blobData),
    duration: record.duration || null,
    format: record.format,
    text: record.text || null,
    voice: record.voice || null,
    ossKey: record.ossKey || null,
  };

  await prisma.audioFile.upsert({
    where: { id: data.id },
    create: data,
    update: {
      blob: data.blob,
      duration: data.duration,
      format: data.format,
      text: data.text,
      voice: data.voice,
      ossKey: data.ossKey,
    },
  });
}

export async function deleteAudioFile(id: string): Promise<void> {
  await prisma.audioFile.delete({
    where: { id },
  });
}

// ==================== Image File Operations ====================

export async function getImageFile(id: string): Promise<ImageFileRecord | null> {
  const file = await prisma.imageFile.findUnique({
    where: { id },
  });
  if (!file) return null;
  return {
    id: file.id,
    blob: Buffer.from(file.blob) as any,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt.getTime(),
  };
}

export async function saveImageFile(record: ImageFileRecord): Promise<void> {
  let blobData: Buffer;
  const blob = record.blob as unknown;

  if (Buffer.isBuffer(blob)) {
    blobData = blob;
  } else if (blob instanceof Uint8Array) {
    blobData = Buffer.from(blob);
  } else if (blob instanceof ArrayBuffer) {
    blobData = Buffer.from(blob);
  } else {
    blobData = Buffer.from(JSON.stringify(blob));
  }

  await prisma.imageFile.create({
    data: {
      id: record.id,
      blob: new Uint8Array(blobData),
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
    },
  });
}

export async function deleteImageFile(id: string): Promise<void> {
  await prisma.imageFile.deleteMany({
    where: { id },
  });
}

// ==================== Media File Operations ====================

export function mediaFileKey(stageId: string, elementId: string): string {
  return `${stageId}:${elementId}`;
}

export async function getMediaFile(id: string): Promise<MediaFileRecord | null> {
  const file = await prisma.mediaFile.findUnique({
    where: { id },
  });
  if (!file) return null;
  return {
    id: file.id,
    stageId: file.stageId,
    type: file.type as 'image' | 'video',
    blob: Buffer.from(file.blob) as any,
    mimeType: file.mimeType,
    size: file.size,
    poster: file.poster ? (Buffer.from(file.poster) as any) : undefined,
    prompt: file.prompt,
    params: file.params,
    error: file.error || undefined,
    errorCode: file.errorCode || undefined,
    ossKey: file.ossKey || undefined,
    posterOssKey: file.posterOssKey || undefined,
    createdAt: file.createdAt.getTime(),
  };
}

export async function getMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
  const files = await prisma.mediaFile.findMany({
    where: { stageId },
  });
  return files.map((f) => ({
    id: f.id,
    stageId: f.stageId,
    type: f.type as 'image' | 'video',
    blob: Buffer.from(f.blob) as any,
    mimeType: f.mimeType,
    size: f.size,
    poster: f.poster ? (Buffer.from(f.poster) as any) : undefined,
    prompt: f.prompt,
    params: f.params,
    error: f.error || undefined,
    errorCode: f.errorCode || undefined,
    ossKey: f.ossKey || undefined,
    posterOssKey: f.posterOssKey || undefined,
    createdAt: f.createdAt.getTime(),
  }));
}

export async function saveMediaFile(record: MediaFileRecord): Promise<void> {
  await prisma.mediaFile.create({
    data: {
      id: record.id,
      stageId: record.stageId,
      type: record.type,
      blob: record.blob as any,
      mimeType: record.mimeType,
      size: record.size,
      poster: (record.poster as any) || null,
      prompt: record.prompt,
      params: record.params,
      error: record.error || null,
      errorCode: record.errorCode || null,
      ossKey: record.ossKey || null,
      posterOssKey: record.posterOssKey || null,
    },
  });
}

export async function updateMediaFile(
  id: string,
  data: Partial<Omit<MediaFileRecord, 'id' | 'stageId' | 'createdAt'>>,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.blob !== undefined) updateData.blob = data.blob as any;
  if (data.mimeType !== undefined) updateData.mimeType = data.mimeType;
  if (data.size !== undefined) updateData.size = data.size;
  if (data.poster !== undefined) updateData.poster = (data.poster as any) || null;
  if (data.error !== undefined) updateData.error = data.error || null;
  if (data.errorCode !== undefined) updateData.errorCode = data.errorCode || null;
  if (data.ossKey !== undefined) updateData.ossKey = data.ossKey || null;
  if (data.posterOssKey !== undefined) updateData.posterOssKey = data.posterOssKey || null;

  await prisma.mediaFile.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteMediaFile(id: string): Promise<void> {
  await prisma.mediaFile.delete({
    where: { id },
  });
}

export async function deleteMediaFilesByStageId(stageId: string): Promise<void> {
  await prisma.mediaFile.deleteMany({
    where: { stageId },
  });
}

// ==================== Generated Agent Operations ====================

export async function getGeneratedAgentsByStageId(
  stageId: string,
): Promise<GeneratedAgentRecord[]> {
  const agents = await prisma.generatedAgent.findMany({
    where: { stageId },
  });
  return agents.map((a) => ({
    id: a.id,
    stageId: a.stageId,
    name: a.name,
    role: a.role,
    persona: a.persona,
    avatar: a.avatar,
    color: a.color,
    priority: a.priority,
    createdAt: a.createdAt.getTime(),
  }));
}

export async function saveGeneratedAgent(record: GeneratedAgentRecord): Promise<void> {
  const data = {
    id: record.id,
    stageId: record.stageId,
    name: clipVarchar(record.name) || 'Agent',
    role: record.role,
    persona: record.persona,
    avatar: record.avatar,
    color: record.color,
    priority: record.priority,
  };
  await prisma.generatedAgent.upsert({
    where: { id: data.id },
    create: data,
    update: {
      stageId: data.stageId,
      name: data.name,
      role: data.role,
      persona: data.persona,
      avatar: data.avatar,
      color: data.color,
      priority: data.priority,
    },
  });
}

export async function deleteGeneratedAgent(id: string): Promise<void> {
  await prisma.generatedAgent.delete({
    where: { id },
  });
}

export async function deleteGeneratedAgentsByStageId(stageId: string): Promise<void> {
  await prisma.generatedAgent.deleteMany({
    where: { stageId },
  });
}

// ==================== Course Summary Operations ====================

export async function getCourseSummary(userId: string, stageId: string): Promise<CourseSummaryRecord | null> {
  const summary = await prisma.courseSummary.findUnique({
    where: { userId_stageId: { userId, stageId } },
  });
  if (!summary) return null;
  return {
    id: summary.id,
    userId: summary.userId,
    stageId: summary.stageId,
    content: summary.content,
    createdAt: summary.createdAt.getTime(),
    updatedAt: summary.updatedAt.getTime(),
  };
}

export async function saveCourseSummary(record: Omit<CourseSummaryRecord, "id" | "createdAt" | "updatedAt">): Promise<void> {
  await prisma.courseSummary.upsert({
    where: { userId_stageId: { userId: record.userId, stageId: record.stageId } },
    update: {
      content: record.content as any,
    },
    create: {
      userId: record.userId,
      stageId: record.stageId,
      content: record.content as any,
    },
  });
}

// ==================== Snapshot Operations ====================

export async function getSnapshots(): Promise<Snapshot[]> {
  const snapshots = await prisma.snapshot.findMany({
    orderBy: { index: 'asc' },
  });
  return snapshots.map((s) => ({
    id: s.id,
    index: s.index,
    slides: s.slides as any as Scene[],
  }));
}

export async function saveSnapshot(snapshot: Omit<Snapshot, 'id'>): Promise<number> {
  const result = await prisma.snapshot.create({
    data: {
      index: snapshot.index,
      slides: snapshot.slides as any,
    },
  });
  return result.id;
}

export async function deleteSnapshot(id: number): Promise<void> {
  await prisma.snapshot.delete({
    where: { id },
  });
}

export async function clearSnapshots(): Promise<void> {
  await prisma.snapshot.deleteMany();
}

// ==================== UserCourse (Enrollment) Operations ====================

export interface UserCourseRecord {
  userId: string;
  stageId: string;
  source: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface EnrolledStageItem extends StageRecord {
  sceneCount: number;
  supportedModes?: string[];
  learningMode?: 'teaching' | 'oneOnOne';
}

export async function getEnrolledStages(userId: string): Promise<EnrolledStageItem[]> {
  const userCourses = await prisma.userCourse.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      stage: {
        include: {
          stageTags: { include: { tag: true } },
          category: true,
          user: { select: { id: true, name: true } },
          scenes: { select: { id: true } },
        },
      },
    },
  });

  return userCourses.map((uc) => {
    const stage = stageFromDB(uc.stage);
    return {
      ...stage,
      sceneCount: uc.stage.scenes.length,
      learningMode: stage.learningMode,
      supportedModes: (uc.stage as any).directorConfig?.supportedModes,
      coverImage: uc.stage.coverImage || undefined,
    } as EnrolledStageItem;
  });
}

export async function enrollCourse(
  userId: string,
  stageId: string,
  source: 'self_selected' | 'assigned' = 'self_selected',
): Promise<void> {
  try {
    await prisma.userCourse.upsert({
      where: {
        userId_stageId: { userId, stageId },
      },
      create: {
        userId,
        stageId,
        source,
        status: 'active',
      },
      update: {
        source,
        status: 'active',
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return;
    }
    throw error;
  }
}

// ==================== Cascade Delete ====================

export async function deleteStageWithRelatedData(stageId: string): Promise<void> {
  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { stageId } }),
    prisma.chatSession.deleteMany({ where: { stageId } }),
    prisma.playbackState.deleteMany({ where: { stageId } }),
    prisma.stageOutlines.deleteMany({ where: { stageId } }),
    prisma.mediaFile.deleteMany({ where: { stageId } }),
    prisma.generatedAgent.deleteMany({ where: { stageId } }),
    prisma.courseSummary.deleteMany({ where: { stageId } }),
    prisma.userCourse.deleteMany({ where: { stageId } }),
    prisma.stage.delete({ where: { id: stageId } }),
  ]);
}

// ==================== Statistics ====================

export async function getDatabaseStats() {
  const [
    stages,
    scenes,
    audioFiles,
    imageFiles,
    snapshots,
    chatSessions,
    playbackStates,
    stageOutlines,
    mediaFiles,
    generatedAgents,
  ] = await Promise.all([
    prisma.stage.count(),
    prisma.scene.count(),
    prisma.audioFile.count(),
    prisma.imageFile.count(),
    prisma.snapshot.count(),
    prisma.chatSession.count(),
    prisma.playbackState.count(),
    prisma.stageOutlines.count(),
    prisma.mediaFile.count(),
    prisma.generatedAgent.count(),
  ]);

  return {
    stages,
    scenes,
    audioFiles,
    imageFiles,
    snapshots,
    chatSessions,
    playbackStates,
    stageOutlines,
    mediaFiles,
    generatedAgents,
  };
}

// ==================== First Slide Thumbnail ====================

export async function getFirstSlideByStages(stageIds: string[]): Promise<Record<string, Scene>> {
  // Scenes are ordered starting from 1 (not 0). To get the first slide for each stage,
  // we fetch all scenes and pick the one with the lowest order that has type='slide'.
  const scenes = await prisma.scene.findMany({
    where: {
      stageId: { in: stageIds },
      type: 'slide',
    },
    orderBy: { order: 'asc' },
  });

  const result: Record<string, Scene> = {};
  for (const scene of scenes) {
    // Since results are ordered by order ASC, the first occurrence per stageId is the first slide.
    // Skip if we already recorded a (lower-order) scene for this stage.
    if (result[scene.stageId]) continue;
    result[scene.stageId] = {
      id: scene.id,
      stageId: scene.stageId,
      type: scene.type as SceneType,
      title: scene.title,
      order: scene.order,
      content: scene.content as unknown as SceneContent,
    };
  }
  return result;
}

// ==================== Initialize ====================

export async function initDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    log.info('MySQL Database initialized successfully');
  } catch (error) {
    log.error('Failed to initialize MySQL database:', error);
    throw error;
  }
}

export async function clearDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.snapshot.deleteMany(),
    prisma.mediaFile.deleteMany(),
    prisma.generatedAgent.deleteMany(),
    prisma.stageOutlines.deleteMany(),
    prisma.playbackState.deleteMany(),
    prisma.chatSession.deleteMany(),
    prisma.scene.deleteMany(),
    prisma.audioFile.deleteMany(),
    prisma.imageFile.deleteMany(),
    prisma.stage.deleteMany(),
  ]);
  log.info('Database cleared');
}
