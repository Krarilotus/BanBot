#!/usr/bin/env bash
set -euo pipefail

APP_USER="${BANBOT_USER:-banbot}"
APP_HOME="${BANBOT_HOME:-/home/$APP_USER}"
APP_DIR="${BANBOT_DIR:-$APP_HOME/BanBot}"
REPO_URL="${BANBOT_REPO_URL:-https://github.com/Krarilotus/BanBot.git}"
IMAGE="${BANBOT_IMAGE:-ghcr.io/krarilotus/banbot:latest}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, for example: sudo bash install.sh"
  exit 1
fi

read_from_terminal() {
  local prompt_text="$1"
  local value
  if [ -e /dev/tty ]; then
    printf "%s" "$prompt_text" >/dev/tty
    IFS= read -r value </dev/tty || value=""
  else
    read -r -p "$prompt_text" value || value=""
  fi
  printf "%s" "$value"
}

read_secret_from_terminal() {
  local prompt_text="$1"
  local value
  if [ -e /dev/tty ]; then
    printf "%s" "$prompt_text" >/dev/tty
    stty -echo </dev/tty
    IFS= read -r value </dev/tty || value=""
    stty echo </dev/tty
    printf "\n" >/dev/tty
  else
    read -r -s -p "$prompt_text" value || value=""
    printf "\n"
  fi
  printf "%s" "$value"
}

confirm() {
  local prompt_text="$1"
  local answer
  answer="$(read_from_terminal "$prompt_text [y/N]: ")"
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

print_preflight() {
  echo "BanBot install preflight"
  echo
  echo "Will install BanBot at $APP_DIR as locked user $APP_USER."
  echo "Will not edit nginx/firewall/domain config or publish any ports."
  echo "Will not stop, restart, prune, or remove unrelated Docker containers/images."
  echo
  if [ "${BANBOT_VERBOSE:-0}" = "1" ] && command -v ss >/dev/null 2>&1; then
    echo "Listening TCP ports:"
    ss -ltnp 2>/dev/null | sed -n '1,8p' || true
    echo
  fi
  if systemctl list-unit-files nginx.service >/dev/null 2>&1; then
    echo "nginx detected; it will not be modified or restarted."
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "Docker detected."
  else
    echo "Docker is not installed. Installing Docker can add Docker-managed iptables chains."
    echo "The BanBot compose file still publishes no ports."
  fi
  echo
  confirm "Continue with BanBot install?" || { echo "Cancelled."; exit 1; }
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi
  confirm "Docker is missing. Install Docker Engine and Compose plugin now?" || {
    echo "Install Docker manually, then rerun this installer."
    exit 1
  }
  if command -v apt-get >/dev/null 2>&1; then
    local docker_os
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    . /etc/os-release
    case "$ID" in
      ubuntu|debian) docker_os="$ID" ;;
      *) echo "Automatic Docker install supports Debian/Ubuntu. Install Docker manually, then rerun."; exit 1 ;;
    esac
    curl -fsSL "https://download.docker.com/linux/${docker_os}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${docker_os} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
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
  if dpkg -s unattended-upgrades >/dev/null 2>&1; then
    echo "unattended-upgrades already installed."
    return
  fi
  confirm "Install and enable Debian unattended security updates?" || {
    echo "Skipping unattended-upgrades."
    return
  }
  apt-get update
  apt-get install -y unattended-upgrades
  dpkg-reconfigure -f noninteractive unattended-upgrades || true
}

install_git() {
  if command -v git >/dev/null 2>&1; then
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y git
  else
    echo "git is missing and automatic install only supports apt-based Linux."
    exit 1
  fi
}

ensure_app_user() {
  local shell="/usr/sbin/nologin"
  [ -x "$shell" ] || shell="/sbin/nologin"

  if id "$APP_USER" >/dev/null 2>&1; then
    usermod --home "$APP_HOME" --shell "$shell" "$APP_USER" >/dev/null 2>&1 || true
  else
    useradd --system --create-home --home-dir "$APP_HOME" --shell "$shell" "$APP_USER"
  fi

  mkdir -p "$APP_HOME"
  chown "$APP_USER:$APP_USER" "$APP_HOME"
  chmod 750 "$APP_HOME"
}

clone_or_update_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    git config --global --add safe.directory "$APP_DIR" || true
    git -C "$APP_DIR" fetch --quiet origin
    git -C "$APP_DIR" checkout --quiet master
    git -C "$APP_DIR" pull --ff-only
  elif [ -e "$APP_DIR" ]; then
    echo "$APP_DIR exists but is not a git checkout. Move it away or set BANBOT_DIR."
    exit 1
  else
    git clone "$REPO_URL" "$APP_DIR"
  fi
}

prompt() {
  local label="$1"
  local default="${2:-}"
  local value
  if [ -n "$default" ]; then
    value="$(read_from_terminal "$label [$default]: ")"
    echo "${value:-$default}"
  else
    value="$(read_from_terminal "$label: ")"
    echo "$value"
  fi
}

require_value() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "$name cannot be empty. Cancelled."
    exit 1
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
    volumes:
      - banbot-data:/data
    init: true

volumes:
  banbot-data:
EOF
}

write_helpers() {
  if [ ! -f "$APP_DIR/update.sh" ]; then
    cat > "$APP_DIR/update.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
git pull --ff-only
docker compose pull
docker compose up -d
docker compose logs --tail=80
EOF
  fi
  if [ ! -f "$APP_DIR/status.sh" ]; then
    cat > "$APP_DIR/status.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
docker compose ps
docker compose logs --tail=80
EOF
  fi
  if [ ! -f "$APP_DIR/uninstall.sh" ]; then
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
  fi
  chmod +x "$APP_DIR/update.sh" "$APP_DIR/status.sh" "$APP_DIR/uninstall.sh"
}

write_cron() {
  cat > /etc/cron.d/discord-trap-ban-bot <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

17 4 * * * root cd "$APP_DIR" && git pull --ff-only >/var/log/discord-trap-ban-bot-update.log 2>&1 && docker compose pull >>/var/log/discord-trap-ban-bot-update.log 2>&1 && docker compose up -d >>/var/log/discord-trap-ban-bot-update.log 2>&1
EOF
  chmod 644 /etc/cron.d/discord-trap-ban-bot
}

write_env() {
  if [ -f "$APP_DIR/.env" ]; then
    echo "Existing $APP_DIR/.env found."
    confirm "Update Discord token / application ID in .env?" || {
      echo "Keeping existing $APP_DIR/.env"
      return
    }
  fi

  local token client_id
  echo
  echo "Before continuing, create the bot in the Discord Developer Portal:"
  echo "  1. Open https://discord.com/developers/applications"
  echo "  2. Select or create your BanBot application."
  echo "  3. General Information -> copy Application ID. This is the client ID."
  echo "  4. Bot -> Reset Token -> copy the real token."
  echo "  5. Bot -> Privileged Gateway Intents -> leave Presence, Server Members, and Message Content OFF."
  echo
  echo "Press Ctrl+C now if you do not have the real token and application ID yet."
  echo
  token="$(read_secret_from_terminal "Real Discord bot token from Bot -> Reset Token: ")"
  client_id="$(prompt "Application ID from General Information")"
  require_value "Discord bot token" "$token"
  require_value "Application ID" "$client_id"
  if ! [[ "$client_id" =~ ^[0-9]{17,20}$ ]]; then
    echo "Application ID must be a Discord snowflake, for example 123456789012345678."
    exit 1
  fi

  umask 077
  cat > "$APP_DIR/.env.tmp" <<EOF
# Discord bot token from the Discord Developer Portal.
DISCORD_TOKEN=$token

# Discord application client ID, used for /banbot and invite URLs.
CLIENT_ID=$client_id

# Server-specific settings are configured by a Discord admin with /banbot setup.
ACTION_MODE=dry-run
DELETE_MESSAGE_SECONDS=86400
CONFIG_PATH=/data/config.json

HEALTH_PORT=
HEALTH_HOST=127.0.0.1
EOF
  mv "$APP_DIR/.env.tmp" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
}

print_preflight
install_security_updates
install_docker
install_git
ensure_app_user
clone_or_update_repo
write_env
if [ ! -f "$APP_DIR/docker-compose.yml" ]; then
  write_compose
fi
write_helpers
write_cron
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" || true
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
echo "  $APP_DIR/status.sh"
echo "  $APP_DIR/update.sh"
echo "  $APP_DIR/uninstall.sh"
echo
echo "In Discord, run:"
echo "  /banbot setup trap_channel:#your-trap-channel"
echo "  /banbot status"
echo "Daily image updates are configured in /etc/cron.d/discord-trap-ban-bot"
docker compose logs --tail=80
