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
  local token="$1" client_id="$2" trap_ids="$3" log_id="$4" mode="$5" delete_seconds="$6" confirm="$7"
  umask 077
  cat > .env <<EOF
# Discord bot token from the Discord Developer Portal.
DISCORD_TOKEN=$token

# Discord application client ID, used for /banbot and invite URLs.
CLIENT_ID=$client_id

# Comma-separated trap channel IDs.
TRAP_CHANNEL_IDS=$trap_ids

# Optional mod-log channel ID.
LOG_CHANNEL_ID=$log_id

# dry-run = log only. ban = actually ban matching users.
ACTION_MODE=$mode

# Ban mode only works when ACTION_MODE=ban and CONFIRM_CONFIG=true.
CONFIRM_CONFIG=$confirm

# How many seconds of the banned user's recent messages Discord should delete.
# Max: 604800 = 7 days.
DELETE_MESSAGE_SECONDS=$delete_seconds

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
trap_ids="$(prompt "Trap channel IDs, comma separated")"
log_id="$(prompt "Optional log channel ID")"
mode="$(prompt "Mode: dry-run or ban" "dry-run")"
delete_seconds="$(prompt "Delete messages for seconds" "86400")"
confirm="false"

if [ "$mode" = "ban" ]; then
  read -r -p "Type EXACTLY \"enable ban mode\" to continue: " ban_confirm
  if [ "$ban_confirm" = "enable ban mode" ]; then
    confirm="true"
  else
    echo "Ban mode not confirmed. Using dry-run."
    mode="dry-run"
  fi
fi

write_env "$token" "$client_id" "$trap_ids" "$log_id" "$mode" "$delete_seconds" "$confirm"

echo
echo "Created .env"
echo "Invite URL:"
echo "https://discord.com/oauth2/authorize?client_id=${client_id}&permissions=3076&integration_type=0&scope=bot%20applications.commands"
echo
echo "Next:"
echo "  docker compose up -d --build"
echo "  docker compose logs -f"
