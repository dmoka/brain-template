#!/usr/bin/env bash
# Commit whatever changed, take the latest from the remote, push. Safe to run from cron.
# On a machine without your git login (a dev container), set BRAIN_SSH_KEY to a deploy key that
# can write only this repo: sync.sh uses it for its own git commands, never in any git config.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
brain="$(pwd -P)"

# A folder mounted from another machine belongs to another user: trust it for this run only.
git=(git -c safe.directory="$brain")
# A machine with no git identity (a fresh container) still commits, as "brain sync".
if [ -z "$("${git[@]}" config user.email || true)" ]; then
  git+=(-c user.name="brain sync" -c user.email="brain-sync@localhost")
fi
if [ -n "${BRAIN_SSH_KEY:-}" ]; then
  export GIT_SSH_COMMAND="ssh -i $BRAIN_SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

# An agent and a cron job can run it at the same time: one sync at a time.
lock="$("${git[@]}" rev-parse --git-dir)/brain-sync.lock"
if ! mkdir "$lock" 2>/dev/null; then
  echo "another sync is running (or one crashed: remove $lock and run again)" >&2
  exit 1
fi
trap 'rmdir "$lock"' EXIT

"${git[@]}" add -A
"${git[@]}" diff --cached --quiet || "${git[@]}" commit -q -m "brain: sync $(date -u +%Y-%m-%dT%H:%MZ)"
if "${git[@]}" remote get-url origin >/dev/null 2>&1; then
  if ! "${git[@]}" pull -q --rebase --autostash || ! "${git[@]}" push -q; then
    echo "brain committed here, but NOT pushed (see the error above)." >&2
    [ ! -d "$("${git[@]}" rev-parse --git-path rebase-merge)" ] ||
      echo "a rebase stopped on a conflict: fix it (git status), or undo it with git rebase --abort" >&2
    exit 1
  fi
fi
echo "brain synced"
