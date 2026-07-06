# Discord Trap Ban Bot

Tiny self-hosted Discord bot for one job: watch configured trap channels and ban roleless human users who post there. It deletes recent messages through Discord's ban API, then posts `<username> banned` in the trap channel.

## What It Does

- Watches only `TRAP_CHANNEL_IDS`.
- Ignores bots, webhooks, other channels, and users with any role besides `@everyone`.
- Starts in `dry-run` mode.
- Requires `ACTION_MODE=ban` and `CONFIRM_CONFIG=true` before it can ban.
- Deletes up to `DELETE_MESSAGE_SECONDS` of the banned user's prior messages.
- Provides `/banbot` setup help after invite.

It does not read message content, store messages, use a database, manage roles, scan all channels, or need Administrator.

## Required Discord Permissions

Invite the bot with only:

- View Channels
- Ban Members
- Send Messages

The invite scope is `bot applications.commands` so `/banbot` can work. Do not give the bot Administrator.

## Quick Start

For a server install without Node.js or Git:

```bash
curl -fsSLO https://raw.githubusercontent.com/Krarilotus/BanBot/master/install.sh
less install.sh
sudo bash install.sh
```

For local development:

```bash
npm install
cp .env.example .env
npm run invite
docker compose up -d --build
docker compose logs -f
```

The installer creates `/opt/discord-trap-ban-bot`, writes `.env`, pulls `ghcr.io/krarilotus/banbot:latest`, starts the bot, and prints the invite URL.

## Discord Developer Portal Setup

1. Go to the Discord Developer Portal.
2. Create a new application and bot.
3. Copy the bot token into setup when asked.
4. Copy the application client ID into setup when asked.
5. Do not enable Message Content Intent.
6. Do not enable Server Members Intent.
7. Do not enable Presence Intent.
8. Use the generated invite URL.
9. Move the bot role high enough to ban roleless users.

## Server Setup

Create a trap channel such as `#dont-post-here`.

For `@everyone`, allow:

- View Channel
- Send Messages

For the bot role, allow:

- View Channel
- Send Messages

Optional log channel:

- View Channel
- Send Messages

## Configuration

```bash
DISCORD_TOKEN=
CLIENT_ID=
TRAP_CHANNEL_IDS=
LOG_CHANNEL_ID=
ACTION_MODE=dry-run
CONFIRM_CONFIG=false
DELETE_MESSAGE_SECONDS=86400
HEALTH_PORT=
HEALTH_HOST=127.0.0.1
```

Validate config without logging into Discord:

```bash
docker compose run --rm discord-trap-ban-bot validate-config
```

## Testing And Ban Mode

Start with `ACTION_MODE=dry-run`. Send a message in the trap channel from a test user that has only `@everyone`; logs should say it would ban. Give that user any role and confirm the bot ignores them.

To enable real bans:

```bash
nano .env
```

Set:

```bash
ACTION_MODE=ban
CONFIRM_CONFIG=true
```

Then restart:

```bash
docker compose up -d
docker compose logs -f
```

## Updating

Repo deployment:

```bash
./update.sh
```

Installer deployment:

```bash
sudo /opt/discord-trap-ban-bot/update.sh
```

## Server Hardening

No public inbound ports, reverse proxy, domain, TLS certificate, or database are required.

Recommended basics:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Use SSH keys, keep the server updated, and do not run the bot directly as root outside Docker.

## Privacy

This bot does not read message content, store messages, or use a database. It processes only metadata needed to decide whether to ban:

- guild
- channel
- author
- member roles

Logs may contain guild IDs, channel IDs, user IDs, usernames/tags, and action results. No data is sent to any third-party service except Discord.

## Troubleshooting

Bot logs in but does nothing: check `TRAP_CHANNEL_IDS`, channel visibility, and that the message was from a human user in a guild trap channel.

User is not bannable: move the bot role higher, confirm the target has no real role, and confirm the bot has Ban Members.

Bot cannot send logs or ban notices: check View Channel and Send Messages in the target channel.

Bot exits immediately: run `validate-config` and check `.env`.

## Maintenance Policy

This project intentionally avoids feature creep. Bug fixes and security fixes are welcome; general moderation features are out of scope. The bot should stay small enough to audit in a few minutes.

## License

MIT
