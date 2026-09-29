#!/usr/bin/env bash
# Commit whatever changed, take the latest from the remote, push. Safe to run from cron.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
git add -A
git diff --cached --quiet || git commit -q -m "brain: sync $(date -u +%Y-%m-%dT%H:%MZ)"
if git remote get-url origin >/dev/null 2>&1; then
  git pull -q --rebase --autostash
  git push -q
fi
echo "brain synced"
