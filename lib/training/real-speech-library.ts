export type SpeechRole = 'customer' | 'agent';

export interface AsrDialogueTurn {
  speaker: SpeechRole;
  start?: number;
  end?: number;
  text: string;
}

export interface NormalizedSpeechTurn {
  order: number;
  speaker: SpeechRole;
  role: SpeechRole;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

export interface SpeechContext {
  triggerAction: string;
  expectedCustomerIntents: string[];
  expectedStrategies: string[];
  pressureLevel: string;
  dialogueStage: string;
}

export interface DynamicSpeechRetrievalPlan {
  context: SpeechContext;
  focus:
    | 'opening_probe'
    | 'high_pressure_resistance'
    | 'tactical_probe'
    | 'closing_commitment'
    | 'generic_progress';
  limit: number;
  minimumScore: number;
  strictTake: number;
  fuzzyTake: number;
  fallbackTake: number;
  allowFallback: boolean;
  broadQualityThreshold: number;
  fuzzyTerms: string[];
  recentCustomerIntents: string[];
  recentStrategies: string[];
  reasons: string[];
}

export interface SpeechSampleScoreOptions {
  latestCollectorText?: string;
  fuzzyTerms?: string[];
  recentCustomerIntents?: string[];
  recentStrategies?: string[];
}

export interface ExtractedCustomerSpeechSample {
  collectorPrompt: string;
  customerLine: string;
  sanitizedCustomerLine: string;
  triggerAction: string;
  customerIntent: string;
  emotion: string;
  strategy: string;
  pressureLevel: string;
  dialogueStage: string;
  qualityScore: number;
  sourceTurnOrder: number | null;
}

interface SpeechSegment {
  role: SpeechRole;
  text: string;
  startTime: number | null;
  endTime: number | null;
  firstOrder: number;
  lastOrder: number;
}

const TRIGGER_ACTIONS = {
  customerFirst: '客户先开口',
  openingVerify: '开场核身',
  overdueReason: '询问逾期原因',
  repaymentTime: '要求明确还款时间',
  immediatePayment: '要求立即还款',
  repaymentAmount: '要求还款金额',
  installmentPlan: '提供分期方案',
  consequences: '强调后果',
  vehicleLocation: '核实车辆位置',
  assetIncome: '核实收入资产',
  challengeExcuse: '质疑客户借口',
  empathy: '共情安抚',
  commitmentSummary: '总结承诺',
  callClosing: '结束通话',
  midProgress: '中段推进',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').replace(/[“”]/g, '"').trim() : '';
}

function visibleLength(text: string): number {
  return text.replace(/[，。！？,.!?；;：:\s]/g, '').length;
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function anonymizeSensitiveText(input: string): string {
  return input
    .replace(/\b(1[3-9]\d)\d{4}(\d{4})\b/g, '$1****$2')
    .replace(/\b(\d{4})\d{8,11}(\d{4})\b/g, '$1************$2')
    .replace(/\b(\d{6})\d{8}(\d{3}[\dXx])\b/g, '$1********$2')
    .replace(
      /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/g,
      '某A*****',
    )
    .replace(/[一-龥]{2,4}(先生|女士|老师)/g, '某$1')
    .replace(/我叫[一-龥]{2,4}/g, '我叫某某')
    .replace(
      /[一-龥]{2,}(?:省|自治区|特别行政区)[一-龥]{2,}(?:市|自治州|地区)[一-龥0-9号栋单元室楼\-]*/g,
      'XX省XX市',
    )
    .replace(
      /[一-龥]{2,}(?:市|区|县|镇|路|街|小区|村|号楼|单元)[一-龥0-9号栋单元室楼\-]*/g,
      'XX省XX市',
    )
    .replace(/\d+(?:\.\d+)?\s*(?:万|千)?\s*(?:元|块钱|块)/g, 'XX元')
    .trim();
}

export function normalizeAsrPayload(value: unknown): {
  count: number;
  fullText: string;
  dialogueText: string;
  rawJson: unknown;
  turns: NormalizedSpeechTurn[];
} {
  if (!isRecord(value)) {
    throw new Error('ASR JSON 必须是对象');
  }

  if (typeof value.code === 'number' && value.code !== 200) {
    throw new Error(`ASR 状态异常：${value.message || value.code}`);
  }

  if (!Array.isArray(value.dialogue)) {
    throw new Error('ASR JSON 缺少 dialogue 数组');
  }

  const turns = value.dialogue
    .map((item, index): NormalizedSpeechTurn | null => {
      if (!isRecord(item)) return null;
      const speaker = item.speaker === 'customer' || item.speaker === 'agent' ? item.speaker : null;
      const text = anonymizeSensitiveText(normalizeText(item.text));
      if (!speaker || !text) return null;

      return {
        order: index + 1,
        speaker,
        role: speaker,
        text,
        startTime: numberOrNull(item.start),
        endTime: numberOrNull(item.end),
      };
    })
    .filter((item): item is NormalizedSpeechTurn => item !== null);

  if (turns.length === 0) {
    throw new Error('ASR JSON 中没有有效对话内容');
  }

  return {
    count: typeof value.count === 'number' ? value.count : turns.length,
    fullText: anonymizeSensitiveText(normalizeText(value.full_text)),
    dialogueText:
      typeof value.dialogue_text === 'string'
        ? anonymizeSensitiveText(value.dialogue_text.trim())
        : turns
            .map((turn) => `${turn.role === 'customer' ? '客户' : '催收员'}：${turn.text}`)
            .join('\n'),
    rawJson: value,
    turns,
  };
}

export function sanitizeSensitiveText(input: string): string {
  return input
    .replace(/1[3-9]\d{9}/g, '[手机号]')
    .replace(/\b\d{12,19}\b/g, '[银行卡号]')
    .replace(
      /\b\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
      '[身份证号]',
    )
    .replace(
      /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/g,
      '[车牌号]',
    )
    .replace(/[一-龥]{2,4}(先生|女士|老师|是吗|对吗)/g, '[姓名]$1')
    .replace(/我叫[一-龥]{2,4}/g, '我叫[姓名]')
    .replace(
      /[一-龥]{4,}(省|市|区|县|镇|路|街|小区|村|号楼|单元)[一-龥0-9号栋单元室楼\-]*/g,
      '[地址]',
    )
    .replace(/\d+(?:\.\d+)?\s*(?:万|千)?\s*(?:元|块钱|块)/g, '[金额]')
    .trim();
}

export function inferSpeechContextFromCollectorText(
  collectorText: string,
  fallbackStage = '中段推进',
): SpeechContext {
  const text = collectorText.trim();
  let triggerAction: string = TRIGGER_ACTIONS.midProgress;

  if (!text) {
    triggerAction = TRIGGER_ACTIONS.customerFirst;
  } else if (includesAny(text, [/本人|身份|身份证|是.{0,6}吗|哪位|确认.*信息/])) {
    triggerAction = TRIGGER_ACTIONS.openingVerify;
  } else if (includesAny(text, [/为什么|什么原因|怎么回事|逾期.*原因|原因/])) {
    triggerAction = TRIGGER_ACTIONS.overdueReason;
  } else if (
    includesAny(text, [/什么时候|哪天|具体.*时间|明确.*时间|还款时间|今天.*还|明天.*还/])
  ) {
    triggerAction = TRIGGER_ACTIONS.repaymentTime;
  } else if (
    includesAny(text, [
      /马上|立刻|现在.*处理|现在.*还|必须.*处理|必须.*还|一次性/,
      /逾期.*(?:没|未|没有).*处理/,
      /(?:没|未|没有).*处理.*逾期/,
      /逾期\d*\s*天/,
    ])
  ) {
    triggerAction = TRIGGER_ACTIONS.immediatePayment;
  } else if (includesAny(text, [/还多少|还款金额|金额|本金|利息|减免|欠款|账单/])) {
    triggerAction = TRIGGER_ACTIONS.repaymentAmount;
  } else if (includesAny(text, [/分期|方案|每月|多少期|协商方案/])) {
    triggerAction = TRIGGER_ACTIONS.installmentPlan;
  } else if (includesAny(text, [/征信|法务|起诉|拖车|上门|后果|黑名单|风险/])) {
    triggerAction = TRIGGER_ACTIONS.consequences;
  } else if (includesAny(text, [/车.*哪|车辆|车在|停哪|GPS|定位|拖车/])) {
    triggerAction = TRIGGER_ACTIONS.vehicleLocation;
  } else if (includesAny(text, [/收入|工资|流水|资产|房|店|生意|工作|经营/])) {
    triggerAction = TRIGGER_ACTIONS.assetIncome;
  } else if (includesAny(text, [/不对|不是|之前说|怎么又|你说的|借口|理由/])) {
    triggerAction = TRIGGER_ACTIONS.challengeExcuse;
  } else if (includesAny(text, [/理解|知道.*困难|帮你|协商|缓解|压力/])) {
    triggerAction = TRIGGER_ACTIONS.empathy;
  } else if (includesAny(text, [/承诺|确认一下|说好|记录|约定|总结/])) {
    triggerAction = TRIGGER_ACTIONS.commitmentSummary;
  } else if (includesAny(text, [/再见|先这样|挂了|结束|不打扰/])) {
    triggerAction = TRIGGER_ACTIONS.callClosing;
  }

  const pressureLevel = includesAny(text, [/必须|马上|立刻|不要再拖|最后|后果|法务|拖车|起诉/])
    ? '高'
    : includesAny(text, [/可以|方便|麻烦|了解|确认|协商|理解/])
      ? '低'
      : '中';

  return {
    triggerAction,
    pressureLevel,
    dialogueStage: triggerAction === TRIGGER_ACTIONS.openingVerify ? '开场' : fallbackStage,
    expectedCustomerIntents: expectedIntentsForTrigger(triggerAction),
    expectedStrategies: expectedStrategiesForTrigger(triggerAction),
  };
}

export function inferRuntimeSpeechContext(latestUserText: string, roundCount = 0): SpeechContext {
  const stage = roundCount <= 1 ? '开场' : roundCount >= 8 ? '收尾' : '中段推进';
  return inferSpeechContextFromCollectorText(latestUserText, stage);
}

function extractRetrievalTerms(text: string): string[] {
  const termGroups: Array<[string, RegExp[]]> = [
    ['核身', [/本人|身份|身份证|哪位|信息/]],
    ['逾期原因', [/为什么|什么原因|怎么回事|原因/]],
    ['还款时间', [/什么时候|哪天|今天|明天|月底|下周|还款时间|明确.*时间/]],
    ['立即处理', [/马上|立刻|现在|必须|一次性|处理/]],
    ['金额', [/金额|本金|利息|减免|欠款|账单|多少/]],
    ['分期', [/分期|方案|每月|多少期|协商/]],
    ['后果', [/征信|法务|起诉|拖车|上门|后果|黑名单|风险/]],
    ['车辆', [/车|车辆|停哪|GPS|定位|拖车/]],
    ['收入资产', [/收入|工资|流水|资产|房|店|生意|工作|经营/]],
    ['承诺', [/承诺|确认一下|说好|记录|约定|总结/]],
    ['结束', [/再见|先这样|挂了|结束|不打扰/]],
  ];

  return termGroups.filter(([, patterns]) => includesAny(text, patterns)).map(([term]) => term);
}

function countTermOverlap(left: string, right: string): number {
  const leftTerms = extractRetrievalTerms(left);
  if (leftTerms.length === 0) return 0;
  const rightTerms = new Set(extractRetrievalTerms(right));
  return leftTerms.filter((term) => rightTerms.has(term)).length;
}

function normalizeSearchText(text: string): string {
  return text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function ngrams(text: string, size: number): string[] {
  if (text.length < size) return [];
  const values: string[] = [];
  for (let index = 0; index <= text.length - size; index += 1) {
    values.push(text.slice(index, index + size));
  }
  return values;
}

export function buildSpeechFuzzySearchTerms(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];

  const domainTerms = [
    '身份证',
    '本人',
    '身份',
    '逾期原因',
    '逾期',
    '还款时间',
    '明确时间',
    '今天',
    '明天',
    '月底',
    '下周',
    '马上',
    '立刻',
    '一次性',
    '现在处理',
    '金额',
    '本金',
    '利息',
    '减免',
    '欠款',
    '账单',
    '分期',
    '方案',
    '协商',
    '征信',
    '法务',
    '起诉',
    '拖车',
    '上门',
    '后果',
    '风险',
    '车辆',
    '车款',
    '车现在',
    '停在哪里',
    '停哪',
    '定位',
    '收入',
    '工资',
    '流水',
    '资产',
    '工作',
    '经营',
    '承诺',
    '确认',
    '约定',
    '记录',
  ];
  const weakTerms = new Set(['现在', '处理', '这个', '一下', '可以', '需要', '麻烦', '后续']);
  const matchedDomainTerms = domainTerms.filter((term) => normalized.includes(term));
  const generatedTerms = [
    ...(normalized.length <= 8 ? [normalized] : []),
    ...ngrams(normalized, 4),
    ...ngrams(normalized, 3),
  ].filter((term) => !weakTerms.has(term) && !/^\d+$/.test(term));

  return uniqueValues([...matchedDomainTerms, ...generatedTerms]).slice(0, 10);
}

function scoreFuzzyTermOverlap(
  terms: string[],
  sample: {
    collectorPrompt?: string;
    customerLine?: string;
    sanitizedCustomerLine?: string;
  },
): number {
  if (terms.length === 0) return 0;

  let score = 0;
  for (const term of terms) {
    const termWeight = term.length >= 4 ? 5 : 3;
    if (sample.collectorPrompt?.includes(term)) score += termWeight;
    if (sample.customerLine?.includes(term)) score += Math.max(1, termWeight - 3);
    if (sample.sanitizedCustomerLine?.includes(term)) score += Math.max(1, termWeight - 3);
  }

  return Math.min(score, 18);
}

export function buildDynamicSpeechRetrievalPlan(input: {
  latestUserText: string;
  roundCount: number;
  recentAssistantTexts?: string[];
  maxLimit?: number;
}): DynamicSpeechRetrievalPlan {
  const context = inferRuntimeSpeechContext(input.latestUserText, input.roundCount);
  const text = input.latestUserText.trim();
  const fuzzyTerms = buildSpeechFuzzySearchTerms(text);
  const recentTexts = input.recentAssistantTexts?.slice(-4) || [];
  const recentCustomerIntents = uniqueValues(recentTexts.map(classifyCustomerIntent));
  const recentStrategies = uniqueValues(
    recentTexts.map((line) => classifyStrategy(line, classifyCustomerIntent(line))),
  );

  const reasons: string[] = [];
  const action = context.triggerAction;
  const isClosing =
    context.dialogueStage === '收尾' ||
    action === TRIGGER_ACTIONS.commitmentSummary ||
    action === TRIGGER_ACTIONS.callClosing;
  const isHighPressure =
    context.pressureLevel === '高' ||
    includesAny(text, [/必须|马上|立刻|最后|法务|起诉|拖车|后果/]);
  const tacticalActions = new Set<string>([
    TRIGGER_ACTIONS.overdueReason,
    TRIGGER_ACTIONS.repaymentTime,
    TRIGGER_ACTIONS.repaymentAmount,
    TRIGGER_ACTIONS.installmentPlan,
    TRIGGER_ACTIONS.vehicleLocation,
    TRIGGER_ACTIONS.assetIncome,
    TRIGGER_ACTIONS.challengeExcuse,
  ]);
  const isTacticalProbe = tacticalActions.has(action);

  let focus: DynamicSpeechRetrievalPlan['focus'] = 'generic_progress';
  let limit = 2;
  let minimumScore = 58;
  let strictTake = 120;
  let fuzzyTake = 80;
  let fallbackTake = 50;
  let allowFallback = true;
  let broadQualityThreshold = 86;

  if (input.roundCount <= 1) {
    focus = 'opening_probe';
    limit = 2;
    minimumScore = 60;
    strictTake = 80;
    fuzzyTake = 45;
    fallbackTake = 35;
    broadQualityThreshold = 90;
    reasons.push('opening_round');
  } else if (isClosing) {
    focus = 'closing_commitment';
    limit = 2;
    minimumScore = 62;
    strictTake = 80;
    fuzzyTake = 45;
    fallbackTake = 35;
    broadQualityThreshold = 88;
    reasons.push('closing_stage');
  } else if (isHighPressure) {
    focus = 'high_pressure_resistance';
    limit = 4;
    minimumScore = 52;
    strictTake = 160;
    fuzzyTake = 100;
    fallbackTake = 70;
    broadQualityThreshold = 78;
    reasons.push('high_pressure');
  } else if (isTacticalProbe) {
    focus = 'tactical_probe';
    limit = 3;
    minimumScore = 55;
    strictTake = 130;
    fuzzyTake = 85;
    fallbackTake = 55;
    broadQualityThreshold = 82;
    reasons.push('tactical_action');
  } else {
    reasons.push('generic_progress');
  }

  if (visibleLength(text) <= 6) {
    limit = Math.min(limit, 2);
    minimumScore += 4;
    strictTake = Math.min(strictTake, 80);
    fuzzyTake = Math.min(fuzzyTake, 45);
    reasons.push('short_latest_user_text');
  }

  if (fuzzyTerms.length > 0) {
    reasons.push('fuzzy_terms_available');
  }

  if (recentStrategies.length >= 3) {
    minimumScore += 2;
    reasons.push('avoid_recent_repetition');
  }

  const maxLimit = input.maxLimit ?? 4;
  limit = Math.max(1, Math.min(limit, maxLimit));

  return {
    context,
    focus,
    limit,
    minimumScore,
    strictTake,
    fuzzyTake,
    fallbackTake,
    allowFallback,
    broadQualityThreshold,
    fuzzyTerms,
    recentCustomerIntents,
    recentStrategies,
    reasons,
  };
}

function expectedIntentsForTrigger(triggerAction: string): string[] {
  switch (triggerAction) {
    case TRIGGER_ACTIONS.repaymentTime:
      return ['拖延还款', '模糊承诺', '哭穷解释'];
    case TRIGGER_ACTIONS.immediatePayment:
      return ['哭穷解释', '拖延还款', '模糊承诺', '情绪对抗', '拒绝方案'];
    case TRIGGER_ACTIONS.vehicleLocation:
      return ['回避关键问题', '提供线索', '转移话题'];
    case TRIGGER_ACTIONS.assetIncome:
      return ['哭穷解释', '提供线索', '回避关键问题'];
    case TRIGGER_ACTIONS.consequences:
      return ['情绪对抗', '质疑催收', '部分配合'];
    case TRIGGER_ACTIONS.installmentPlan:
      return ['确认方案', '拒绝方案', '讨价还价'];
    case TRIGGER_ACTIONS.empathy:
      return ['部分配合', '哭穷解释', '请求延期'];
    default:
      return ['一般回应', '拖延还款', '哭穷解释'];
  }
}

function expectedStrategiesForTrigger(triggerAction: string): string[] {
  switch (triggerAction) {
    case TRIGGER_ACTIONS.repaymentTime:
      return ['给模糊承诺', '拖延', '承认但无行动'];
    case TRIGGER_ACTIONS.immediatePayment:
      return ['哭穷', '拖延', '给模糊承诺', '情绪施压'];
    case TRIGGER_ACTIONS.vehicleLocation:
      return ['回避关键问题', '装糊涂', '短暂配合'];
    case TRIGGER_ACTIONS.consequences:
      return ['反问质疑', '情绪施压', '短暂配合'];
    case TRIGGER_ACTIONS.installmentPlan:
      return ['讨价还价', '短暂配合', '拖延'];
    default:
      return ['拖延', '哭穷', '回避关键问题'];
  }
}

function classifyCustomerIntent(customerLine: string): string {
  if (includesAny(customerLine, [/别打|不接|没空|烦|不要联系|挂了/])) return '拒绝沟通';
  if (includesAny(customerLine, [/等等|过几天|晚点|宽限|缓缓|月底|下周|明天|到账/]))
    return '拖延还款';
  if (includesAny(customerLine, [/没钱|困难|周转|工资|失业|生意|孩子|医院|病|拿不出来|还不起/]))
    return '哭穷解释';
  if (includesAny(customerLine, [/有钱就|到账就|尽快|想办法|看看|处理|说不好|不确定/]))
    return '模糊承诺';
  if (includesAny(customerLine, [/凭什么|随便|投诉|吓唬|别逼|你们.*太/])) return '情绪对抗';
  if (includesAny(customerLine, [/为什么|怎么|不是说|利息|合法么|合同|费用/])) return '质疑催收';
  if (includesAny(customerLine, [/同意|按这个|分期|方案|可以这样/])) return '确认方案';
  if (includesAny(customerLine, [/可以|我知道|会还|配合|嗯|行|好的/])) return '部分配合';
  if (includesAny(customerLine, [/车在|地址|工资|收入|老板|公司|店里/])) return '提供线索';
  return '一般回应';
}

function classifyStrategy(customerLine: string, intent: string): string {
  if (intent === '哭穷解释') return '哭穷';
  if (intent === '拖延还款') return '拖延';
  if (intent === '模糊承诺') return '给模糊承诺';
  if (intent === '情绪对抗') return '情绪施压';
  if (intent === '质疑催收') return '反问质疑';
  if (intent === '确认方案') return '短暂配合';
  if (includesAny(customerLine, [/不知道|不清楚|忘了|没看|谁知道/])) return '装糊涂';
  if (includesAny(customerLine, [/这个先不说|别问这个|到时候|再看/])) return '回避关键问题';
  if (includesAny(customerLine, [/少点|减免|能不能低点|分少点/])) return '讨价还价';
  return '一般回应';
}

function classifyEmotion(customerLine: string): string {
  if (includesAny(customerLine, [/烦|别逼|投诉|随便|爱咋|凭什么/])) return '愤怒';
  if (includesAny(customerLine, [/真的没办法|不容易|孩子|医院|压力|困难/])) return '委屈';
  if (includesAny(customerLine, [/怕|担心|怎么办|着急|焦虑/])) return '焦虑';
  if (includesAny(customerLine, [/嗯|哦|知道了|再说|看看/])) return '敷衍';
  if (includesAny(customerLine, [/不是不还|我也想|没法保证|说不好/])) return '防御';
  if (includesAny(customerLine, [/可以|好的|我配合|没问题/])) return '配合';
  return '平静';
}

function scoreSampleQuality(
  collectorPrompt: string,
  customerLine: string,
  labels: Pick<ExtractedCustomerSpeechSample, 'customerIntent' | 'strategy'>,
): number {
  const length = visibleLength(customerLine);
  let score = 35;
  if (collectorPrompt) score += 15;
  if (length >= 8) score += 15;
  if (length >= 16) score += 10;
  if (length > 80) score -= 10;
  if (labels.customerIntent !== '一般回应') score += 15;
  if (labels.strategy !== '一般回应') score += 10;
  if (/^(喂|嗯|哦|好|行|知道了|不是)$/u.test(customerLine.trim())) score -= 35;
  return Math.max(0, Math.min(100, score));
}

function mergeTurns(turns: NormalizedSpeechTurn[]): SpeechSegment[] {
  const segments: SpeechSegment[] = [];

  for (const turn of turns) {
    const previous = segments[segments.length - 1];
    if (previous && previous.role === turn.role) {
      previous.text = `${previous.text}${/[。！？!?]$/.test(previous.text) ? '' : '。'}${turn.text}`;
      previous.endTime = turn.endTime ?? previous.endTime;
      previous.lastOrder = turn.order;
      continue;
    }

    segments.push({
      role: turn.role,
      text: turn.text,
      startTime: turn.startTime,
      endTime: turn.endTime,
      firstOrder: turn.order,
      lastOrder: turn.order,
    });
  }

  return segments;
}

export function extractCustomerSpeechSamplesFromTurns(
  turns: NormalizedSpeechTurn[],
): ExtractedCustomerSpeechSample[] {
  const segments = mergeTurns(turns);
  const samples: ExtractedCustomerSpeechSample[] = [];
  let lastAgentSegment: SpeechSegment | null = null;

  segments.forEach((segment, index) => {
    if (segment.role === 'agent') {
      lastAgentSegment = segment;
      return;
    }

    const collectorPrompt = lastAgentSegment?.text || '';
    const customerLine = segment.text;
    if (visibleLength(customerLine) < 6) return;

    const context = inferSpeechContextFromCollectorText(
      collectorPrompt,
      index <= 2 ? '开场' : index >= segments.length - 3 ? '收尾' : '中段推进',
    );
    const customerIntent = classifyCustomerIntent(customerLine);
    const strategy = classifyStrategy(customerLine, customerIntent);
    const emotion = classifyEmotion(customerLine);
    const qualityScore = scoreSampleQuality(collectorPrompt, customerLine, {
      customerIntent,
      strategy,
    });

    if (qualityScore < 45) return;

    samples.push({
      collectorPrompt,
      customerLine,
      sanitizedCustomerLine: sanitizeSensitiveText(customerLine),
      triggerAction: context.triggerAction,
      customerIntent,
      emotion,
      strategy,
      pressureLevel: context.pressureLevel,
      dialogueStage: context.dialogueStage,
      qualityScore,
      sourceTurnOrder: segment.firstOrder,
    });
  });

  return samples;
}

export function scoreSpeechSampleForContext(
  sample: {
    collectorPrompt?: string;
    customerLine?: string;
    sanitizedCustomerLine?: string;
    triggerAction: string;
    customerIntent: string;
    strategy: string;
    emotion: string;
    pressureLevel: string;
    dialogueStage: string;
    qualityScore: number;
    usageCount: number;
    lastUsedAt: Date | string | null;
  },
  context: SpeechContext,
  options: SpeechSampleScoreOptions = {},
): number {
  let score = 30;
  if (sample.triggerAction === context.triggerAction) score += 25;
  if (context.expectedCustomerIntents.includes(sample.customerIntent)) score += 20;
  if (context.expectedStrategies.includes(sample.strategy)) score += 15;
  if (sample.pressureLevel === context.pressureLevel) score += 10;
  if (sample.dialogueStage === context.dialogueStage) score += 5;
  if (sample.emotion === '防御' && context.pressureLevel === '高') score += 5;
  if (options.latestCollectorText && sample.collectorPrompt) {
    score += Math.min(
      countTermOverlap(options.latestCollectorText, sample.collectorPrompt) * 4,
      12,
    );
  }
  if (options.fuzzyTerms) {
    score += scoreFuzzyTermOverlap(options.fuzzyTerms, sample);
  }
  if (options.recentCustomerIntents?.includes(sample.customerIntent)) score -= 6;
  if (options.recentStrategies?.includes(sample.strategy)) score -= 4;
  score += Math.min(Math.max(sample.qualityScore, 0), 100) / 10;
  score -= Math.min(sample.usageCount, 8) * 1.5;

  if (sample.lastUsedAt) {
    const usedAt = new Date(sample.lastUsedAt).getTime();
    if (!Number.isNaN(usedAt) && Date.now() - usedAt < 10 * 60 * 1000) score -= 12;
  }

  return score;
}

export function buildRealSpeechReferencePrompt(input: {
  context: SpeechContext;
  samples: Array<{
    collectorPrompt: string;
    sanitizedCustomerLine: string;
    customerIntent: string;
    strategy: string;
    emotion: string;
  }>;
  profile?: {
    summary?: string | null;
    tone?: string | null;
    rhythm?: string | null;
    commonPhrases?: unknown;
    objectionPatterns?: unknown;
    forbiddenStyle?: unknown;
  } | null;
}): string {
  if (input.samples.length === 0 && !input.profile) return '';

  const profileLines: string[] = [];
  if (input.profile?.summary) profileLines.push(`风格摘要：${input.profile.summary}`);
  if (input.profile?.tone) profileLines.push(`语气：${input.profile.tone}`);
  if (input.profile?.rhythm) profileLines.push(`句式节奏：${input.profile.rhythm}`);
  if (Array.isArray(input.profile?.commonPhrases) && input.profile.commonPhrases.length > 0) {
    profileLines.push(`常用表达：${input.profile.commonPhrases.join('、')}`);
  }
  if (
    Array.isArray(input.profile?.objectionPatterns) &&
    input.profile.objectionPatterns.length > 0
  ) {
    profileLines.push(`常见抗拒套路：${input.profile.objectionPatterns.join('、')}`);
  }
  if (Array.isArray(input.profile?.forbiddenStyle) && input.profile.forbiddenStyle.length > 0) {
    profileLines.push(`禁止风格：${input.profile.forbiddenStyle.join('、')}`);
  }

  const sampleLines = input.samples
    .map(
      (sample, index) =>
        `${index + 1}. 催收员："${sample.collectorPrompt || '客户主动开口'}"\n   客户："${sample.sanitizedCustomerLine}"\n   特征：${sample.customerIntent} / ${sample.strategy} / ${sample.emotion}`,
    )
    .join('\n');

  return `

## 真实客户话术增强（本轮参考）
当前催收动作：${input.context.triggerAction}
客户可呈现：${input.context.expectedCustomerIntents.join('、')}
${profileLines.length > 0 ? `\n角色话术画像：\n${profileLines.map((line) => `- ${line}`).join('\n')}` : ''}
${sampleLines ? `\n本轮命中的真实客户话术样本：\n${sampleLines}` : ''}

模仿规则：
1. 只模仿真实样本的语气、口径、句式和抗拒方式，不要逐字复读。
2. 当前角色是客户，只能以客户身份回应，不要扮演催收员。
3. 每轮最多借鉴一种主要抗拒方式，避免堆砌多个样本。
4. 不要提到"样本"、"话术库"、"系统检索"等幕后信息。`;
}
