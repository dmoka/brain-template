#!/usr/bin/env python3
"""Create one inbox item with correct frontmatter. Content comes from stdin (optional).

Usage: echo "text" | python3 skills/capture/scripts/new_item.py --title "short title" \
         --source <url|pasted|conversation> [--note "why it matters"] [--fetch ok|blocked|text-only]
Prints the path of the new file.
"""
import argparse, re, sys
from datetime import datetime, timezone
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--title", required=True)
ap.add_argument("--source", required=True)
ap.add_argument("--note", default="")
ap.add_argument("--fetch", default="text-only", choices=["ok", "blocked", "text-only"])
ap.add_argument("--by", default="agent")
ap.add_argument("--root", default=str(Path(__file__).resolve().parents[3]))
a = ap.parse_args()

now = datetime.now(timezone.utc)
slug = re.sub(r"[^a-z0-9]+", "-", a.title.lower()).strip("-")[:60] or "item"
inbox = Path(a.root) / "inbox"
path = inbox / f"{now:%Y-%m-%d}-{slug}.md"
n = 2
while path.exists():
    path = inbox / f"{now:%Y-%m-%d}-{slug}-{n}.md"; n += 1
body = "" if sys.stdin.isatty() else sys.stdin.read().strip()
note = a.note.replace('"', "'")
path.write_text(
    f"---\nsource: {a.source}\ncaptured_at: {now:%Y-%m-%dT%H:%M:%SZ}\ncaptured_by: {a.by}\n"
    f'note: "{note}"\nfetch: {a.fetch}\n---\n\n{body or a.source}\n',
    encoding="utf-8",
)
print(path.relative_to(a.root))
