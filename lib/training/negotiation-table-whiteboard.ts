export type NegotiationChipKind = 'risk' | 'fact' | 'plan' | 'commitment';
export type NegotiationChipPriority = 'low' | 'medium' | 'high';

export type NegotiationTableEntryType = 'info' | 'data' | 'commitment' | 'formula' | 'note';

export interface NegotiationTableWhiteboardEntry {
  id: string;
  type: NegotiationTableEntryType;
  content: string;
  timestamp: number;
  round: number;
}

export interface NegotiationTableChip {
  id: string;
  kind: NegotiationChipKind;
  label: string;
  value: string;
  round: number;
  priority: NegotiationChipPriority;
  evidence?: string;
}

export interface NegotiationTableBoardState {
  profile: {
    name: string;
    summary: string;
    attitude: string;
  };
  chips: NegotiationTableChip[];
  currentObjective: {
    title: string;
    rationale: string;
    round: number;
  };
  capturedCount: number;
}

const DEFAULT_PROFILE_NAME = '对练对象';
const DEFAULT_PROFILE_SUMMARY = '对练开始后自动提炼对象信息';
const DEFAULT_ATTITUDE = '观察中';

const CHIP_TYPE_CONFIG: Record<
  NegotiationTableEntryType,
  {
    kind: NegotiationChipKind;
    label: string;
    priority: NegotiationChipPriority;
  }
> = {
  info: { kind: 'fact', label: '信息', priority: 'medium' },
  data: { kind: 'fact', label: '事实', priority: 'medium' },
  formula: { kind: 'plan', label: '方案', priority: 'medium' },
  commitment: { kind: 'commitment', label: '承诺', priority: 'high' },
  note: { kind: 'risk', label: '异议', priority: 'high' },
};

export function buildNegotiationTableBoardState(
  entries: NegotiationTableWhiteboardEntry[],
  profileName = DEFAULT_PROFILE_NAME,
): NegotiationTableBoardState {
  const profileEntries = entries.filter((entry) => entry.round === 0);
  const liveEntries = entries.filter((entry) => entry.round > 0);
  const chips = liveEntries.map(toNegotiationChip);
  const currentObjective = deriveCurrentObjective(chips);

  return {
    profile: {
      name: profileName || DEFAULT_PROFILE_NAME,
      summary: buildProfileSummary(profileEntries),
      attitude: deriveAttitude(chips),
    },
    chips,
    currentObjective,
    capturedCount: entries.length,
  };
}

function toNegotiationChip(entry: NegotiationTableWhiteboardEntry): NegotiationTableChip {
  const config = CHIP_TYPE_CONFIG[entry.type] ?? CHIP_TYPE_CONFIG.note;
  return {
    id: entry.id,
    kind: config.kind,
    label: config.label,
    value: entry.content,
    round: entry.round,
    priority: config.priority,
    evidence: `R${entry.round}: ${entry.content}`,
  };
}

function buildProfileSummary(entries: NegotiationTableWhiteboardEntry[]): string {
  if (entries.length === 0) return DEFAULT_PROFILE_SUMMARY;
  return entries.map((entry) => entry.content).join(' · ');
}

function deriveCurrentObjective(chips: NegotiationTableChip[]): NegotiationTableBoardState['currentObjective'] {
  const latestRisk = findLatestChip(chips, 'risk');
  if (latestRisk) {
    return {
      title: '处理当前异议',
      rationale: latestRisk.value,
      round: latestRisk.round,
    };
  }

  const latestCommitment = findLatestChip(chips, 'commitment');
  if (latestCommitment) {
    return {
      title: '补齐承诺细节',
      rationale: latestCommitment.value,
      round: latestCommitment.round,
    };
  }

  const latestPlan = findLatestChip(chips, 'plan');
  if (latestPlan) {
    return {
      title: '确认方案可执行性',
      rationale: latestPlan.value,
      round: latestPlan.round,
    };
  }

  const latestFact = findLatestChip(chips, 'fact');
  if (latestFact) {
    return {
      title: '推进下一步确认',
      rationale: latestFact.value,
      round: latestFact.round,
    };
  }

  return {
    title: '等待关键线索',
    rationale: '继续对练，AI 将自动提炼事实、异议、方案和承诺。',
    round: 0,
  };
}

function deriveAttitude(chips: NegotiationTableChip[]): string {
  if (findLatestChip(chips, 'commitment')) return '出现承诺';
  if (findLatestChip(chips, 'risk')) return '存在异议';
  if (findLatestChip(chips, 'plan')) return '方案协商中';
  return DEFAULT_ATTITUDE;
}

function findLatestChip(
  chips: NegotiationTableChip[],
  kind: NegotiationChipKind,
): NegotiationTableChip | undefined {
  return chips
    .filter((chip) => chip.kind === kind)
    .sort((a, b) => b.round - a.round)
    .at(0);
}
