#!/usr/bin/env bash
set -euo pipefail

APP_USER="${BANBOT_USER:-banbot}"
APP_DIR="${BANBOT_DIR:-/opt/discord-trap-ban-bot}"
IMAGE="${BANBOT_IMAGE:-ghcr.io/krarilotus/banbot:latest}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, for example: sudo bash install.sh"
  exit 1
fi

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    echo "Docker is missing and automatic install only supports apt-based Linux."
    exit 1
  fi
}

install_security_updates() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Skipping unattended-upgrades setup because apt-get is not available."
    return
  fi
  apt-get update
  apt-get install -y unattended-upgrades
  dpkg-reconfigure -f noninteractive unattended-upgrades || true
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

write_compose() {
  cat > "$APP_DIR/docker-compose.yml" <<EOF
services:
  discord-trap-ban-bot:
    image: $IMAGE
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
EOF
}

write_helpers() {
  cat > "$APP_DIR/update.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
docker compose pull
docker compose up -d
docker compose logs --tail=80
EOF
  cat > "$APP_DIR/status.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
docker compose ps
docker compose logs --tail=80
EOF
  cat > "$APP_DIR/uninstall.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
echo "This will stop and remove the bot container. Config stays in .env."
read -r -p "Type uninstall to continue: " confirm
[ "$confirm" = "uninstall" ] || { echo "Cancelled."; exit 1; }
docker compose down
echo "Container removed. Config remains in $APP_DIR/.env"
EOF
  chmod +x "$APP_DIR/update.sh" "$APP_DIR/status.sh" "$APP_DIR/uninstall.sh"
}

write_cron() {
  cat > /etc/cron.d/discord-trap-ban-bot <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

17 4 * * * root cd "$APP_DIR" && docker compose pull >/var/log/discord-trap-ban-bot-update.log 2>&1 && docker compose up -d >>/var/log/discord-trap-ban-bot-update.log 2>&1 && docker image prune -f >>/var/log/discord-trap-ban-bot-update.log 2>&1
EOF
  chmod 644 /etc/cron.d/discord-trap-ban-bot
}

write_env() {
  if [ -f "$APP_DIR/.env" ]; then
    echo "Keeping existing $APP_DIR/.env"
    return
  fi

  local token client_id trap_ids log_id mode delete_seconds confirm
  token="$(prompt "Discord bot token")"
  client_id="$(prompt "Discord application client ID")"
  trap_ids="$(prompt "Trap channel IDs, comma separated")"
  log_id="$(prompt "Optional log channel ID")"
  mode="$(prompt "Mode: dry-run or ban" "dry-run")"
  delete_seconds="$(prompt "Delete message history seconds" "86400")"
  confirm="false"
  if [ "$mode" = "ban" ]; then
    read -r -p "Type EXACTLY \"enable ban mode\" to continue: " ban_confirm
    if [ "$ban_confirm" = "enable ban mode" ]; then
      confirm="true"
    else
      mode="dry-run"
    fi
  fi

  umask 077
  cat > "$APP_DIR/.env" <<EOF
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

# Required safety confirmation for ban mode.
CONFIRM_CONFIG=$confirm

# How many seconds of recent messages Discord should delete on ban.
DELETE_MESSAGE_SECONDS=$delete_seconds

HEALTH_PORT=
HEALTH_HOST=127.0.0.1
EOF
}

install_security_updates
install_docker
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
write_env
if [ -f "$APP_DIR/docker-compose.yml" ]; then
  read -r -p "docker-compose.yml exists. Replace it? Type replace to continue: " replace
  [ "$replace" = "replace" ] && write_compose
else
  write_compose
fi
write_helpers
write_cron
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"

cd "$APP_DIR"
docker compose pull || true
docker compose run --rm discord-trap-ban-bot validate-config
docker compose up -d

client_id="$(grep '^CLIENT_ID=' "$APP_DIR/.env" | cut -d= -f2-)"
permissions="3076"
echo
echo "Invite your bot with this URL:"
echo "https://discord.com/oauth2/authorize?client_id=${client_id}&permissions=${permissions}&integration_type=0&scope=bot%20applications.commands"
echo
echo "Useful commands:"
echo "  sudo $APP_DIR/status.sh"
echo "  sudo $APP_DIR/update.sh"
echo "  sudo $APP_DIR/uninstall.sh"
echo "Daily image updates are configured in /etc/cron.d/discord-trap-ban-bot"
docker compose logs --tail=80
