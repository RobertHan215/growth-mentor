export type ScoringMode = 'bonus' | 'deduction';
export type ScoringDeltaType = 'awarded' | 'deducted' | 'no_change';

export interface OneOnOneScoringCriteria {
  version: 1;
  scoringMode: ScoringMode;
  primary: PrimaryCriterion[];
}

export interface PrimaryCriterion {
  id: string;
  name: string;
  scoringMode: ScoringMode;
  weight: number;
  children: SecondaryCriterion[];
}

export interface SecondaryCriterion {
  id: string;
  name: string;
  weight: number;
  details: DetailCriterion[];
}

export interface DetailCriterion {
  id: string;
  name: string;
  weight: number;
  description: string;
}

export interface FlattenedScoringDetail {
  primaryId: string;
  primaryName: string;
  scoringMode: ScoringMode;
  secondaryId: string;
  secondaryName: string;
  detailId: string;
  detailName: string;
  maxScore: number;
  description: string;
}

export interface DetailScoreInput {
  detailId: string;
  score?: unknown;
  /** Legacy field kept for older AI responses. New evaluations should return score only. */
  scoreDelta?: unknown;
  reason?: string;
  evidence?: string;
}

export interface ScoringResultSnapshot {
  configId: string;
  configName: string;
  tagId: string;
  scoringMode: ScoringMode;
  totalScore: number;
  maxScore: number;
  primary: Array<{
    id: string;
    name: string;
    scoringMode: ScoringMode;
    score: number;
    maxScore: number;
    delta: number;
    children: Array<{
      id: string;
      name: string;
      score: number;
      maxScore: number;
      delta: number;
      details: Array<{
        id: string;
        name: string;
        score: number;
        maxScore: number;
        delta: number;
        type: ScoringDeltaType;
        reason: string;
        evidence: string;
        feedback: string;
      }>;
    }>;
  }>;
}
