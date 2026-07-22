export interface OneOnOnePersonalityConfig {
  id: string;
  label: string;
  description: string;
  prompt: string;
  enabled: boolean;
}

export interface OneOnOnePromptDimension {
  id: string;
  label: string;
  description: string;
  prompt: string;
  enabled: boolean;
  order: number;
}

export interface OneOnOnePersonaDimension {
  id: string;
  label: string;
  content: string;
}

const ONE_ON_ONE_VISIBLE_PROMPT_DIMENSION_LABELS = new Set(['客户情况', '车辆状态']);

export function isVisibleOneOnOnePromptDimension(
  dimension: Pick<OneOnOnePersonaDimension, 'label'>,
): boolean {
  return ONE_ON_ONE_VISIBLE_PROMPT_DIMENSION_LABELS.has(dimension.label.trim());
}

export interface OneOnOneAiRoleConfig {
  name: string;
  description: string;
  dimensions: OneOnOnePromptDimension[];
}

export interface OneOnOneGlobalConfig {
  version: 1;
  defaultPersonalityId: string;
  personalities: OneOnOnePersonalityConfig[];
  aiRole: OneOnOneAiRoleConfig;
}

interface PersonalityOpeningLineInput {
  personalityType?: string | null;
  behaviorTraits?: string | null;
}

export const ONE_ON_ONE_GLOBAL_CONFIG_KEY = 'one_on_one_global_config';

export const DEFAULT_ONE_ON_ONE_CONFIG: OneOnOneGlobalConfig = {
  version: 1,
  defaultPersonalityId: 'normal',
  personalities: [
    {
      id: 'normal',
      label: '普通',
      description: '正常交流，适度配合',
      prompt: '你表现得正常、配合，偶尔提出一些疑问。',
      enabled: true,
    },
    {
      id: 'tough',
      label: '难缠',
      description: '挑剔、不容易被说服',
      prompt: '你表现得挑剔和难缠，不轻易被说服。',
      enabled: true,
    },
    {
      id: 'skeptical',
      label: '质疑',
      description: '追问逻辑、要求证据',
      prompt: '你质疑态度强烈，不断追问为什么。',
      enabled: true,
    },
  ],
  aiRole: {
    name: '逾期客户',
    description: '用于催收一对一对练的 AI 客户角色，按后台配置的角色情况进行扮演。',
    dimensions: [
      {
        id: 'triggerReason',
        label: '触发原因',
        description: '本次催收或对练被触发的业务原因。',
        prompt: '生成客户进入本次催收场景的原因，例如逾期天数、承诺未兑现、近期失联或风险升级。',
        enabled: true,
        order: 1,
      },
      {
        id: 'communicationBehavior',
        label: '沟通表现',
        description: '客户在沟通中的典型态度、语气和抗拒方式。',
        prompt: '生成客户的沟通表现，例如回避、哭穷、情绪激动、反复拖延、愿意配合但缺少行动。',
        enabled: true,
        order: 2,
      },
      {
        id: 'customerSituation',
        label: '客户情况',
        description: '客户还款合同、月供、总期数、已还期数和当前还款压力。',
        prompt:
          '生成客户情况，例如月供金额、贷款总期数、已经偿还期数、剩余期数，以及客户当前为什么对后续还款有压力。',
        enabled: true,
        order: 3,
      },
      {
        id: 'vehicleStatus',
        label: '车辆状态',
        description: '车辆当前使用、停放、权属或处置风险。',
        prompt:
          '生成车辆状态，例如车辆是否本人使用、停放位置是否明确、是否存在转卖、抵押、失联或被他人占用风险。',
        enabled: true,
        order: 4,
      },
      {
        id: 'assetClues',
        label: '资产线索',
        description: '可用于判断客户还款能力或跟进方向的资产信息。',
        prompt:
          '生成资产线索，例如收入来源、经营状况、家庭支持、其他车辆/房产/设备、近期资金流动或可核实线索。',
        enabled: true,
        order: 5,
      },
      {
        id: 'collectionStrategy',
        label: '催收策略',
        description: '适合该客户画像的催收推进策略和对练挑战点。',
        prompt:
          '生成适合该客户画像的催收策略，包括应推进的还款方案、可突破的话术方向、风险提示边界和学员容易踩坑的挑战点。',
        enabled: true,
        order: 6,
      },
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeDimension(
  value: unknown,
  index: number,
  defaultById: Map<string, OneOnOnePromptDimension>,
  defaultByLabel: Map<string, OneOnOnePromptDimension>,
): OneOnOnePromptDimension | null {
  if (!isRecord(value)) return null;

  const rawId = typeof value.id === 'string' ? value.id.trim() : '';
  const rawLabel = typeof value.label === 'string' ? value.label.trim() : '';
  const fallback =
    (rawId ? defaultById.get(rawId) : undefined) ||
    (rawLabel ? defaultByLabel.get(rawLabel) : undefined);
  const label = text(value.label, fallback?.label || rawId || `维度 ${index + 1}`);
  const id = rawId || fallback?.id || `dimension-${index + 1}`;

  return {
    id,
    label,
    description: text(value.description, fallback?.description || ''),
    prompt: text(value.prompt, fallback?.prompt || `${label}：请生成贴合场景的角色设定。`),
    enabled: bool(value.enabled, fallback?.enabled ?? true),
    order: number(value.order, fallback?.order ?? index + 1),
  };
}

function normalizeDimensions(value: unknown): OneOnOnePromptDimension[] {
  const defaults = DEFAULT_ONE_ON_ONE_CONFIG.aiRole.dimensions;
  const defaultById = new Map(defaults.map((item) => [item.id, item]));
  const defaultByLabel = new Map(defaults.map((item) => [item.label, item]));
  const source = Array.isArray(value) ? value : defaults;

  return source
    .map((item, index) => normalizeDimension(item, index, defaultById, defaultByLabel))
    .filter((item): item is OneOnOnePromptDimension => item !== null)
    .sort((a, b) => a.order - b.order);
}

function normalizePersonality(value: unknown, index: number): OneOnOnePersonalityConfig | null {
  if (!isRecord(value)) return null;

  const rawId = typeof value.id === 'string' ? value.id.trim() : '';
  const fallback = DEFAULT_ONE_ON_ONE_CONFIG.personalities.find((item) => item.id === rawId);
  const id = rawId || fallback?.id || `personality-${index + 1}`;
  const label = text(value.label, fallback?.label || id);

  return {
    id,
    label,
    description: text(value.description, fallback?.description || ''),
    prompt: text(value.prompt, fallback?.prompt || `${label}：请按该陪练性格自然回应。`),
    enabled: bool(value.enabled, fallback?.enabled ?? true),
  };
}

function normalizePersonalities(value: unknown): OneOnOnePersonalityConfig[] {
  const source = Array.isArray(value) ? value : DEFAULT_ONE_ON_ONE_CONFIG.personalities;
  const normalized = source
    .map((item, index) => normalizePersonality(item, index))
    .filter((item): item is OneOnOnePersonalityConfig => item !== null);

  return normalized.length > 0 ? normalized : DEFAULT_ONE_ON_ONE_CONFIG.personalities;
}

export function normalizeOneOnOneConfig(value: unknown): OneOnOneGlobalConfig {
  const source = isRecord(value) ? value : {};
  const aiRoleSource = isRecord(source.aiRole) ? source.aiRole : {};
  const personalities = normalizePersonalities(source.personalities);
  const defaultPersonalityId = text(
    source.defaultPersonalityId,
    DEFAULT_ONE_ON_ONE_CONFIG.defaultPersonalityId,
  );

  return {
    version: 1,
    defaultPersonalityId: personalities.some((item) => item.id === defaultPersonalityId)
      ? defaultPersonalityId
      : personalities[0].id,
    personalities,
    aiRole: {
      name: text(aiRoleSource.name, DEFAULT_ONE_ON_ONE_CONFIG.aiRole.name),
      description: text(aiRoleSource.description, DEFAULT_ONE_ON_ONE_CONFIG.aiRole.description),
      dimensions: normalizeDimensions(aiRoleSource.dimensions),
    },
  };
}

export function getEnabledPromptDimensions(
  config: OneOnOneGlobalConfig,
): OneOnOnePromptDimension[] {
  return config.aiRole.dimensions.filter((dimension) => dimension.enabled);
}

export function getPersonalityPrompt(
  config: OneOnOneGlobalConfig,
  personalityId: string | undefined,
): string {
  // First try to find a matching personality in the config
  const selected = config.personalities.find((item) => item.id === personalityId && item.enabled);
  if (selected) {
    return selected.prompt;
  }

  // If personalityId is a custom type (not a standard personality id), generate a prompt from it
  if (personalityId && personalityId.trim() !== '') {
    // Check if it's a known standard personality
    const knownIds = config.personalities.map((p) => p.id);
    const isCustomType = !knownIds.includes(personalityId);

    if (isCustomType) {
      // Generate a prompt based on the custom personality type
      return buildCustomPersonalityPrompt(personalityId);
    }
  }

  // Fallback to default personality
  const fallback =
    config.personalities.find((item) => item.id === config.defaultPersonalityId && item.enabled) ||
    config.personalities.find((item) => item.enabled) ||
    DEFAULT_ONE_ON_ONE_CONFIG.personalities[0];

  return fallback?.prompt || '你表现得正常、配合，偶尔提出一些疑问。';
}

function includesAnyKeyword(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildCustomPersonalityPrompt(personalityId: string): string {
  const label = personalityId.trim();
  const normalized = label.replace(/\s+/g, '');
  const lines = [
    `你扮演的客户性格类型是「${label}」。这不是展示标签，必须落实到每一轮语气、信息披露和配合程度。`,
    '默认保持真实抗拒：先从自己的处境和利益出发回应，不主动替催收员完成任务，不要因为对方礼貌就立刻变配合。',
    '合规边界：可以急躁、冷淡、质疑、打断、回避、抱怨，但不要辱骂、人身攻击、威胁或输出违法违规内容。',
    '角色转变必须有触发条件：只有当用户给出明确依据、可执行方案并稳定处理情绪时，才逐步软化。',
  ];

  if (includesAnyKeyword(normalized, [/情绪|易怒|激动|暴躁|对抗|激进|强硬|火爆|愤怒/])) {
    lines.push(
      '情绪表现：语气急躁、容易反问和抱怨，被追问时先顶回去，短句多，不耐烦明显；压力越大越先表达不满，再谈原因。',
    );
  }

  if (includesAnyKeyword(normalized, [/困难|无力|还不起|哭穷|低收入|经济|困难还款|配合但无力/])) {
    lines.push(
      '还款表现：反复强调现金流紧张、家庭或经营压力，愿意沟通但不轻易承诺具体时间和金额；用户追得太快时先请求缓一缓。',
    );
  }

  if (includesAnyKeyword(normalized, [/拖欠|拖延|观望|老油条|失联|逃避|敷衍|赖账/])) {
    lines.push(
      '拖延表现：回答模糊、绕开关键问题，常用“再看看、过几天、到账就处理”等说法，不主动给出可核验承诺。',
    );
  }

  if (includesAnyKeyword(normalized, [/质疑|怀疑|不信|挑剔|刁难/])) {
    lines.push(
      '质疑表现：持续追问依据、费用、流程和后果是否合理，要求对方说清楚理由，不接受空泛安抚。',
    );
  }

  return lines.join('\n');
}

export function buildPersonalityOpeningLine(input: PersonalityOpeningLineInput): string {
  const source = [input.personalityType, input.behaviorTraits]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, '');

  if (includesAnyKeyword(source, [/情绪|易怒|激动|暴躁|对抗|激进|强硬|火爆|愤怒/])) {
    return '你们别总催了行不行？我现在就是周转不开，别一上来就逼我。';
  }

  if (includesAnyKeyword(source, [/困难|无力|还不起|哭穷|低收入|经济|困难还款|配合但无力/])) {
    return '我现在真拿不出来钱，家里和现金流都压着，你们再给我点时间。';
  }

  if (includesAnyKeyword(source, [/拖欠|拖延|观望|老油条|失联|逃避|敷衍|赖账|不还|随便|爱咋咋地|凭什么还/])) {
    return '这事我知道了，但你现在让我给准话我也给不了，过几天再说吧。';
  }

  if (includesAnyKeyword(source, [/质疑|怀疑|不信|挑剔|刁难/])) {
    return '你们先把依据说清楚，为什么现在一定要我马上处理？';
  }

  return '我最近资金确实有点紧，你们能不能再宽限几天？';
}

export function getRoleGenerationConfigSignature(config: OneOnOneGlobalConfig): string {
  return JSON.stringify({
    aiRole: config.aiRole,
  });
}
