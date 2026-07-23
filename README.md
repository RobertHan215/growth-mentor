# 成长大师兄

**参赛项目** · AI 对练场

和多智能体一起练表达、练思维、练实战：圆桌讨论、导师追问、攻防辩论、测验回炉。不是单向听课，是被点名、被追问、被压测。

## 参赛定位

| 能力 | 说明 |
|------|------|
| 圆桌对练 | 多角色围坐，主动开辩，你可插话或被点名 |
| 导师追问 | 大师兄带节奏，讲不清就继续压 |
| 攻防表达 | 质疑者 / 杠精考官抬杠，练立论与反驳 |
| 场景生成 | 输入对练主题 → 自动组局（角色 + 幻灯片/测验等） |
| 语音白板 | TTS 讲解 + 共享白板，边说边画 |

默认角色：**成长大师兄**、陪练助教、气氛组、追问官、复盘官、杠精考官。

## 快速启动

**环境：** Node.js ≥ 20 · pnpm ≥ 10 · Docker（本地 MySQL，可选）

```bash
git clone https://github.com/RobertHan215/growth-mentor.git
cd growth-mentor
pnpm install
cp .env.example .env.local
```

### 1. 配置模型（`.env.local`）

推荐统一走 **阿里云百炼（DashScope）**。在 [百炼控制台](https://bailian.console.aliyun.com/) 创建 API Key 后写入：

```env
# 一把百炼 Key 即可：LLM（qwen3.7-plus 等）+ TTS + ASR 都会用它
QWEN_API_KEY=sk-...
DEFAULT_MODEL=qwen:qwen3.7-plus

# 可选覆盖（不填则自动回退到 QWEN_API_KEY）
# TTS_QWEN_API_KEY=
# ASR_QWEN_API_KEY=
```

也可用其他厂商（`OPENAI_*` / `ANTHROPIC_*` / `GOOGLE_*` 等），见 `.env.example`。

**配置落点说明：**

| 项 | 位置 |
|----|------|
| API Key / Base URL / 默认 LLM | `.env.local`（从 `.env.example` 复制） |
| LLM 模型列表（UI 可选） | `lib/ai/providers.ts` → `qwen.models` |
| TTS 模型名 | `lib/audio/tts-providers.ts` → `qwen3-tts-flash` |
| ASR 模型名 | `lib/audio/asr-providers.ts` → `qwen3-asr-flash` |
| 运行时默认供应商（管理端） | DB `system_configs.default_provider_config` |

### 2. 启动

仅前端（无本地库能力时）：

```bash
pnpm dev
```

本地完整链路（MySQL + 开发服）：

```bash
pnpm dev:local
# 等价于：docker compose up -d mysql && next dev
```

浏览器打开 http://localhost:3000

1. 输入对练主题（如：`模拟产品评审，说服 PM 通过这个功能`）
2. 点 **生成对练**
3. 进入场景后参与圆桌对话

### 3. 生产构建

```bash
pnpm build && pnpm start
# 或
docker compose up --build
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发服务器 |
| `pnpm dev:local` | 拉起本地 MySQL 并启动 dev |
| `pnpm db:up` / `pnpm db:down` | 启停本地 MySQL |
| `pnpm db:dump` / `pnpm db:import <sql>` | 导出/导入本地库（换机、移交评委） |
| `pnpm build` / `pnpm start` | 生产构建与运行 |
| `pnpm test` | 单元测试 |
