import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelWithDefaults } from '@/lib/server/resolve-model';

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session as { user?: { role?: string } } | null)?.user?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI 生成角色档案失败';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { name, description, personalityType } = await req.json();

    const { model } = await resolveModelWithDefaults({});

    const result = await callLLM(
      {
        model,
        system: `你是一个资深催收业务培训专家和教学设计专家。请根据提供的一对一对练角色信息，为该角色推荐并生成一个详细、合理且真实的人物档案（包含借款原因）。

人物档案字段必须符合以下格式和类型：
- age: 数字，年龄。
- gender: 字符串，性别（男/女）。
- occupation: 字符串，职业（如：个体经营者、外卖骑手、货车司机、无业等）。
- monthlyIncome: 数字，月收入（元）。
- monthlyPayment: 数字，月供金额（元）。
- totalInstallments: 数字，贷款总期数。
- paidInstallments: 数字，已经偿还期数，必须小于或等于 totalInstallments。
- customerSituation: 字符串，客户合同与逾期情况摘要，包含资方、担保主体、月供、逾期天数、融资期数、已还期数、累计逾期等信息（如果已知）。
- debtAmount: 数字，逾期欠款金额（元）。
- debtDays: 数字，逾期天数。
- familyStatus: 字符串，家庭状况（如：已婚有两子、离异独居、父母重病等）。
- debtReason: 字符串，借款原因/逾期原因（例如：生意失败、医疗支出、突发变故等）。
- catchphrases: 字符串，客户一谈到还钱时经常脱口而出的口头禅或固定短句，可用分号分隔多条（例如：我现在没钱；你们看着办；就不还能怎样）。
- closingPrompt: 字符串，客户在对练收尾阶段可能给出的处理承诺或拖延话术（例如：我去想办法，我需要两天时间，两天后肯定处理）。

请确保生成的内容与该角色的名字、基本描述和性格类型高度吻合，且符合真实的逾期催收业务场景。
输出必须为严格的 JSON 格式，不要包含任何 Markdown 代码块包裹（如 \`\`\`json）或多余的解释文字。`,
        prompt: `角色基本信息：
- 姓名/名称: ${name || '匿名客户'}
- 基本描述: ${description || '未填写描述'}
- 性格分类/标签: ${personalityType || '普通型'}

请为这个角色生成一个合理的人物档案 JSON，格式如下：
{
  "age": 35,
  "gender": "男",
  "occupation": "外卖骑手",
  "monthlyIncome": 4500,
  "monthlyPayment": 2300,
  "totalInstallments": 36,
  "paidInstallments": 18,
  "customerSituation": "月供2300元，融资36期，已还18期，当前逾期30天。",
  "debtAmount": 12000,
  "debtDays": 30,
  "familyStatus": "已婚，有两个孩子上小学，妻子无固定工作",
  "debtReason": "孩子开学需要交学费，且上月电瓶车损坏更换花销较大，导致暂无力还款",
  "catchphrases": "我现在真没钱；你们再宽限几天；我也不是不还",
  "closingPrompt": "我去想办法，我需要两天时间，两天后肯定处理。"
}`,
        temperature: 0.8,
      },
      'admin-generate-character-profile',
    );

    const responseText = typeof result.text === 'string' ? result.text : '';
    let profileData: unknown;
    try {
      const jsonMatch =
        responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        profileData = JSON.parse(jsonMatch[1].trim());
      } else {
        profileData = JSON.parse(responseText.trim());
      }
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', responseText, e);
      throw new Error('AI 生成的数据格式错误，无法解析为 JSON');
    }

    return NextResponse.json(profileData);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
