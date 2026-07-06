# Complete Implementation Plan: Minimal Self-Hosted Discord Trap-Channel Ban Bot

## 0. Product Goal

Build a tiny, auditable, self-hosted Discord bot that does exactly one thing:

```text
If a non-bot user sends a message in a configured trap channel
AND the user has no role except @everyone
THEN ban the user
AND delete recent messages from that user through Discord's ban API.
```

The bot should be:

- extremely simple to maintain
- safe by default
- self-hostable by non-experts
- configurable without editing code
- deployable with one command after initial token setup
- reusable by other server owners
- intentionally narrow in permissions and behavior
- easy to update from GitHub

The bot should not become a general moderation bot.

---

## 1. Core Design Decisions

### 1.1 Use TypeScript + discord.js

Use:

- Node.js LTS
- TypeScript
- discord.js v14
- Docker Compose for deployment
- GitHub Actions for CI
- Dependabot for dependency update PRs

Reasoning:

- discord.js is widely used and easy to maintain.
- TypeScript gives compile-time safety without much complexity.
- Docker hides most host differences.
- Docker Compose makes install/update commands simple.
- A single long-running process is enough; no database is needed.

---

### 1.2 No Database

Do not add Postgres, Redis, SQLite, Prisma, or migrations.

This bot does not need persistent state.

Runtime state can be limited to:

- in-memory duplicate-action guard
- health status
- startup validation result

All configuration should come from `.env`.

---

### 1.3 No Dashboard

Do not build a web UI.

A dashboard would require:

- web server
- auth
- sessions
- CSRF protection
- HTTPS configuration
- more attack surface
- more maintenance

Instead, use:

- `.env` for configuration
- `setup.sh` wizard for first-time setup
- `update.sh` for updates
- logs through Docker and optional Discord log channel

---

### 1.4 No Slash Commands in v1

Do not build slash commands in the first version.

Slash commands would require:

- command registration
- permissions handling
- interaction handling
- extra code paths
- extra testing

The bot should be passive:

```text
listen to messageCreate
check channel
check roles
ban if needed
log action
```

---

### 1.5 No Message Content Intent

The bot must not request or enable Message Content Intent.

It does not need to inspect text. It only needs:

- guild ID
- channel ID
- author ID
- whether the author is a bot
- member roles

Required Discord Gateway intents:

```text
Guilds
GuildMessages
```

Do not request:

```text
MessageContent
GuildMembers
GuildPresences
```

The bot can fetch the single guild member who triggered a message event when needed.

---

### 1.6 Approval Rule

Do not configure approved roles manually.

Approval is defined as:

```text
Approved user = member has any role other than @everyone
Unapproved user = member has only @everyone
```

Implementation rule:

```ts
const hasOnlyEveryoneRole = member.roles.cache.every(
  role => role.id === guild.id
);
```

Equivalent:

```ts
const hasAnyNonEveryoneRole = member.roles.cache.some(
  role => role.id !== guild.id
);
```

Use the second form because it reads closer to the business rule.

---

## 2. Security Model

### 2.1 Bot Permissions

Minimum Discord permissions:

```text
View Channels
Ban Members
```

Optional Discord logging permission:

```text
Send Messages
```

Do not give:

```text
Administrator
Manage Server
Manage Roles
Manage Channels
Manage Webhooks
Manage Messages
Kick Members
Mention Everyone
Manage Nicknames
Moderate Members
```

The bot should not need `Manage Messages`, because message deletion happens via the ban endpoint's `deleteMessageSeconds` option.

---

### 2.2 Role Hierarchy

The bot's role must be above unverified users.

Since the bot only bans users with no role except `@everyone`, this should usually be enough:

```text
Bot role above @everyone
Bot role below Admin/Moderator/Verified/Member roles
```

If the target user has any real role, the bot ignores them anyway.

The bot must never try to ban:

- bots
- webhooks
- server owner
- users with any non-everyone role
- users Discord marks as not bannable

---

### 2.3 Safe Default Mode

Default mode must be:

```text
ACTION_MODE=dry-run
```

In dry-run mode, the bot logs what it would do but does not ban.

Ban mode must require an explicit config change:

```text
ACTION_MODE=ban
```

No first install should immediately ban users unless the operator deliberately enables it.

---

### 2.4 Public Self-Hosting Model

Do not provide one global hosted bot token.

Each server owner should:

1. create their own Discord application
2. create their own bot token
3. self-host the bot
4. invite their own bot to their own server

Reason:

- avoids storing other people's tokens
- avoids central trust
- avoids one compromised hosted bot affecting many servers
- avoids needing a public SaaS security model

---

### 2.5 Token Handling

The bot token must only live in:

```text
.env
```

Never commit it.

The repo must include:

```text
.env.example
.gitignore
SECURITY.md
```

`.gitignore` must include:

```gitignore
.env
*.env
node_modules
dist
coverage
*.log
.DS_Store
```

`SECURITY.md` should clearly say:

```text
Never paste your Discord bot token into GitHub issues, Discord chats, screenshots, logs, or support requests.
If exposed, immediately reset the token in the Discord Developer Portal.
```

---

## 3. User Experience Target

### 3.1 Ideal Setup Flow

For a normal self-hoster, setup should be:

```bash
git clone https://github.com/YOUR_NAME/discord-trap-ban-bot.git
cd discord-trap-ban-bot
./setup.sh
docker compose up -d
```

The setup wizard should ask for:

```text
Discord bot token
Trap channel ID(s)
Optional log channel ID
Action mode: dry-run or ban
Message deletion window
```

It should then create `.env`.

---

### 3.2 Ideal Update Flow

Updating should be:

```bash
./update.sh
```

Internally this should:

```bash
git pull --ff-only
docker compose pull || true
docker compose up -d --build
docker compose logs --tail=50
```

---

### 3.3 Ideal Runtime Operations

Useful operator commands:

```bash
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d
./update.sh
```

No Node/npm knowledge should be required for deployment.

---

## 4. Repository Layout

Create this repo:

```text
discord-trap-ban-bot/
  src/
    index.ts
    config.ts
    logger.ts
    trap.ts
    health.ts
  scripts/
    print-invite-url.ts
  .github/
    workflows/
      ci.yml
      docker.yml
    dependabot.yml
  .env.example
  .gitignore
  Dockerfile
  docker-compose.yml
  package.json
  package-lock.json
  tsconfig.json
  setup.sh
  update.sh
  README.md
  SECURITY.md
  LICENSE
```

Keep files small.

Approximate responsibilities:

```text
src/index.ts       bootstraps Discord client and wires events
src/config.ts      validates env config
src/logger.ts      stdout + optional Discord log channel helper
src/trap.ts        pure trap decision/action logic
src/health.ts      minimal HTTP health endpoint, optional
scripts/...        helper to print invite URL
```

Do not over-abstract.

---

## 5. Configuration

### 5.1 `.env.example`

Create:

```bash
# Required. Your Discord bot token.
DISCORD_TOKEN=

# Required. Comma-separated Discord channel IDs that act as trap channels.
TRAP_CHANNEL_IDS=

# Optional. Discord channel ID where the bot logs actions.
LOG_CHANNEL_ID=

# dry-run or ban.
# dry-run logs what would happen.
# ban actually bans matching users.
ACTION_MODE=dry-run

# How far back Discord should delete the banned user's messages.
# Maximum: 604800 seconds = 7 days.
DELETE_MESSAGE_SECONDS=86400

# Optional. Prevent accidental startup if config is suspicious.
# Set to true after you verify your .env.
CONFIRM_CONFIG=false

# Optional. Bind address for health endpoint.
HEALTH_HOST=127.0.0.1

# Optional. Health endpoint port. Set empty to disable.
HEALTH_PORT=3000
```

---

### 5.2 Config Validation Rules

At startup, validate:

```text
DISCORD_TOKEN is present
TRAP_CHANNEL_IDS is present
TRAP_CHANNEL_IDS contains only snowflake-looking IDs
LOG_CHANNEL_ID, if present, is a snowflake-looking ID
ACTION_MODE is exactly dry-run or ban
DELETE_MESSAGE_SECONDS is an integer between 0 and 604800
CONFIRM_CONFIG must be true if ACTION_MODE=ban
```

This adds a second safety latch:

```text
ACTION_MODE=ban
CONFIRM_CONFIG=true
```

Ban mode should refuse to start unless both are set.

---

### 5.3 Snowflake Validation

Use simple validation, not full Discord snowflake parsing:

```ts
const snowflakePattern = /^\d{17,20}$/;
```

---

## 6. Core Bot Behavior

### 6.1 Message Event Flow

On `messageCreate`:

```text
1. Ignore if not in guild.
2. Ignore if channel is not in TRAP_CHANNEL_IDS.
3. Ignore if author is a bot.
4. Ignore if message came from a webhook.
5. Fetch member if message.member is missing.
6. Check roles.
7. If user has any role other than @everyone, ignore.
8. Check bot can ban.
9. Check target is bannable.
10. If dry-run, log only.
11. If ban, ban with deleteMessageSeconds.
12. Log result.
13. Keep short in-memory dedupe window to avoid duplicate concurrent actions.
```

---

### 6.2 Dedupe Guard

Use an in-memory set:

```ts
const inFlight = new Set<string>();
```

Key:

```ts
const key = `${guild.id}:${user.id}`;
```

Behavior:

```text
If already inFlight, ignore.
Add before action.
Remove after 60 seconds.
```

Reason:

- bots may spam multiple messages quickly
- prevents parallel ban attempts
- no database required

---

### 6.3 Decision Function

Make a pure function:

```ts
export function hasAnyNonEveryoneRole(
  guildId: string,
  roleIds: Iterable<string>
): boolean {
  for (const roleId of roleIds) {
    if (roleId !== guildId) return true;
  }
  return false;
}
```

Unit test it heavily.

---

### 6.4 Ban Action

Use discord.js:

```ts
await member.ban({
  deleteMessageSeconds: config.deleteMessageSeconds,
  reason: `Trap channel hit: ${message.channelId}; user had only @everyone`,
});
```

Keep the reason short and deterministic.

Do not include message content.

---

### 6.5 Logging

Always log to stdout.

Optional log to Discord channel.

Log entries should include:

```text
timestamp
guild name
guild id
action mode
user tag
user id
channel id
result
reason
deleteMessageSeconds
```

Avoid mentioning the banned user in Discord logs.

Use:

```ts
allowedMentions: { parse: [] }
```

Example log:

```text
[2026-07-06T14:22:11.123Z] [ban] guild="Example" guildId=123 user="spam_bot#0000" userId=456 channelId=789 result=banned deleteMessageSeconds=86400
```

---

## 7. Implementation Details

### 7.1 `package.json`

Use scripts:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "node --test dist/**/*.test.js",
    "lint": "eslint .",
    "invite": "tsx scripts/print-invite-url.ts"
  }
}
```

Keep runtime dependencies minimal:

```text
discord.js
dotenv
```

Dev dependencies:

```text
typescript
tsx
@types/node
eslint
typescript-eslint
```

Optional: skip ESLint initially if you want absolute minimalism. TypeScript strict mode is already valuable.

---

### 7.2 `tsconfig.json`

Use strict TypeScript:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src", "scripts"]
}
```

---

### 7.3 `src/config.ts`

Responsibilities:

```text
load dotenv
parse env
validate env
export typed config object
throw readable startup errors
```

Pseudocode:

```ts
import "dotenv/config";

export type ActionMode = "dry-run" | "ban";

export interface Config {
  discordToken: string;
  trapChannelIds: Set<string>;
  logChannelId?: string;
  actionMode: ActionMode;
  deleteMessageSeconds: number;
  healthHost: string;
  healthPort?: number;
}

export function loadConfig(): Config {
  // parse env
  // validate fields
  // if ACTION_MODE=ban and CONFIRM_CONFIG !== "true", throw
}
```

Error style:

```text
Invalid configuration:
- TRAP_CHANNEL_IDS is required
- DELETE_MESSAGE_SECONDS must be between 0 and 604800
- ACTION_MODE=ban requires CONFIRM_CONFIG=true
```

---

### 7.4 `src/trap.ts`

Responsibilities:

```text
determine whether a message should trigger an action
perform dry-run or ban action
return structured result
```

Do not put Discord client startup here.

Suggested result type:

```ts
type TrapResult =
  | { kind: "ignored"; reason: string }
  | { kind: "dry-run"; userId: string; reason: string }
  | { kind: "banned"; userId: string; reason: string }
  | { kind: "failed"; userId?: string; reason: string; error?: unknown };
```

---

### 7.5 `src/logger.ts`

Responsibilities:

```text
write structured stdout logs
optionally send compact Discord log messages
never throw from logging
disable mentions
truncate long messages
```

Do not require the log channel to exist at startup. If missing or inaccessible, warn and continue.

---

### 7.6 `src/index.ts`

Responsibilities:

```text
load config
create Discord client
register ready handler
register messageCreate handler
start optional health server
login
handle shutdown signals
```

Shutdown handling:

```ts
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

Shutdown should:

```text
log shutdown
destroy Discord client
close health server if enabled
exit 0
```

---

## 8. Docker Setup

### 8.1 `Dockerfile`

Use multi-stage build:

```dockerfile
FROM node:lts-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build
RUN npm prune --omit=dev

FROM node:lts-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

CMD ["node", "dist/src/index.js"]
```

---

### 8.2 `docker-compose.yml`

Keep it simple:

```yaml
services:
  discord-trap-ban-bot:
    build: .
    container_name: discord-trap-ban-bot
    restart: unless-stopped
    env_file:
      - .env
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    init: true
```

Do not expose ports unless the health endpoint is intentionally enabled.

If using health endpoint:

```yaml
    ports:
      - "127.0.0.1:3000:3000"
```

But default should avoid exposed ports.

---

## 9. Setup Automation

### 9.1 `setup.sh`

Purpose:

- make setup easy
- avoid manual `.env` editing
- validate basic input
- show next steps

Behavior:

```text
1. Check Docker exists.
2. Check Docker Compose exists.
3. If .env exists, ask before overwriting.
4. Prompt for Discord bot token.
5. Prompt for trap channel IDs.
6. Prompt for optional log channel ID.
7. Ask action mode, default dry-run.
8. Ask delete message seconds, default 86400.
9. Set CONFIRM_CONFIG=false unless user explicitly chooses ban.
10. Write .env with chmod 600.
11. Print invite URL instructions.
12. Print run command.
```

Example UX:

```text
Discord Trap Ban Bot setup

Bot token:
Trap channel IDs, comma separated:
Optional log channel ID:
Mode [dry-run/ban] default dry-run:
Delete messages for seconds [86400]:

Created .env
Next:
  docker compose up -d --build
  docker compose logs -f
```

If user selects ban mode during setup, force confirmation:

```text
Type EXACTLY "enable ban mode" to continue:
```

Only then write:

```bash
ACTION_MODE=ban
CONFIRM_CONFIG=true
```

Otherwise write:

```bash
ACTION_MODE=dry-run
CONFIRM_CONFIG=false
```

---

### 9.2 `update.sh`

Purpose:

- one-command update

Behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail

git pull --ff-only
docker compose up -d --build
docker compose logs --tail=50
```

Make executable:

```bash
chmod +x setup.sh update.sh
```

---

### 9.3 `scripts/print-invite-url.ts`

Purpose:

Generate an invite URL without users manually calculating permission integers.

Prompt or read:

```text
CLIENT_ID
ENABLE_DISCORD_LOGS=true/false
```

Permissions:

Base:

```text
View Channels
Ban Members
```

If Discord log channel enabled:

```text
Send Messages
```

Generate URL:

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=PERMISSIONS_INTEGER&integration_type=0&scope=bot
```

Important:

Do not include `applications.commands` in scope for v1 because there are no slash commands.

---

## 10. Discord Developer Portal Instructions

README should include exact steps:

```text
1. Go to Discord Developer Portal.
2. New Application.
3. Name it "Trap Ban Bot" or similar.
4. Open Bot tab.
5. Create bot.
6. Reset token / copy token.
7. Do not enable Message Content Intent.
8. Do not enable Server Members Intent.
9. Do not enable Presence Intent.
10. Put token into setup.sh when asked.
11. Use generated invite URL.
12. Invite bot to server.
13. Move bot role high enough to ban roleless users.
```

Add warning:

```text
Never give the bot Administrator.
```

---

## 11. Discord Server Setup Instructions

README should include:

### 11.1 Create Trap Channel

Example:

```text
#dont-post-here
```

Recommended channel topic:

```text
Automated moderation trap. Do not post here. Accounts with no roles that post here may be banned automatically.
```

### 11.2 Trap Channel Permissions

For `@everyone`:

```text
View Channel: allowed
Send Messages: allowed
```

For the bot role:

```text
View Channel: allowed
```

Do not hide the channel from `@everyone`, otherwise spam bots cannot fall into it.

### 11.3 Log Channel Permissions

For optional log channel:

```text
Bot role:
  View Channel: allowed
  Send Messages: allowed
```

### 11.4 Testing Procedure

Create a test account or use a controlled unapproved account.

Test sequence:

```text
1. Start with ACTION_MODE=dry-run.
2. Make sure test user has only @everyone.
3. Send a message in trap channel.
4. Confirm bot logs "Would ban".
5. Give the test user any role.
6. Send another message.
7. Confirm bot ignores.
8. Remove role.
9. Enable ban mode.
10. Repeat with a disposable test account only.
```

---

## 12. CI/CD

### 12.1 GitHub Actions CI

`.github/workflows/ci.yml`

Run on:

```yaml
on:
  push:
  pull_request:
```

Jobs:

```text
install dependencies
typecheck
build
test
docker build
```

Do not deploy automatically in v1.

Deployment should stay explicit on the server through:

```bash
./update.sh
```

This avoids secret-heavy GitHub-to-server deployment.

---

### 12.2 Docker Build Check

In CI:

```bash
docker build .
```

This ensures the Dockerfile does not rot.

---

### 12.3 Dependabot

`.github/dependabot.yml`

Configure:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

Dependabot should open PRs, not push directly.

---

## 13. Tests

Keep tests small and focused.

### 13.1 Unit Tests

Test pure functions:

```text
hasAnyNonEveryoneRole()
parseTrapChannelIds()
parseDeleteMessageSeconds()
validateActionMode()
ban mode requires CONFIRM_CONFIG=true
```

Example cases:

```text
guild id only -> no non-everyone role
guild id + one role -> approved
empty role list -> suspicious, treat as unapproved or fail closed
invalid channel ID -> config error
DELETE_MESSAGE_SECONDS=-1 -> config error
DELETE_MESSAGE_SECONDS=604801 -> config error
ACTION_MODE=delete-everything -> config error
```

### 13.2 No Discord Integration Tests in v1

Avoid requiring real Discord credentials in CI.

No live Discord tests by default.

Add manual test checklist in README instead.

---

## 14. Failure Handling

### 14.1 Bot Missing Ban Permission

Behavior:

```text
log error
do not crash
continue running
```

Log:

```text
Cannot ban user: bot lacks Ban Members permission.
```

### 14.2 Target Not Bannable

Behavior:

```text
log warning
do not crash
continue running
```

This can happen if:

- user is server owner
- user has higher/equal role
- Discord denies action

### 14.3 Log Channel Missing

Behavior:

```text
log to stdout
warn once that Discord log channel is unavailable
continue running
```

### 14.4 Discord Disconnects

Let discord.js handle reconnects.

Do not implement custom reconnect logic unless needed later.

### 14.5 Rate Limits

The bot performs very few REST actions.

Still:

- never loop over guild members
- never bulk ban
- never scan old messages
- only act on message events in trap channels

---

## 15. Observability

### 15.1 Logs

Use structured-ish plain text or JSON.

Recommended JSON logs:

```json
{
  "timestamp": "2026-07-06T14:22:11.123Z",
  "level": "info",
  "mode": "ban",
  "guildId": "123",
  "channelId": "456",
  "userId": "789",
  "result": "banned",
  "deleteMessageSeconds": 86400
}
```

JSON logs are easier to grep and parse.

Do not log:

- message content
- bot token
- full environment
- personal data beyond Discord IDs/tags needed for moderation audit

### 15.2 Optional Health Endpoint

Health endpoint should be optional.

Default:

```bash
HEALTH_PORT=
```

If enabled, expose only on localhost:

```bash
HEALTH_HOST=127.0.0.1
HEALTH_PORT=3000
```

Endpoint:

```text
GET /healthz -> 200 OK
```

Response:

```json
{
  "ok": true,
  "ready": true,
  "mode": "dry-run"
}
```

No admin actions through HTTP.

No public port exposure.

---

## 16. Releases

Use semantic versioning:

```text
v1.0.0 first stable release
v1.0.1 bug fix
v1.1.0 small backward-compatible feature
v2.0.0 breaking config change
```

Tag releases:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Use GitHub Releases with:

```text
Added
Changed
Fixed
Security
Upgrade notes
```

---

## 17. README Structure

README should be practical and short.

Suggested sections:

```text
# Discord Trap Ban Bot

## What it does
## What it does not do
## Safety model
## Required Discord permissions
## Quick start
## Discord Developer Portal setup
## Server/channel setup
## Configuration
## Dry-run testing
## Enable ban mode
## Updating
## Troubleshooting
## Security
## License
```

---

## 18. README: What It Does

Write:

```text
This bot watches configured trap channels. If a human user with no role except @everyone posts there, the bot bans them and optionally deletes their recent messages using Discord's ban API.
```

---

## 19. README: What It Does Not Do

Write:

```text
This bot does not read message content.
This bot does not need Message Content Intent.
This bot does not need Administrator.
This bot does not manage roles.
This bot does not scan all channels.
This bot does not provide general automod.
This bot does not replace Discord AutoMod, ProBot, Zira, or human moderators.
```

---

## 20. README: Quick Start

Include:

```bash
git clone https://github.com/YOUR_NAME/discord-trap-ban-bot.git
cd discord-trap-ban-bot
chmod +x setup.sh update.sh
./setup.sh
docker compose up -d --build
docker compose logs -f
```

---

## 21. README: Enable Ban Mode

Make it deliberate:

```bash
nano .env
```

Set:

```bash
ACTION_MODE=ban
CONFIRM_CONFIG=true
```

Then:

```bash
docker compose up -d --build
docker compose logs -f
```

---

## 22. README: Troubleshooting

Include:

### Bot logs in but does nothing

Check:

```text
TRAP_CHANNEL_IDS is correct
bot can view trap channel
GuildMessages intent is enabled in code
message was sent in a guild text channel
message author is not a bot
```

### Bot says user is not bannable

Check:

```text
bot role is too low
target has a higher/equal role
target is server owner
bot lacks Ban Members
```

### Bot cannot send logs

Check:

```text
LOG_CHANNEL_ID is correct
bot can view log channel
bot can send messages in log channel
```

### Bot immediately exits

Check:

```text
.env exists
DISCORD_TOKEN is set
ACTION_MODE is valid
CONFIRM_CONFIG=true if ACTION_MODE=ban
DELETE_MESSAGE_SECONDS is within range
```

---

## 23. SECURITY.md

Include:

```markdown
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

## Design Security

This bot intentionally does not require:

- Administrator
- Message Content Intent
- Guild Members Intent
- Manage Roles
- Manage Channels
- Manage Messages

Use the minimum permissions described in README.
```

---

## 24. License

Use MIT unless you have a reason not to.

`LICENSE`:

```text
MIT License
```

Reason:

- common
- permissive
- easy for other server owners to self-host
- low friction

---

## 25. Implementation Order

Follow this order:

### Phase 1: Minimal Local Bot

1. Create repo.
2. Add package.json.
3. Add TypeScript config.
4. Add `.env.example`.
5. Implement config parser.
6. Implement Discord client.
7. Implement messageCreate handler.
8. Implement dry-run logging.
9. Test locally with `npm run dev`.

Success condition:

```text
Bot logs "would ban" when roleless user posts in trap channel.
```

---

### Phase 2: Ban Mode

1. Add `ACTION_MODE=ban`.
2. Add `CONFIRM_CONFIG=true` requirement.
3. Add bannable checks.
4. Add actual ban call.
5. Add `deleteMessageSeconds`.
6. Test with disposable account.

Success condition:

```text
Bot bans a roleless test account and deletes recent messages.
```

---

### Phase 3: Docker

1. Add Dockerfile.
2. Add docker-compose.yml.
3. Test build.
4. Test run through Docker.
5. Confirm `.env` is loaded.
6. Confirm logs work.

Success condition:

```bash
docker compose up -d --build
docker compose logs -f
```

shows ready status.

---

### Phase 4: Setup Automation

1. Add `setup.sh`.
2. Add input validation.
3. Add `.env` writer.
4. Add permission-safe file mode.
5. Add invite URL helper.
6. Test on clean machine/server.

Success condition:

```bash
./setup.sh
docker compose up -d --build
```

works without manual config editing.

---

### Phase 5: GitHub Maintenance Automation

1. Add GitHub Actions CI.
2. Add Docker build check.
3. Add Dependabot.
4. Add README.
5. Add SECURITY.md.
6. Add LICENSE.

Success condition:

```text
Pull requests run typecheck/build/test/docker build automatically.
```

---

### Phase 6: Public Release

1. Re-read README as a new user.
2. Confirm no token or private server IDs are committed.
3. Confirm default mode is dry-run.
4. Create v1.0.0 tag.
5. Create GitHub Release.
6. Post install instructions.

Success condition:

```text
Another person can self-host using only README + setup.sh.
```

---

## 26. Exact Runtime Algorithm

This is the final behavior the implementation must match:

```text
on messageCreate(message):

  if message is not from a guild:
    return

  if message.channelId is not configured as a trap channel:
    return

  if message.author.bot:
    return

  if message.webhookId exists:
    return

  if action is already in-flight for guildId:userId:
    return

  mark guildId:userId as in-flight

  try:
    fetch member if needed

    if member has any role where role.id != guild.id:
      return

    fetch bot member

    if bot lacks Ban Members:
      log failure
      return

    if member is not bannable:
      log failure
      return

    if ACTION_MODE is dry-run:
      log would-ban
      return

    if ACTION_MODE is ban:
      ban member with deleteMessageSeconds
      log banned
      return

  catch error:
    log failure

  finally:
    remove in-flight mark after 60 seconds
```

---

## 27. Acceptance Criteria

The project is complete when all of this is true:

```text
Functional:
- Bot starts from Docker Compose.
- Bot watches one or more trap channels.
- Bot ignores all other channels.
- Bot ignores bots.
- Bot ignores webhooks.
- Bot ignores users with any role other than @everyone.
- Bot dry-runs by default.
- Bot refuses ban mode unless CONFIRM_CONFIG=true.
- Bot bans roleless users in ban mode.
- Bot uses deleteMessageSeconds for cleanup.
- Bot logs all decisions to stdout.
- Bot optionally logs actions to Discord.

Security:
- Bot does not need Administrator.
- Bot does not request Message Content Intent.
- Bot does not request Guild Members Intent.
- Bot does not store message content.
- Bot token is only in .env.
- .env is gitignored.
- README warns against token exposure.
- Docker runs as non-root user.
- Docker container uses no-new-privileges.
- Docker container filesystem is read-only.

Maintainability:
- No database.
- No dashboard.
- No slash commands.
- No unrelated moderation features.
- TypeScript strict mode enabled.
- CI builds successfully.
- Docker build passes in CI.
- Dependabot is configured.
- setup.sh creates valid .env.
- update.sh updates deployment with one command.

User experience:
- Fresh install requires no code edits.
- README has copy-paste commands.
- Dry-run testing is documented.
- Ban mode activation is deliberate.
- Troubleshooting section covers common failures.
```

---

## 28. Future Features to Avoid Unless Truly Needed

Do not add these to v1:

```text
web dashboard
database
multi-tenant SaaS hosting
role allowlists
manual moderation commands
message content scanning
regex filters
keyword filters
anti-spam heuristics
temporary timeout mode
automatic channel creation
automatic permission editing
automatic role editing
bulk scanning old messages
admin web panel
metrics stack
Kubernetes deployment
```

Each of these increases maintenance burden.

The bot's value is that it is tiny and predictable.

---

## 29. Possible v1.1 Features

Only consider after v1 is stable:

```text
multiple guild support through the same config
optional timeout mode instead of ban
optional account-age threshold
optional minimum server membership age
optional JSON log mode
optional Prometheus metrics
optional systemd deployment without Docker
optional Discord log embeds
optional GitHub Container Registry image
```

Do not add these before the minimal version works.

---

## 30. Final Recommended Defaults

Use these defaults:

```bash
ACTION_MODE=dry-run
CONFIRM_CONFIG=false
DELETE_MESSAGE_SECONDS=86400
HEALTH_PORT=
TRAP_CHANNEL_IDS=
LOG_CHANNEL_ID=
```

Use these permissions:

```text
Required:
- View Channels
- Ban Members

Optional:
- Send Messages
```

Use these intents:

```text
Guilds
GuildMessages
```

Do not use these intents:

```text
MessageContent
GuildMembers
GuildPresences
```

Use this exact approval rule:

```text
If member has any role other than @everyone, they are approved.
If member has only @everyone, they are unapproved.
```

Use this exact deployment target:

```text
Docker Compose on the server.
No open inbound ports required.
No database.
No web dashboard.
One .env file.
One update script.
```

# Addendum: Make the Bot Truly Easy to Self-Host and Maintain

## 1. Prefer Prebuilt Docker Images Over Local Builds

The previous plan used:

```yaml
build: .
```

For public self-hosting, use a prebuilt image instead:

```yaml
services:
  discord-trap-ban-bot:
    image: ghcr.io/YOUR_NAME/discord-trap-ban-bot:latest
    container_name: discord-trap-ban-bot
    restart: unless-stopped
    env_file:
      - .env
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    init: true
```

Reason:

- users do not need Node.js
- users do not need npm
- users do not need to compile TypeScript
- updates are faster
- deployment is much simpler

The local `Dockerfile` should still exist for development, but normal users should run the published image.

---

## 2. Publish Docker Images Automatically from GitHub

Add GitHub Actions that publish to GitHub Container Registry.

Required packages:

```text
ghcr.io/YOUR_NAME/discord-trap-ban-bot:latest
ghcr.io/YOUR_NAME/discord-trap-ban-bot:v1.0.0
```

Release strategy:

```text
main branch -> latest
version tag -> immutable version image
```

Users who want stability can pin:

```yaml
image: ghcr.io/YOUR_NAME/discord-trap-ban-bot:v1.0.0
```

Users who want easy updates can use:

```yaml
image: ghcr.io/YOUR_NAME/discord-trap-ban-bot:latest
```

---

## 3. Add One-Command Installer

Add an installer script hosted in the repo:

```text
install.sh
```

Target UX:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_NAME/discord-trap-ban-bot/main/install.sh | bash
```

For safer documented usage, recommend:

```bash
curl -fsSLO https://raw.githubusercontent.com/YOUR_NAME/discord-trap-ban-bot/main/install.sh
less install.sh
bash install.sh
```

The installer should:

1. detect OS
2. install Docker if missing
3. install Docker Compose plugin if missing
4. create install directory
5. create `.env`
6. create `docker-compose.yml`
7. pull the Docker image
8. start the bot
9. show logs
10. print next commands

Default install directory:

```text
/opt/discord-trap-ban-bot
```

---

## 4. Installer Should Be Idempotent

Running the installer twice must not destroy config.

Behavior:

```text
If /opt/discord-trap-ban-bot/.env exists:
  do not overwrite it automatically

If docker-compose.yml exists:
  ask before replacing it

If Docker is installed:
  skip Docker install

If container exists:
  update/restart instead of failing
```

---

## 5. Add a One-Command Update Script

In `/opt/discord-trap-ban-bot/update.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/discord-trap-ban-bot

docker compose pull
docker compose up -d
docker compose logs --tail=80
```

Users update with:

```bash
sudo /opt/discord-trap-ban-bot/update.sh
```

No Git required on the server.

---

## 6. Add a One-Command Status Script

In `/opt/discord-trap-ban-bot/status.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/discord-trap-ban-bot

docker compose ps
docker compose logs --tail=80
```

Users check status with:

```bash
sudo /opt/discord-trap-ban-bot/status.sh
```

---

## 7. Add a One-Command Uninstall Script

In `/opt/discord-trap-ban-bot/uninstall.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/discord-trap-ban-bot

echo "This will stop and remove the bot container."
read -rp "Type uninstall to continue: " confirm

if [ "$confirm" != "uninstall" ]; then
  echo "Cancelled."
  exit 1
fi

docker compose down

echo "Container removed."
echo "Config remains in /opt/discord-trap-ban-bot/.env"
```

Do not delete `.env` automatically.

---

## 8. Add Server Hardening Notes

Because the bot needs no public inbound ports:

```text
No reverse proxy needed.
No open HTTP port needed.
No domain needed.
No TLS certificate needed.
No database port needed.
```

Recommended firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Optional SSH hardening:

```text
Use SSH keys.
Disable password login if comfortable.
Do not run the bot directly as root outside Docker.
Keep the server updated.
```

---

## 9. Add Config Validation Command

Add a mode that validates config without logging into Discord:

```bash
docker run --rm --env-file .env ghcr.io/YOUR_NAME/discord-trap-ban-bot:latest validate-config
```

Or simpler:

```bash
docker compose run --rm discord-trap-ban-bot validate-config
```

This should check:

```text
DISCORD_TOKEN exists
TRAP_CHANNEL_IDS exists
ACTION_MODE is valid
DELETE_MESSAGE_SECONDS is valid
CONFIRM_CONFIG is true when ACTION_MODE=ban
LOG_CHANNEL_ID format is valid if set
```

---

## 10. Add Invite URL Helper to Installer

The installer should ask for:

```text
Discord application client ID
```

Then print an invite URL with only required permissions.

Required scopes:

```text
bot
```

Required permissions:

```text
View Channels
Ban Members
Send Messages only if LOG_CHANNEL_ID is configured
```

The installer should print:

```text
Invite your bot with this URL:
https://discord.com/oauth2/authorize?client_id=...&permissions=...&scope=bot
```

Do not require users to calculate permission integers manually.

---

## 11. Add a Config File Comment Explaining Every Setting

Generated `.env` should look like this:

```bash
# Discord bot token from the Discord Developer Portal.
DISCORD_TOKEN=...

# Comma-separated trap channel IDs.
TRAP_CHANNEL_IDS=123456789012345678

# Optional mod-log channel ID.
LOG_CHANNEL_ID=

# dry-run = log only.
# ban = actually ban matching users.
ACTION_MODE=dry-run

# Required safety confirmation for ban mode.
# Ban mode only works when ACTION_MODE=ban and CONFIRM_CONFIG=true.
CONFIRM_CONFIG=false

# How many seconds of the banned user's recent messages Discord should delete.
# Max: 604800 = 7 days.
DELETE_MESSAGE_SECONDS=86400
```

---

## 12. Add Version Logging

At startup, log:

```text
bot version
node version
discord.js version
action mode
trap channel count
logging enabled/disabled
delete message seconds
```

Example:

```text
Discord Trap Ban Bot v1.0.0
Mode: dry-run
Trap channels: 1
Discord logging: disabled
Delete message seconds: 86400
```

This makes support much easier.

---

## 13. Add a Clear Privacy Statement

README should include:

```text
Privacy:

This bot does not read message content.
This bot does not store messages.
This bot does not use a database.
This bot only processes message metadata needed to determine:
- guild
- channel
- author
- member roles

Logs may contain:
- guild ID
- channel ID
- user ID
- username/tag
- action result

No data is sent to any third-party service except Discord.
```

---

## 14. Add a Maintenance Policy

README should say:

```text
Maintenance policy:

This project intentionally avoids feature creep.
Bug fixes and security fixes are welcome.
General moderation features are out of scope.
The bot should remain small enough to audit in a few minutes.
```

---

## 15. Final Simplified Public Setup Flow

The ideal final user-facing setup should be:

```bash
curl -fsSLO https://raw.githubusercontent.com/YOUR_NAME/discord-trap-ban-bot/main/install.sh
less install.sh
sudo bash install.sh
```

Then the installer asks:

```text
Bot token:
Application client ID:
Trap channel IDs:
Optional log channel ID:
Mode: dry-run or ban:
Delete message history seconds:
```

Then it does:

```text
install Docker if needed
write /opt/discord-trap-ban-bot/.env
write /opt/discord-trap-ban-bot/docker-compose.yml
write helper scripts
pull container image
start container
show invite URL
show logs
```

The user should not need to touch:

```text
Node.js
npm
TypeScript
GitHub Actions
Dockerfile
package.json
source code
```

---

## 16. Final Deployment Model

Use this as the final public architecture:

```text
GitHub repository:
  source code
  Dockerfile
  CI
  install.sh
  README
  SECURITY.md

GitHub Container Registry:
  prebuilt Docker image

User's server:
  /opt/discord-trap-ban-bot/.env
  /opt/discord-trap-ban-bot/docker-compose.yml
  /opt/discord-trap-ban-bot/update.sh
  /opt/discord-trap-ban-bot/status.sh
  /opt/discord-trap-ban-bot/uninstall.sh

Discord:
  user's own bot application
  user's own token
  user's own server
```

---

## 17. What This Adds Beyond the Previous Plan

The previous plan covered:

```text
bot logic
repo structure
Docker deployment
security defaults
README requirements
testing
CI
```

This addendum adds the missing self-hosting polish:

```text
prebuilt container images
one-command installer
one-command updates
one-command status
one-command uninstall
config validation mode
invite URL generation
idempotent setup
server hardening notes
privacy statement
maintenance policy
no Git/Node/npm required on user servers
```

Together, the original plan plus this addendum is complete for a clean v1.