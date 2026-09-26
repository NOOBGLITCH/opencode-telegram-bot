# Deploy and Host OpenCode Telegram Bot on Railway

Secure Telegram client for [OpenCode](https://opencode.ai). Run AI coding tasks, monitor progress, switch models, and manage sessions from your phone.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/opencode-telegram-bot)

No open ports, no exposed APIs. The bot talks to its bundled OpenCode server and the Telegram Bot API only.

## About Hosting

The service runs the Telegram bot plus a bundled `opencode serve` backend in one container (Alpine, `linux/amd64`). Bot state (`settings.json`, logs, SQLite, OpenCode auth/sessions) and cloned workspace repos persist on the attached `/app/data` volume. Railway auto-detects the `Dockerfile`; restart policy is `ALWAYS`.

## Why Deploy

- Operate OpenCode coding tasks from Telegram when away from your computer.
- Self-contained: no separate server to manage, no localhost tunnel needed.
- One-click deploy with template variables for secrets and model defaults.

## Common Use Cases

- Send prompts to OpenCode from anywhere and receive results with code as files.
- Create, continue, and monitor sessions; switch models/agents from chat.
- Answer agent questions and approve permissions via inline buttons.
- Browse sessions, projects, and scheduled tasks from your phone.

## Dependencies for OpenCode Telegram Bot

| Key | Description |
| --- | ----------- |
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) (required) |
| `TELEGRAM_ALLOWED_USER_ID` | Your numeric ID from [@userinfobot](https://t.me/userinfobot) (required) |
| `OPENCODE_MODEL_PROVIDER` | Default model provider, e.g. `anthropic`, `openai` (default `opencode`) |
| `OPENCODE_MODEL_ID` | Default model ID (default `muse-spark-1.3-contributor-free`) |
| `WORKSPACE_REPOS` | Comma-separated public git URLs cloned into the volume on first boot (optional) |
| `OPENROUTER_API_KEY` (or provider key) | LLM provider key so the bundled OpenCode server can run models (as needed) |

Optional: `BOT_LOCALE` (default `en`), `LOG_LEVEL` (default `info`). Full list in `.env.example`.

### Deployment Dependencies

- Attached Railway volume mounted at `/app/data` (bot state, OpenCode state, workspace repos).
- Outbound HTTPS to `api.telegram.org` and your model provider.
- No inbound ports required; the worker exposes no HTTP service.

After deploy: open your bot in Telegram and send `/status`, then `/projects`. If `/projects` is empty, set `WORKSPACE_REPOS` to repos you want cloned. Docker-only commands (`/opencode_start`, `/opencode_stop`, `/open`, `/ls`, `/worktree`) reply with a warning in container mode, same as Docker.

Source: https://github.com/NOOBGLITCH/opencode-telegram-bot
