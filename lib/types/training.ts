/**
 * Training System Types
 * Types for one-on-one scenario training and class director features
 */

import type { ScoringResultSnapshot } from '@/lib/types/one-on-one-scoring';

// ==================== Training Difficulty & Mode ====================

/** Training difficulty / customer personality */
export type TrainingDifficulty = 'easy' | 'medium' | 'hard';

/** Training mode */
export type TrainingMode = 'roleplay' | 'tutoring';

// ==================== Training Scene Configuration ====================

/** Scoring dimension for training evaluation */
export interface ScoringDimension {
  id: string;
  name: string;             // "沟通技巧" "专业知识" "应变能力"
  weight: number;            // 0-1, all weights should sum to 1
  description: string;       // Detailed scoring criteria
}

/** Difficulty-specific persona overrides */
export interface DifficultyPersonas {
  easy: string;              // "你比较好说话，对产品有初步兴趣"
  medium: string;            // "你会追问条款细节，对比竞品"
  hard: string;              // "你情绪激动，不断压价，威胁去竞品"
}

/** Training scenario configuration */
export interface TrainingScenario {
  background: string;        // Scenario background description
  aiRole: string;            // AI practice partner persona
  learnerRole: string;       // Learner's role description
  difficulty: TrainingDifficulty;  // Default difficulty
  difficultyPersonas: DifficultyPersonas;
}

/** Training scene content (stored in Scene.content) */
export interface TrainingContent {
  type: 'training';
  mode: TrainingMode;
  scenario: TrainingScenario;
  objectives: string[];      // Training objectives
  scoringDimensions: ScoringDimension[];
  maxRounds: number;         // Max dialogue rounds (default 20)
  referenceScript?: string;  // Reference script / best practices (optional)
}

// ==================== Training Results & Evaluation ====================

/** Score for a single dimension */
export interface DimensionScore {
  dimensionId: string;
  dimensionName: string;
  score: number;             // 0-100
  feedback: string;          // AI-generated feedback for this dimension
}

/** Complete training result */
export interface TrainingResult {
  id: string;
  userId: string;
  stageId: string;
  sceneId: string;
  sessionId: string;         // Associated ChatSession ID
  difficulty: TrainingDifficulty;

  // Scoring
  scores: DimensionScore[];
  scoreTree?: ScoringResultSnapshot;
  totalScore: number;        // Weighted total (0-100)

  // Qualitative feedback
  summary: string;           // Class director's overall comment
  highlights: string[];      // What the learner did well
  improvements: string[];    // Areas for improvement
  completedObjectives: string[];  // Achieved objectives

  // Metrics
  dialogueRounds: number;    // Actual dialogue rounds
  duration: number;          // Training duration in seconds

  createdAt: string;         // ISO date string
}

// ==================== Class Director Configuration ====================

/** Class director personality style */
export type DirectorStyle = 'strict' | 'friendly' | 'humorous';

/** Class director configuration (stored in Stage.directorConfig) */
export interface DirectorConfig {
  enabled: boolean;
  name: string;              // "李老师"
  avatar: string;            // Avatar URL or emoji
  persona: string;           // System prompt for director behavior
  style: DirectorStyle;
  color?: string;            // UI theme color
  voiceConfig?: {
    providerId: string;
    voiceId: string;
  };
}

/** Default director config for new courses */
export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  enabled: false,
  name: '班主任',
  avatar: '👩‍🏫',
  persona: '你是一位经验丰富的班主任，负责主持课堂、引导学习进度、组织训练环节，并在课程结束时做总结评价。你的风格亲切专业，善于鼓励学员。',
  style: 'friendly',
  color: '#8B5CF6',
};
