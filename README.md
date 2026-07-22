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

## 运行

**环境：** Node.js ≥ 20 · pnpm ≥ 10

```bash
git clone https://github.com/RobertHan215/growth-mentor.git
cd growth-mentor
pnpm install
cp .env.example .env.local
```

`.env.local` 至少配置一个 LLM：

```env
OPENAI_API_KEY=sk-...
# 或 ANTHROPIC_API_KEY / GOOGLE_API_KEY / DEEPSEEK_API_KEY 等
# 可选：DEFAULT_MODEL=google:gemini-3-flash-preview
```

```bash
pnpm dev
```

浏览器打开 http://localhost:3000

1. 输入对练主题（如：`模拟产品评审，说服 PM 通过这个功能`）
2. 点 **开始对练**
3. 进入场景后参与圆桌对话

生产构建：

```bash
pnpm build && pnpm start
# 或
docker compose up --build
```
