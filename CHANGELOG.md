# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-26

First release of **成长大师兄 (GrowthMentor)** — multi-agent practice arena.

### Highlights

- Multi-agent roundtable discussion with TTS
- Immersive mode with speech bubbles and keyboard navigation
- Discussion buffer-level pause
- Roundtable shortcuts (T/V/Esc/Space/M/S/C)
- Whiteboard pan, zoom, history, auto-save
- Multiple LLM / TTS / media providers
- Server-side media and TTS generation
- Playback speed controls
- Optional OpenClaw skill for chat-app launch
- Vercel / Docker deploy paths

### Security

- SSRF guard and credential handling on server routes
- Chat route uses resolved server API keys

### Testing

- Vitest unit tests
- Playwright e2e harness
