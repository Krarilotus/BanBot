#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required. Install Docker with Compose, then run setup again."
    exit 1
  }
}

prompt() {
  local label="$1"
  local default="${2:-}"
  local value
  if [ -n "$default" ]; then
    read -r -p "$label [$default]: " value
    echo "${value:-$default}"
  else
    read -r -p "$label: " value
    echo "$value"
  fi
}

write_env() {
  local token="$1" client_id="$2"
  umask 077
  cat > .env <<EOF
# Discord bot token from the Discord Developer Portal.
DISCORD_TOKEN=$token

# Discord application client ID, used for /banbot and invite URLs.
CLIENT_ID=$client_id

# Server-specific settings are configured in Discord with /banbot setup.
ACTION_MODE=dry-run
DELETE_MESSAGE_SECONDS=86400
CONFIG_PATH=/data/config.json

# Leave empty to disable the local health endpoint.
HEALTH_PORT=
HEALTH_HOST=127.0.0.1
EOF
  chmod 600 .env
}

echo "Discord Trap Ban Bot setup"
need docker
docker compose version >/dev/null

if [ -f .env ]; then
  read -r -p ".env already exists. Overwrite it? Type overwrite to continue: " overwrite
  if [ "$overwrite" != "overwrite" ]; then
    echo "Keeping existing .env."
    exit 0
  fi
fi

token="$(prompt "Discord bot token")"
client_id="$(prompt "Discord application client ID")"
write_env "$token" "$client_id"

echo
echo "Created .env"
echo "Invite URL:"
echo "https://discord.com/oauth2/authorize?client_id=${client_id}&permissions=3076&integration_type=0&scope=bot%20applications.commands"
echo
echo "Next:"
echo "  docker compose up -d --build"
echo "  docker compose logs -f"
echo "  In Discord: /banbot setup trap_channel:#your-channel"
