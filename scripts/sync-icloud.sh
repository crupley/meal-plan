#!/bin/sh
# Two-way sync between recipes/ and the iCloud Drive folder the Cooklang
# iPhone app reads.
#
# The git repository stays outside iCloud Drive (iCloud corrupts .git folders).
# Each run:
#   1. pulls the latest recipes from GitHub,
#   2. brings .cook files that were added or edited in the iCloud folder into
#      recipes/, commits them and pushes,
#   3. mirrors recipes/ and config/ to the iCloud folder.
#
# A copy of what was last synced is kept in .git/icloud-sync so the script can
# tell which side changed. If a recipe changed on both sides it is left alone
# on both and reported. Deleting a recipe only works from the repository;
# config/ is copied one way, repository to iCloud.
#
# Usage: scripts/sync-icloud.sh [destination]
set -eu

repo="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Recipes}"

if [ ! -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ] && [ $# -eq 0 ]; then
  echo "iCloud Drive not found. Turn it on in System Settings, or pass a destination." >&2
  exit 1
fi

base="$(cd "$repo" && git rev-parse --absolute-git-dir)/icloud-sync"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
: > "$work/imported"
: > "$work/conflicts"
mkdir -p "$dest/config" "$base"

git -C "$repo" pull --ff-only --quiet || echo "git pull skipped (offline or local changes)" >&2

# True when git has already stored exactly this content, i.e. the file is a
# leftover copy of something committed earlier rather than new work.
known_to_git() {
  git -C "$repo" cat-file -e "$(git -C "$repo" hash-object "$1")" 2>/dev/null
}

import() {
  mkdir -p "$(dirname "$repo/recipes/$1")"
  cp -p "$dest/$1" "$repo/recipes/$1"
  echo "$1" >> "$work/imported"
}

# 2. iCloud -> repository
(cd "$dest" && find . -name '*.cook' -not -path './config/*' -not -name '.*') |
  sed 's|^\./||' > "$work/found"
while IFS= read -r rel; do
  theirs="$dest/$rel" mine="$repo/recipes/$rel" last="$base/$rel"
  if [ -e "$mine" ] && cmp -s "$theirs" "$mine"; then
    continue                                  # same on both sides
  elif [ -e "$last" ] && cmp -s "$theirs" "$last"; then
    continue                                  # only the repository changed
  elif known_to_git "$theirs"; then
    continue                                  # old copy; the mirror replaces it
  elif [ ! -e "$mine" ] && [ ! -e "$last" ]; then
    import "$rel"                             # new in iCloud
  elif [ -e "$mine" ] && [ -e "$last" ] && cmp -s "$mine" "$last"; then
    import "$rel"                             # edited in iCloud
  else
    echo "$rel" >> "$work/conflicts"          # changed on both sides
  fi
done < "$work/found"

if [ -s "$work/imported" ]; then
  count="$(wc -l < "$work/imported" | tr -d ' ')"
  (
    cd "$repo/recipes"
    tr '\n' '\0' < "$work/imported" | xargs -0 git add --
    tr '\n' '\0' < "$work/imported" |
      xargs -0 git commit --quiet -m "Add $count recipe(s) from iCloud" --
  )
  echo "Brought in from iCloud:"
  sed 's/^/  /' "$work/imported"
  git -C "$repo" push --quiet ||
    echo "git push failed; the new recipes are committed locally, push them later" >&2
fi

# 3. repository -> iCloud. Conflicted recipes are skipped on both sides and
# stay out of the last-synced copy, so they are reported until resolved.
sed 's|^|/|' "$work/conflicts" > "$work/exclude"
rsync -a --delete --exclude-from "$work/exclude" --exclude /config \
  --exclude .DS_Store --exclude '.*.icloud' "$repo/recipes/" "$dest/"
rsync -a --delete --exclude .DS_Store --exclude '.*.icloud' "$repo/config/" "$dest/config/"
rsync -a --delete --exclude-from "$work/exclude" --exclude .DS_Store "$repo/recipes/" "$base/"

echo "Synced $(find "$repo/recipes" -name '*.cook' | wc -l | tr -d ' ') recipes with $dest"
if [ -s "$work/conflicts" ]; then
  echo "Changed in both the repository and iCloud, left untouched on both sides:" >&2
  sed 's/^/  /' "$work/conflicts" >&2
  echo "Make the two copies identical (keep whichever you want) and run this again." >&2
  exit 2
fi
