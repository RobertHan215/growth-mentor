# Contributing to 成长大师兄 (GrowthMentor)

Thanks for helping improve the multi-agent practice arena.

## How to contribute

| Type | What to do |
| --- | --- |
| Bug fix | Open a PR (link the issue if one exists) |
| Provider / TTS / small extension | Open a PR directly |
| New feature or architecture change | Open an issue first, then PR |
| Docs | Open a PR directly |

## Prerequisites

- Node.js >= 20.9.0
- pnpm (latest)
- `.env.local` from [`.env.example`](.env.example)

## Getting started

```bash
git clone https://github.com/RobertHan215/growth-mentor.git
cd growth-mentor
pnpm install
cp .env.example .env.local
# edit .env.local with at least one LLM key
pnpm dev
```

## Workflow

1. Branch from `main`
2. Keep the practice path runnable: home → generate → roundtable chat
3. `pnpm lint && pnpm test` before PR
4. Prefer small, focused PRs

## Project map (practice-critical)

```
growth-mentor/
├── app/api/chat/            # multi-agent practice SSE
├── app/api/generate*/       # scene generation
├── lib/orchestration/       # director / turn-taking
├── lib/playback/            # playback ↔ live
├── lib/action/              # speech, whiteboard, discussion
├── components/roundtable/   # roundtable UI
└── components/chat/         # practice sessions
```

## License

By contributing, you agree your work is licensed under [AGPL-3.0](LICENSE).
