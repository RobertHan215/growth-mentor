/**
 * Database Types
 *
 * 纯类型定义文件，不包含任何 Prisma 客户端导入
 * 可以安全地在客户端和服务端使用
 */

import type { SceneType, SceneContent, Whiteboard } from './types/stage';
import type { Action } from './types/action';
import type { SessionType, SessionStatus } from './types/chat';

// ==================== Stage Types ====================

export interface StageRecord {
  id: string;
  userId?: string;
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
  coverImage?: string;
}

// ==================== Scene Types ====================

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

// ==================== Audio Types ====================

export interface AudioFileRecord {
  id: string;
  blob: Blob;
  duration?: number;
  format: string;
  text?: string;
  voice?: string;
  ossKey?: string;
  createdAt: number;
}

// ==================== Image Types ====================

export interface ImageFileRecord {
  id: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

// ==================== Media Types ====================

export interface MediaFileRecord {
  id: string;
  stageId: string;
  type: 'image' | 'video';
  blob: Blob;
  mimeType: string;
  size: number;
  poster?: Blob;
  prompt: string;
  params: string;
  error?: string;
  errorCode?: string;
  ossKey?: string;
  posterOssKey?: string;
  createdAt: number;
}

// ==================== Chat Types ====================

export interface ChatSessionRecord {
  id: string;
  userId?: string;
  stageId: string;
  sceneId?: string;
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: any[];
  config: any;
  toolCalls: any[];
  pendingToolCalls: any[];
  lastActionIndex?: number;
  createdAt: number;
  updatedAt: number;
}

// ==================== Playback Types ====================

export interface PlaybackStateRecord {
  stageId: string;
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  updatedAt: number;
}

// ==================== Outline Types ====================

export interface StageOutlinesRecord {
  stageId: string;
  outlines: any[];
  createdAt: number;
  updatedAt: number;
}

// ==================== Generated Agent Types ====================

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

// ==================== Snapshot Types ====================

export interface Snapshot {
  id?: number;
  index: number;
  slides: any[];
}
