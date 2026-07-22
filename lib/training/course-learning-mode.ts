export type CourseLearningMode = 'teaching' | 'oneOnOne';

interface CourseModeConfig {
  learningMode?: unknown;
  supportedModes?: unknown;
  directorConfig?: CourseModeConfig | null;
}

function supportedModesFrom(config: CourseModeConfig | null | undefined): string[] {
  return Array.isArray(config?.supportedModes)
    ? config.supportedModes.filter((mode): mode is string => typeof mode === 'string')
    : [];
}

export function deriveLearningMode(config: CourseModeConfig | null | undefined): CourseLearningMode {
  if (config?.learningMode === 'oneOnOne') {
    return 'oneOnOne';
  }

  if (config?.learningMode === 'teaching') {
    return 'teaching';
  }

  const modes = supportedModesFrom(config?.directorConfig || config);

  if (modes.length === 1 && modes[0] === 'oneOnOne') {
    return 'oneOnOne';
  }

  return 'teaching';
}

export function isOneOnOneLearningMode(config: CourseModeConfig | null | undefined): boolean {
  return deriveLearningMode(config) === 'oneOnOne';
}
