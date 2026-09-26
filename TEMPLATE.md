# OpenCode Telegram Bot

Secure Telegram client for [OpenCode](https://opencode.ai). Run AI coding tasks, monitor progress, switch models, and manage sessions from your phone.

No open ports, no exposed APIs. The bot talks to your OpenCode server and Telegram Bot API only.

## Required variables

| Key | Description |
| --- | ----------- |
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_ALLOWED_USER_ID` | Your numeric ID from [@userinfobot](https://t.me/userinfobot) |
| `OPENCODE_MODEL_PROVIDER` | Default model provider (e.g. `anthropic`, `openai`) |
| `OPENCODE_MODEL_ID` | Default model ID (e.g. `claude-3-5-sonnet-20241022`) |
| `OPENCODE_API_URL` | Reachable OpenCode server URL (Railway has no localhost OpenCode) |

Optional: `BOT_LOCALE` (default `en`), `LOG_LEVEL` (default `info`). Full list in `.env.example`.

## Persistence

Service mounts a Railway volume at `/app/data` (`settings.json`, logs, SQLite). This is the bot's own state, not your project files.

## After deploy

1. Set the variables above in Railway → Variables (replace `REPLACE_ME`).
2. Point `OPENCODE_API_URL` at a reachable OpenCode server (with `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` if protected).
3. Open your bot in Telegram and send `/status`.

Docker-only commands (`/opencode_start`, `/opencode_stop`, `/open`, `/ls`, `/worktree`) need host filesystem access and reply with a warning on Railway, same as Docker.

Source: https://github.com/NOOBGLITCH/opencode-telegram-bot
