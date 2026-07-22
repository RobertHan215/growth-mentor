<p align="center">
  <img src="assets/banner.png" alt="GrowthMentor Banner" width="680"/>
</p>

<p align="center">
  <b>成长大师兄</b><br/>
  AI 对练场 — 和多个智能体一起练表达、练思维、练实战
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg?style=flat-square" alt="License: AGPL-3.0"/></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/LangGraph-1.1-purple?style=flat-square" alt="LangGraph"/>
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README-zh.md">简体中文</a>
</p>

---

## 为什么是成长大师兄

大多数 AI 学习工具只会「讲」。  
**成长大师兄让你「练」。**

输入一个主题，系统生成对练场景：AI 导师、队友、挑战者围坐一张圆桌。他们会提问、反驳、追问、画白板，你随时插话、被点名、被压测——像真实讨论，而不是单向播课。

<p align="center">
  <img src="assets/discussion.gif" width="560" alt="多智能体对练讨论"/>
</p>

---

## 对练场景（核心）

| 场景 | 你在练什么 | 智能体怎么配合 |
|------|-----------|----------------|
| **圆桌讨论** | 表达、倾听、临场反应 | 多角色主动开辩，你可随时加入或被点名 |
| **攻防辩论** | 立论、反驳、证据链 | 正反方人设对打，白板同步梳理论点 |
| **导师追问** | 深度理解、拆问题 | Q&A 模式：讲不清就换白板/图示继续压 |
| **测验对练** | 检索与纠错 | 即时判分 + 讲解，错题当场再练 |
| **项目协作 (PBL)** | 分工、推进、交付 | 选角色，和 AI 队友一起推进里程碑 |

<p align="center">
  <img src="assets/pbl.gif" width="48%" alt="PBL 对练"/>
  &nbsp;
  <img src="assets/quiz.gif" width="48%" alt="测验对练"/>
</p>

### 一次对练大概长这样

1. **定题** — 「模拟产品评审：给这个功能打分并说服 PM」  
2. **组局** — 自动生成导师 / 质疑者 / 记录者等人设  
3. **开练** — 语音讲解 + 白板 + 圆桌发言，你可插麦  
4. **复盘** — 测验、笔记、导出材料，把这一局沉淀下来  

---

## 能力一览

- **多智能体编排** — LangGraph 导演图调度发言顺序、讨论轮次、插话时机  
- **语音进出** — TTS 讲解 + ASR 语音输入，嘴上练，不只打字  
- **共享白板** — 公式、流程图、论据结构，边说边画  
- **场景生成** — 主题 / PDF → 大纲 → 幻灯片 / 测验 / 交互页 / PBL  
- **导出** — `.pptx` 幻灯片、交互式 `.html`  
- **中英界面** · Dark Mode · 多模型 Provider

<p align="center">
  <img src="assets/slides.gif" width="48%" alt="带讲解的幻灯片"/>
  &nbsp;
  <img src="assets/interactive.gif" width="48%" alt="交互模拟"/>
</p>

---

## 适合谁

| 人群 | 典型对练 |
|------|----------|
| 求职 / 晋升 | 行为面试、系统设计口述、述职模拟 |
| 产品 / 咨询 | 需求评审、客户异议处理、方案路演 |
| 学生 | 论文答辩预演、概念互问、错题回炉 |
| 语言学习 | 情景对话、角色扮演、即兴发言 |
| 团队内训 | 销售话术、合规情景、事故复盘 |

---

## 快速开始

**需要：** Node.js ≥ 20 · pnpm ≥ 10

```bash
git clone https://github.com/RobertHan215/growth-mentor.git
cd growth-mentor
pnpm install
cp .env.example .env.local
```

`.env.local` 至少配一个 LLM Key：

```env
OPENAI_API_KEY=sk-...
# 或 ANTHROPIC_API_KEY / GOOGLE_API_KEY / DEEPSEEK_API_KEY / ...
# 推荐：DEFAULT_MODEL=google:gemini-3-flash-preview
```

```bash
pnpm dev
# → http://localhost:3000
```

生产：

```bash
pnpm build && pnpm start
# 或
docker compose up --build
```

也支持 Vercel 一键部署（导入仓库后填至少一个 API Key）。

---

## 技术栈（简）

| 层 | 选型 |
|----|------|
| App | Next.js 16 · React 19 · TypeScript |
| 编排 | LangGraph 多智能体导演图 |
| 状态 | Zustand · SSE 流式对话 |
| 表现 | 幻灯片画布 · SVG 白板 · TTS/ASR |
| 部署 | Node / Docker / Vercel |

关键目录：

```
app/api/chat/            # 多人对练 SSE
app/api/generate*/       # 场景生成流水线
lib/orchestration/       # 导演图 / 发言调度
lib/playback/            # 播放与直播态
lib/action/              # 语音、白板、讨论等动作
components/roundtable/   # 圆桌 UI
components/chat/         # 对练会话
```

---

## OpenClaw（可选）

可在飞书 / Slack / Telegram 等通过 [OpenClaw](https://github.com/openclaw/openclaw) 拉起对练：

```bash
clawhub install growth-mentor
```

Skill 会引导托管模式或本地部署；细节见 `skills/growth-mentor/`。

---

## 参与贡献

Issue / PR 都欢迎。改对练链路时优先看：

- `lib/orchestration/` — 谁先说、说几轮、何时点人  
- `lib/action/` — discussion / speech / whiteboard 动作  
- `components/roundtable/` + `components/chat/` — 对练 UI  

```bash
pnpm lint && pnpm test
```

---

## 许可证

[AGPL-3.0](LICENSE)
