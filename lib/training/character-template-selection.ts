export interface StageTemplateTagSource {
  oneOnOneTagId?: string | null;
  stageTags?: Array<{ tagId?: string | null }> | null;
}

export interface TaggedCharacterTemplate {
  tagIds?: unknown;
}

export interface CharacterTemplatePersonalitySource {
  id: string;
  name: string;
  personalityType?: string | null;
  description?: string | null;
}

export interface CharacterTemplatePersonalityOption {
  id: string;
  label: string;
  description: string;
}

function uniqueNonEmpty(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });

  return result;
}

export function parseTemplateTagIds(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueNonEmpty(value);
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? uniqueNonEmpty(parsed) : [];
  } catch {
    return [];
  }
}

export function getStageTemplateTagIds(stage: StageTemplateTagSource | null | undefined): string[] {
  if (!stage) return [];

  return uniqueNonEmpty([
    stage.oneOnOneTagId,
    ...(stage.stageTags || []).map((stageTag) => stageTag.tagId),
  ]);
}

export function templateHasAnyTag(
  template: TaggedCharacterTemplate,
  stageTagIds: string[],
): boolean {
  if (stageTagIds.length === 0) return false;

  const stageTagSet = new Set(stageTagIds);
  return parseTemplateTagIds(template.tagIds).some((tagId) => stageTagSet.has(tagId));
}

export function getCharacterTemplatePersonalityOptions(
  templates: CharacterTemplatePersonalitySource[],
): CharacterTemplatePersonalityOption[] {
  return templates.map((template) => ({
    id: template.id,
    label: template.personalityType?.trim() || template.name,
    description: template.description?.trim() || template.name,
  }));
}
