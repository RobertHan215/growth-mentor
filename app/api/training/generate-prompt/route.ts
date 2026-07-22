import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { prisma } from '@/lib/db';
import { getOneOnOneGlobalConfig } from '@/lib/server/one-on-one-config';
import {
  getEnabledPromptDimensions,
  getRoleGenerationConfigSignature,
} from '@/lib/training/one-on-one-config';
import {
  getCharacterTemplatePersonalityOptions,
  getStageTemplateTagIds,
  templateHasAnyTag,
} from '@/lib/training/character-template-selection';

type CharacterTemplateForRole = {
  id: string;
  name: string;
  description?: string | null;
  personalityType?: string | null;
  profile: unknown;
  dimensions: unknown;
  tagIds?: unknown;
};

type TemplateDimension = {
  id: string;
  label: string;
  content: string;
  order: number;
  enabled: boolean;
};

function normalizeOpeningPolicy(config: Record<string, unknown>): Record<string, unknown> {
  const templateOptions = Array.isArray(config.templateOptions)
    ? config.templateOptions.map((option) =>
        option && typeof option === 'object'
          ? { ...(option as Record<string, unknown>), aiFirstMessage: '' }
          : option,
      )
    : config.templateOptions;

  return {
    ...config,
    templateOptions,
    whoSpeaksFirst: 'user',
    aiFirstMessage: '',
  };
}

function buildCharacterRoleConfig(
  template: CharacterTemplateForRole,
  sceneTitle: string,
  enabledDimensions: ReturnType<typeof getEnabledPromptDimensions>,
) {
  const profile = (template.profile as Record<string, unknown>) || {};
  const templateDimensions = (template.dimensions as TemplateDimension[]) || [];

  return {
    background: `围绕「${sceneTitle}」进行催收一对一对练。使用角色模板：${template.name}`,
    userRole: {
      name: '催收专员',
      description: `负责按照课程要求推进${sceneTitle}相关沟通的真人学员`,
    },
    aiRole: {
      name: (profile.name as string) || template.name || '客户',
      description: template.description || `${template.name}的客户`,
      persona: {
        age: profile.age,
        gender: profile.gender,
        occupation: profile.occupation,
        monthlyIncome: profile.monthlyIncome,
        monthlyPayment: profile.monthlyPayment,
        totalInstallments: profile.totalInstallments,
        paidInstallments: profile.paidInstallments,
        customerSituation: profile.customerSituation,
        debtAmount: profile.debtAmount,
        debtDays: profile.debtDays,
        debtReason: profile.debtReason,
        familyStatus: profile.familyStatus,
        personalityType: template.personalityType,
        behaviorTraits: '',
        catchphrases: profile.catchphrases,
        closingPrompt: profile.closingPrompt,
        promptDimensions: templateDimensions,
      },
    },
    whoSpeaksFirst: 'user' as const,
    aiFirstMessage: '',
    scoringDimensions:
      templateDimensions.length > 0
        ? templateDimensions.map((dimension) => ({
            id: dimension.id,
            name: dimension.label,
            weight: 1 / templateDimensions.length,
            description: dimension.content || dimension.label,
          }))
        : enabledDimensions.map((dimension) => ({
            id: dimension.id,
            name: dimension.label,
            weight: 1 / (enabledDimensions.length || 1),
            description: dimension.description,
          })),
    knowledgePoints: [],
  };
}

/**
 * POST /api/training/generate-prompt
 *
 * Auto-generates recommended roles for one-on-one training based on scene content.
 * Returns structured role data for the TrainingConfigModal.
 */
export async function POST(req: NextRequest) {
  try {
    const { sceneTitle, sceneContent, courseName, stageId, force } = (await req.json()) as {
      sceneTitle: string;
      sceneContent: string;
      courseName?: string;
      stageId?: string;
      force?: boolean;
    };

    if (!sceneTitle || !sceneContent) {
      return NextResponse.json({ error: 'Missing sceneTitle or sceneContent' }, { status: 400 });
    }

    const globalConfig = await getOneOnOneGlobalConfig();
    const roleConfigSignature = getRoleGenerationConfigSignature(globalConfig);
    const enabledDimensions = getEnabledPromptDimensions(globalConfig);

    // ── Resolve character templates (multi-role carousel) ──
    // Priority: explicit IDs → stage/oneOnOne tags → collection-scene fallback → cache
    const COLLECTION_KEYWORDS = ['催收', '逾期', '还款', '账款', '借款', '债务', '催款', '欠款', '电催'];
    const sceneTextForMatch = `${sceneTitle} ${sceneContent}`;
    const isCollectionSceneEarly = COLLECTION_KEYWORDS.some((kw) => sceneTextForMatch.includes(kw));

    let characterTemplates: CharacterTemplateForRole[] = [];
    let cachedRoles: Record<string, unknown> | null = null;
    if (stageId) {
      try {
        const stage = await prisma.stage.findUnique({
          where: { id: stageId },
          select: {
            directorConfig: true,
            oneOnOneTagId: true,
            characterTemplateIds: true,
            stageTags: { select: { tagId: true } },
          },
        });

        const rawCached = (stage?.directorConfig as Record<string, unknown> | null)?.oneOnOneRoles;
        if (rawCached && typeof rawCached === 'object') {
          cachedRoles = rawCached as Record<string, unknown>;
        }

        // 1) Explicit template IDs on the stage
        if (stage?.characterTemplateIds) {
          try {
            const templateIds = JSON.parse(stage.characterTemplateIds) as string[];
            if (templateIds.length > 0) {
              characterTemplates = await prisma.aiCharacterTemplate.findMany({
                where: { id: { in: templateIds } },
              });
            }
          } catch {
            // ignore parse error
          }
        }

        // 2) Match by oneOnOneTagId / course tags
        const stageTemplateTagIds = getStageTemplateTagIds(stage);
        if (characterTemplates.length === 0 && stageTemplateTagIds.length > 0) {
          const allTemplates = await prisma.aiCharacterTemplate.findMany();
          characterTemplates = allTemplates.filter((template) =>
            templateHasAnyTag(template, stageTemplateTagIds),
          );
        }

        // 3) Collection scene without tags: still surface all character templates
        //    (same multi-role carousel as tagged 催收 courses)
        if (characterTemplates.length === 0 && isCollectionSceneEarly) {
          characterTemplates = await prisma.aiCharacterTemplate.findMany();
        }

        // 4) Cache hit only when we have no templates AND cache already has multi options
        //    (never prefer a single-role LLM cache over real templates)
        if (characterTemplates.length === 0 && !force && cachedRoles) {
          const cachedOptions = cachedRoles.templateOptions;
          const hasMulti =
            Array.isArray(cachedOptions) && cachedOptions.length > 1;
          if (
            hasMulti &&
            cachedRoles.globalConfigSignature === roleConfigSignature
          ) {
            const normalizedCached = normalizeOpeningPolicy(cachedRoles);
            return NextResponse.json({
              success: true,
              ...normalizedCached,
              globalConfig,
            });
          }
        }
      } catch {
        // Cache miss, continue to generate
      }
    } else if (isCollectionSceneEarly) {
      // No stageId (rare) — still load templates for collection scenes
      try {
        characterTemplates = await prisma.aiCharacterTemplate.findMany();
      } catch {
        /* ignore */
      }
    }

    // ── If we have character templates, use them directly (no LLM / API key needed) ──
    if (characterTemplates.length > 0) {
      // Randomly select one template from the available ones
      const selectedIndex = Math.floor(Math.random() * characterTemplates.length);
      const template = characterTemplates[selectedIndex];
      const characterRoleConfig = buildCharacterRoleConfig(template, sceneTitle, enabledDimensions);
      const templatePersonalityOptions = getCharacterTemplatePersonalityOptions(characterTemplates);
      const templateOptions = characterTemplates.map((item, index) => {
        const optionRoleConfig =
          index === selectedIndex
            ? characterRoleConfig
            : buildCharacterRoleConfig(item, sceneTitle, enabledDimensions);
        const personalityOption = templatePersonalityOptions[index];

        return {
          ...personalityOption,
          aiRole: optionRoleConfig.aiRole,
          background: optionRoleConfig.background,
          aiFirstMessage: optionRoleConfig.aiFirstMessage,
          scoringDimensions: optionRoleConfig.scoringDimensions,
          knowledgePoints: optionRoleConfig.knowledgePoints,
        };
      });

      const roleConfig = JSON.parse(
        JSON.stringify(
          normalizeOpeningPolicy({
            ...characterRoleConfig,
            selectedTemplateId: template.id,
            templateOptions,
            globalConfig,
            globalConfigSignature: roleConfigSignature,
          }),
        ),
      ) as Prisma.InputJsonObject;

      // Cache the result
      if (stageId) {
        try {
          const stageData = await prisma.stage.findUnique({
            where: { id: stageId },
            select: { directorConfig: true },
          });
          const existingConfig = (stageData?.directorConfig as Record<string, unknown>) || {};
          await prisma.stage.update({
            where: { id: stageId },
            data: {
              directorConfig: {
                ...existingConfig,
                oneOnOneRoles: roleConfig,
              },
            },
          });
        } catch (cacheErr) {
          console.warn('[generate-prompt] Failed to cache character template:', cacheErr);
        }
      }

      return NextResponse.json({
        success: true,
        ...roleConfig,
        globalConfig,
      });
    }

    // ── LLM fallback (only when no character templates) ──
    // Also prefer multi-role cache here if signature drifted but options exist
    if (!force && cachedRoles) {
      const cachedOptions = cachedRoles.templateOptions;
      if (Array.isArray(cachedOptions) && cachedOptions.length > 1) {
        return NextResponse.json({
          success: true,
          ...normalizeOpeningPolicy(cachedRoles),
          globalConfig,
        });
      }
    }

    const { model } = await resolveModelFromHeaders(req);

    // ── Detect collection scenario (reuse early match) ──
    const isCollectionScene = isCollectionSceneEarly;
    const dimensionJsonSpec = enabledDimensions
      .map(
        (dimension) =>
          `        { "id": ${JSON.stringify(dimension.id)}, "label": ${JSON.stringify(dimension.label)}, "content": ${JSON.stringify(dimension.prompt)} }`,
      )
      .join(',\n');

    const personaFieldSpec = isCollectionScene
      ? `,
  "aiRole": {
    "name": ${JSON.stringify(`AI扮演的${globalConfig.aiRole.name}姓名（真实中文姓名，如：张建国）`)},
    "description": ${JSON.stringify(globalConfig.aiRole.description)},
    "persona": {
      "age": 35,
      "gender": "男/女",
      "occupation": "职业（如：个体经营者、工厂工人、外卖骑手）",
      "monthlyIncome": 3000,
      "monthlyPayment": 2300,
      "totalInstallments": 36,
      "paidInstallments": 18,
      "customerSituation": "客户情况（如：资方、担保主体、月供、逾期天数、融资期数、已还期数、历史逾期记录）",
      "debtAmount": 15000,
      "debtDays": 45,
      "debtReason": "借款原因（如：生意亏损、医疗支出、子女教育）",
      "familyStatus": "家庭状况（如：已婚，两个孩子在上学，父母需要赡养）",
      "personalityType": "性格类型（如：老油条型、哭穷型、情绪激动型、配合但无力型）",
      "behaviorTraits": "惯用推脱话术（如：你们随便，我真没钱；下周肯定还）",
      "catchphrases": "还款口头禅（如：我现在没钱；你们看着办；就不还能怎样）",
      "closingPrompt": "结束提示词（如：我去想办法，我需要两天时间，两天后肯定处理）",
      "promptDimensions": [
${dimensionJsonSpec || '        { "id": "roleDetail", "label": "角色情况", "content": "生成一条具体角色设定。" }'}
      ]
    }
  }`
      : `,
  "aiRole": {
    "name": "AI扮演的角色名称",
    "description": "角色描述（1句话）"
  }`;

    const result = await callLLM(
      {
        model,
        system: `你是一个教学设计专家。根据提供的课程章节内容，推荐一对一对练的角色设定和评估维度。

⚠️ 重要角色定义规则：
- "userRole"：是指操作电脑的真人用户。用户通常扮演需要练习技能的角色（如催收专员、销售顾问、客服人员、老师等主动方）
- "aiRole"：是指 AI 机器人。AI通常扮演对话的对象（如逾期客户、意向客户、投诉用户、学生等被动方）
- 例如：催收培训课程 → userRole=催收专员（真人练习催收技巧），aiRole=逾期客户（AI模拟客户反应）
- 例如：销售培训课程 → userRole=销售顾问（真人练习销售话术），aiRole=犹豫客户（AI模拟客户）

AI 角色全局配置：
- 默认 AI 角色：${globalConfig.aiRole.name}
- 角色描述：${globalConfig.aiRole.description}
- 如果是催收类场景，persona.promptDimensions 必须严格使用后台配置的维度 id 和 label，只生成每个维度的具体 content。
- 当前启用维度：
${enabledDimensions.map((dimension) => `  - ${dimension.label}（${dimension.id}）：${dimension.prompt}`).join('\n') || '  - 未配置'}

评估维度：
- 根据课程具体内容生成 3-5 个贴合业务的评估维度
- 每个维度要有 id、name、weight（权重合计为1）、description
- 维度应该针对用户的表现（因为用户是被评估的人）

知识点提取：
- 从课程内容中提取 5-12 个知识点
- 每个知识点包含 id（kp1, kp2...）、name、priority、description
- priority="core"：核心知识点，用户必须能正确回答相关问题才算掌握（约占 40-60%）
- priority="minor"：辅助知识点，对话中提及即可

客户情况与收尾：
- 催收类场景必须生成合理的 monthlyPayment、totalInstallments、paidInstallments，用于描述月供、总期数和已还期数
- 催收类场景可以生成 catchphrases，用于描述客户一谈到还钱时经常脱口而出的固定表达；这些表达必须贴合性格类型，不要写成坐席话术
- 催收类场景必须生成 closingPrompt，作为客户在沟通收尾阶段可能给出的处理承诺或拖延话术，例如“我去想办法，我需要两天时间，两天后肯定处理”

输出严格 JSON 格式，不要包含任何其他文本。`,
        prompt: `课程名称：${courseName || '未知'}
章节标题：${sceneTitle}
章节内容：
${sceneContent}

请推荐对练角色和评估维度。返回 JSON，结构如下：
{
  "background": "对练场景背景描述（1-2句话）",
  "userRole": {
    "name": "用户（真人）扮演的角色名称",
    "description": "角色描述（1句话）"
  }${personaFieldSpec},
  "whoSpeaksFirst": "固定返回 user",
  "aiFirstMessage": "固定返回空字符串",
  "scoringDimensions": [
    { "id": "dim1", "name": "维度名", "weight": 0.25, "description": "评估标准描述" }
  ],
  "knowledgePoints": [
    { "id": "kp1", "name": "知识点名", "priority": "core 或 minor", "description": "一句话说明" }
  ]
}`,
        temperature: 0.8,
      },
      'training-generate-prompt',
    );

    // Parse the JSON from the LLM response
    const responseText = typeof result.text === 'string' ? result.text : '';
    let roleConfig;
    try {
      const jsonMatch =
        responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        roleConfig = JSON.parse(jsonMatch[1].trim());
      } else {
        roleConfig = JSON.parse(responseText.trim());
      }
    } catch {
      console.error('Failed to parse LLM response as JSON:', responseText);
      // Fallback config
      roleConfig = isCollectionScene
        ? {
            background: `围绕「${sceneTitle}」进行催收一对一对练。`,
            userRole: {
              name: '催收专员',
              description: `负责按照课程要求推进${sceneTitle}相关沟通的真人学员`,
            },
            aiRole: {
              name: '张建国',
              description: globalConfig.aiRole.description,
              persona: {
                age: 38,
                gender: '男',
                occupation: '个体经营者',
                monthlyIncome: 5000,
                monthlyPayment: 2300,
                totalInstallments: 36,
                paidInstallments: 18,
                customerSituation: '月供2300元，共36期，已还18期，当前逾期45天',
                debtAmount: 18000,
                debtDays: 45,
                debtReason: '经营周转困难',
                familyStatus: '已婚，家庭支出压力较大',
                personalityType: '拖延观望型',
                behaviorTraits: '先表达困难，再反复要求宽限几天',
                catchphrases: '我现在确实没钱；你们再给我几天；我又不是不还',
                closingPrompt: '我去想办法，我需要两天时间，两天后肯定处理。',
                promptDimensions: enabledDimensions.map((dimension) => ({
                  id: dimension.id,
                  label: dimension.label,
                  content: dimension.description || dimension.prompt,
                })),
              },
            },
            whoSpeaksFirst: 'user',
            aiFirstMessage: '',
          }
        : {
            background: `你正在学习「${sceneTitle}」的相关知识。`,
            userRole: {
              name: '老师',
              description: `负责讲解${sceneTitle}核心知识的老师`,
            },
            aiRole: {
              name: '学生',
              description: `正在学习${sceneTitle}的学生，对这个主题有一些基础了解`,
            },
            whoSpeaksFirst: 'user',
            aiFirstMessage: '',
          };
    }

    roleConfig = normalizeOpeningPolicy({
      ...roleConfig,
      globalConfig,
      globalConfigSignature: roleConfigSignature,
    }) as Prisma.InputJsonObject;

    // ── Save to cache ──
    if (stageId) {
      try {
        const stageData = await prisma.stage.findUnique({
          where: { id: stageId },
          select: { directorConfig: true },
        });
        const existingConfig = (stageData?.directorConfig as Record<string, unknown>) || {};
        await prisma.stage.update({
          where: { id: stageId },
          data: {
            directorConfig: {
              ...existingConfig,
              oneOnOneRoles: roleConfig,
            },
          },
        });
      } catch (cacheErr) {
        console.warn('[generate-prompt] Failed to cache:', cacheErr);
      }
    }

    return NextResponse.json({
      success: true,
      ...roleConfig,
      globalConfig,
    });
  } catch (error) {
    console.error('Generate prompt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate prompt' },
      { status: 500 },
    );
  }
}
