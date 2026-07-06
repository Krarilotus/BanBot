# Discord Trap Ban Bot

Tiny self-hosted Discord bot for one job: watch configured trap channels and ban roleless human users who post there. It deletes recent messages through Discord's ban API, then posts `<username> banned` in the trap channel.

## Fastest Setup

### 1. Create The Discord Bot

Do this in the Discord Developer Portal before running the server installer:

1. Open <https://discord.com/developers/applications>.
2. Click **New Application** or select your existing BanBot application.
3. Open **General Information** and copy **Application ID**. The installer calls this the Discord application client ID.
4. Open **Bot**.
5. Click **Reset Token** and copy the real bot token. A random string will not work.
6. Under **Privileged Gateway Intents**, leave these OFF:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
7. Do not use the permissions checkboxes on that page; the installer prints the correct invite URL later.

### 2. Run The Server Installer

On the server as root:

```bash
curl -fsSLO https://raw.githubusercontent.com/Krarilotus/BanBot/master/install.sh
bash install.sh
```

The installer asks only for:

- the real Discord bot token from **Bot -> Reset Token**
- the **Application ID** from **General Information**

It then installs Docker and git if needed, creates a locked non-login `banbot` user, clones this repo to `/home/banbot/BanBot`, starts the bot, and prints the invite URL.

The installer does not edit nginx, firewall rules, domains, reverse proxies, existing app ports, or unrelated Docker containers/images. The container publishes no ports. If Docker is not installed yet, the installer asks before installing it because Docker itself creates Docker-managed iptables chains.

After inviting the bot, configure it inside Discord as a server admin:

```text
/banbot setup trap_channel:#dont-post-here
/banbot status
```

Keep the first test in dry-run mode. To soft-kick users who have roles and delete their last 10 minutes of messages:

```text
/banbot setup role_user_action:kick
```

When dry-run behaves correctly:

```text
/banbot setup mode:ban confirm_ban_mode:enable ban mode
```

## What It Does

- Watches only trap channels configured with `/banbot setup`.
- Ignores bots, webhooks, other channels, and itself.
- By default, ignores users with roles. You can configure role users to be soft-kicked or banned.
- A soft-kick temporarily bans and immediately unbans the user so Discord deletes their recent messages.
- Starts in dry-run mode.
- Requires the exact Discord-side confirmation `enable ban mode` before real bans.
- Deletes up to the configured number of seconds of the banned user's prior messages.
- Stores per-server config in `/home/banbot/BanBot/data/config.json`, mounted into the container at `/data/config.json`.

It does not read message content, store messages, manage roles, scan all channels, or need Administrator.

## Required Discord Permissions

Invite the bot with only:

- View Channels
- Ban Members
- Send Messages

The invite scope is `bot applications.commands` so `/banbot` can work. Do not give the bot Administrator.

## Discord Developer Portal Notes

The Bot page has a token button and many permission/intents checkboxes. For this bot:

- Use **Reset Token** to get the token for the installer.
- Use **General Information -> Application ID** as the client ID.
- Keep all privileged gateway intents off.
- Do not give Administrator.
- Use the invite URL printed by the installer.

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

Soft-kick users who have roles instead of ignoring them:

```text
/banbot setup role_user_action:kick
```

Change how much message history gets deleted for role-user soft-kicks:

```text
/banbot setup role_user_delete_seconds:600
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
5. Give the test account any real role and confirm the bot ignores it by default.
6. Optionally run `/banbot setup role_user_action:kick` and confirm dry-run says it would soft-kick users with roles.
7. Enable ban mode only with a disposable test account.

## Updating

Installer deployment:

```bash
/home/banbot/BanBot/update.sh
```

Status:

```bash
/home/banbot/BanBot/status.sh
```

Uninstall container while keeping config:

```bash
/home/banbot/BanBot/uninstall.sh
```

## Server Hardening

No public inbound ports, reverse proxy, domain, TLS certificate, or database are required.

BanBot does not need nginx. It makes outbound Discord connections only and has no inbound HTTP listener unless you deliberately enable the local health endpoint.

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

Aborted an old installer run: this is usually harmless. If you pressed `Ctrl+C` while it was asking for token/client ID, it may have installed security updates and created an old empty directory. The current installer can continue from there. To clean the old unused path first:

```bash
rm -rf /opt/discord-trap-ban-bot
rm -f /root/install.sh
```

Then rerun the current installer:

```bash
curl -fsSL https://raw.githubusercontent.com/Krarilotus/BanBot/master/install.sh | bash
```

Bot logs in but `/banbot` does not appear: reinvite the bot with the generated URL, which includes `applications.commands`.

Bot logs in but does nothing: run `/banbot status`, check the trap channel, and confirm the message came from a human user with only `@everyone`.

User is not bannable: move the bot role higher, confirm the target has no real role, and confirm the bot has Ban Members.

Bot cannot send logs or ban notices: check View Channel and Send Messages.

Bot exits immediately: run `validate-config` and check `.env`.

## Maintenance Policy

This project intentionally avoids feature creep. Bug fixes and security fixes are welcome; general moderation features are out of scope. The bot should stay small enough to audit in a few minutes.

## License

MIT
