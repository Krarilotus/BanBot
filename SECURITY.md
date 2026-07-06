# Security Policy

## Supported Versions

Only the latest release receives security fixes.

## Reporting a Vulnerability

Please open a private security advisory on GitHub or contact the maintainer privately.

Do not include Discord bot tokens in reports.

## Token Exposure

If your Discord bot token was exposed:

1. Go to Discord Developer Portal.
2. Open your application.
3. Go to Bot.
4. Reset Token.
5. Update `.env`.
6. Restart the bot.

Never paste your Discord bot token into GitHub issues, Discord chats, screenshots, logs, or support requests.

## Design Security

This bot intentionally does not require:

- Administrator
- Message Content Intent
- Guild Members Intent
- Manage Roles
- Manage Channels
- Manage Messages

Use the minimum permissions described in README.
