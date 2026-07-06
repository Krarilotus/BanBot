#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
echo "This will stop and remove the bot container. Config stays in .env."
read -r -p "Type uninstall to continue: " confirm
[ "$confirm" = "uninstall" ] || { echo "Cancelled."; exit 1; }
docker compose down
echo "Container removed. Config remains in $(pwd)/.env"
