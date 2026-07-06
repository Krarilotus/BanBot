# Discord Trap Ban Bot

Tiny self-hosted Discord bot for one job: watch configured trap channels and ban roleless human users who post there. It deletes recent messages through Discord's ban API, then posts `<username> banned` in the trap channel.

## Fastest Setup

On the server as root:

```bash
cd /root
curl -fsSLO https://raw.githubusercontent.com/Krarilotus/BanBot/master/install.sh
less install.sh
bash install.sh
```

The installer asks only for:

- Discord bot token
- Discord application client ID

It then installs Docker if needed, creates `/opt/discord-trap-ban-bot`, starts the bot, and prints the invite URL.

After inviting the bot, configure it inside Discord as a server admin:

```text
/banbot setup trap_channel:#dont-post-here
/banbot status
```

Keep the first test in dry-run mode. When it behaves correctly:

```text
/banbot setup mode:ban confirm_ban_mode:enable ban mode
```

## What It Does

- Watches only trap channels configured with `/banbot setup`.
- Ignores bots, webhooks, other channels, itself, and users with any role besides `@everyone`.
- Starts in dry-run mode.
- Requires the exact Discord-side confirmation `enable ban mode` before real bans.
- Deletes up to the configured number of seconds of the banned user's prior messages.
- Stores per-server config in `/data/config.json` inside a Docker volume.

It does not read message content, store messages, manage roles, scan all channels, or need Administrator.

## Required Discord Permissions

Invite the bot with only:

- View Channels
- Ban Members
- Send Messages

The invite scope is `bot applications.commands` so `/banbot` can work. Do not give the bot Administrator.

## Discord Developer Portal Setup

1. Go to the Discord Developer Portal.
2. Create a new application and bot.
3. Copy the bot token for the installer.
4. Copy the application client ID for the installer.
5. Do not enable Message Content Intent.
6. Do not enable Server Members Intent.
7. Do not enable Presence Intent.
8. Use the generated invite URL.
9. Move the bot role high enough to ban roleless users.

## Discord Admin Commands

Show help:

```text
/banbot help
```

Configure the trap channel:

```text
/banbot setup trap_channel:#dont-post-here
```

Optional log channel:

```text
/banbot setup log_channel:#mod-log
```

Change deleted message history window:

```text
/banbot setup delete_seconds:86400
```

Enable real bans deliberately:

```text
/banbot setup mode:ban confirm_ban_mode:enable ban mode
```

Go back to dry-run:

```text
/banbot setup mode:dry-run
```

Check current config:

```text
/banbot status
```

## Trap Channel Setup

Create a trap channel such as `#dont-post-here`.

For `@everyone`, allow:

- View Channel
- Send Messages

For the bot role, allow:

- View Channel
- Send Messages

Recommended topic:

```text
Automated moderation trap. Do not post here. Accounts with no roles that post here may be banned automatically.
```

## Server Config

The server `.env` only contains bootstrap settings:

```bash
DISCORD_TOKEN=
CLIENT_ID=
ACTION_MODE=dry-run
DELETE_MESSAGE_SECONDS=86400
CONFIG_PATH=/data/config.json
HEALTH_PORT=
HEALTH_HOST=127.0.0.1
```

Trap channels, log channel, mode, and delete window are configured in Discord with `/banbot setup`.

Validate bootstrap config without logging into Discord:

```bash
docker compose run --rm discord-trap-ban-bot validate-config
```

## Testing

1. Run `/banbot setup trap_channel:#your-trap-channel`.
2. Make sure mode is dry-run with `/banbot status`.
3. Send a message in the trap channel from a test account that has only `@everyone`.
4. Confirm logs say it would ban.
5. Give the test account any real role and confirm the bot ignores it.
6. Enable ban mode only with a disposable test account.

## Updating

Installer deployment:

```bash
/opt/discord-trap-ban-bot/update.sh
```

Status:

```bash
/opt/discord-trap-ban-bot/status.sh
```

Uninstall container while keeping config:

```bash
/opt/discord-trap-ban-bot/uninstall.sh
```

## Server Hardening

No public inbound ports, reverse proxy, domain, TLS certificate, or database are required.

Recommended basics:

```bash
ufw allow OpenSSH
ufw enable
ufw status
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

Bot logs in but `/banbot` does not appear: reinvite the bot with the generated URL, which includes `applications.commands`.

Bot logs in but does nothing: run `/banbot status`, check the trap channel, and confirm the message came from a human user with only `@everyone`.

User is not bannable: move the bot role higher, confirm the target has no real role, and confirm the bot has Ban Members.

Bot cannot send logs or ban notices: check View Channel and Send Messages.

Bot exits immediately: run `validate-config` and check `.env`.

## Maintenance Policy

This project intentionally avoids feature creep. Bug fixes and security fixes are welcome; general moderation features are out of scope. The bot should stay small enough to audit in a few minutes.

## License

MIT
