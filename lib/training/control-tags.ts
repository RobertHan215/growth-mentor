export type TrainingBoardEntryType = 'info' | 'data' | 'commitment' | 'formula' | 'note';

export interface ParsedTrainingBoardTag {
  type: TrainingBoardEntryType;
  content: string;
}

const VALID_BOARD_TYPES = new Set<TrainingBoardEntryType>([
  'info',
  'data',
  'commitment',
  'formula',
  'note',
]);

const BOARD_TAG_PATTERN = /\[BOARD:([\w]+):([^\]]+)\]/g;
const DISPLAY_CONTROL_TAG_PATTERN = /\s?\[(?:SESSION_COMPLETE|BOARD):[^\]]*(?:\]|$)/g;

export function stripTrainingControlTags(content: string): string {
  return content.replace(DISPLAY_CONTROL_TAG_PATTERN, '').trim();
}

export function parseTrainingBoardTags(content: string): ParsedTrainingBoardTag[] {
  return [...content.matchAll(BOARD_TAG_PATTERN)].map((match) => {
    const rawType = match[1] as TrainingBoardEntryType;
    return {
      type: VALID_BOARD_TYPES.has(rawType) ? rawType : 'note',
      content: match[2].trim(),
    };
  });
}
