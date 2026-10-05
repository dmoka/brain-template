#!/usr/bin/env bash
# Commit whatever changed, take the latest from the remote, push. Safe to run from cron.
# On a machine without your git login (a dev container), set BRAIN_GIT_TOKEN to a token that
# can write only this repo: sync.sh then pushes over HTTPS with it and never saves it in .git/config.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
brain="$(pwd -P)"

# A folder mounted from another machine belongs to another user: trust it for this run only.
git=(git -c safe.directory="$brain")
# A machine with no git identity (a fresh container) still commits, as "brain sync".
if [ -z "$("${git[@]}" config user.email || true)" ]; then
  git+=(-c user.name="brain sync" -c user.email="brain-sync@localhost")
fi
if [ -n "${BRAIN_GIT_TOKEN:-}" ]; then
  # The helper reads the token from the environment, so it never lands in a file or in ps output.
  git+=(-c credential.helper=
        -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$BRAIN_GIT_TOKEN"; }; f'
        -c url.https://github.com/.insteadOf=git@github.com:
        -c url.https://github.com/.insteadOf=ssh://git@github.com/)
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
