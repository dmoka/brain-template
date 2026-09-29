#!/usr/bin/env bash
# Connect this brain to Claude Code on this machine. Safe to run again.
#  1. links the brain's skills into ~/.claude/skills
#  2. adds one pointer line to your global ~/.claude/CLAUDE.md
set -euo pipefail
BRAIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
mkdir -p "$CLAUDE_DIR/skills"

for skill in "$BRAIN"/skills/*/; do
  name="$(basename "$skill")"
  link="$CLAUDE_DIR/skills/$name"
  if [ -L "$link" ]; then
    ln -sfn "${skill%/}" "$link"; echo "skill $name: link ok"
  elif [ -e "$link" ]; then
    echo "skill $name: $link exists and is not a link, left it alone"
  else
    ln -s "${skill%/}" "$link"; echo "skill $name: linked"
  fi
done

POINTER="My second brain is at $BRAIN. Read its index.md first, then grep it, before you search anywhere else, and save new decisions, guidelines and gotchas there (see its AGENTS.md)."
touch "$CLAUDE_DIR/CLAUDE.md"
if grep -qF "My second brain is at $BRAIN." "$CLAUDE_DIR/CLAUDE.md"; then
  echo "pointer line: already in $CLAUDE_DIR/CLAUDE.md"
else
  printf '\n%s\n' "$POINTER" >> "$CLAUDE_DIR/CLAUDE.md"; echo "pointer line: added to $CLAUDE_DIR/CLAUDE.md"
fi
