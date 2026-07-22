/**
 * Types for the training weakness tracking system.
 *
 * Tracks historical weaknesses across one-on-one training sessions,
 * allowing the system to show users their areas for improvement and
 * inject them into AI prompts for targeted practice.
 */

/** A single weakness item as stored in the database */
export interface TrainingWeakness {
  id: string;
  userId: string;
  stageId: string;
  name: string;
  description: string;
  suggestion: string;
  status: 'active' | 'resolved';
  firstSeenAt: string;
  resolvedAt: string | null;
  sourceResultId: string;
  resolveResultId: string | null;
}

/** Weakness item for frontend display (subset of fields) */
export interface WeaknessDisplayItem {
  id: string;
  name: string;
  description: string;
  suggestion: string;
  sourceResultId?: string;
  source?: {
    resultId: string;
    sessionId: string;
    title: string | null;
    attemptNumber: number | null;
    createdAt: string;
    totalScore: number;
    rounds: number;
    duration: number;
    summary: string;
  } | null;
}

/** AI analysis result: which weaknesses are resolved and which are new */
export interface WeaknessUpdateAnalysis {
  /** IDs of existing weaknesses that have been resolved in this session */
  resolved: string[];
  /** New weaknesses discovered in this session */
  newWeaknesses: {
    name: string;
    description: string;
    suggestion: string;
  }[];
}
