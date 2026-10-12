#!/bin/sh
# Copy the recipes to iCloud Drive so the Cooklang iPhone app can read them.
#
# The git repository stays outside iCloud Drive (iCloud corrupts .git folders);
# this pulls the latest recipes from GitHub and mirrors recipes/ and config/
# into an iCloud folder. Changes flow one way: edit recipes in the repository,
# not in the iCloud copy.
#
# Usage: scripts/sync-icloud.sh [destination]
set -eu

repo="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Recipes}"

if [ ! -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ] && [ $# -eq 0 ]; then
  echo "iCloud Drive not found. Turn it on in System Settings, or pass a destination." >&2
  exit 1
fi

git -C "$repo" pull --ff-only --quiet || echo "git pull skipped (offline or local changes)" >&2

mkdir -p "$dest/config"
rsync -a --delete --exclude config --exclude .DS_Store "$repo/recipes/" "$dest/"
rsync -a --delete --exclude .DS_Store "$repo/config/" "$dest/config/"

echo "Synced $(find "$dest" -name '*.cook' | wc -l | tr -d ' ') recipes to $dest"
