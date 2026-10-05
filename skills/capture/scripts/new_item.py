#!/usr/bin/env python3
"""Create one inbox item with correct frontmatter. Content comes from stdin (optional) or from --body-file.

Usage: echo "text" | python3 skills/capture/scripts/new_item.py --title "short title" \
         --source <url|pasted|conversation> [--note "why it matters"] [--fetch ok|blocked|text-only]
       python3 skills/capture/scripts/new_item.py --title "short title" \
         --source-file inbox/.source [--body-file inbox/.body] [--note "…"] [--fetch …]
The second form keeps URLs out of the command line: some setups block every shell command with a URL in it
(a dev container's network guard does). --source-file reads the source from the file's first line,
--body-file reads the content. Both files are deleted after the item is written when they sit in inbox/.
Prints the path of the new file.
"""
import argparse, re, sys
from datetime import datetime, timezone
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--title", required=True)
src = ap.add_mutually_exclusive_group(required=True)
src.add_argument("--source")
src.add_argument("--source-file")
ap.add_argument("--body-file")
ap.add_argument("--note", default="")
ap.add_argument("--fetch", default="text-only", choices=["ok", "blocked", "text-only"])
ap.add_argument("--by", default="agent")
ap.add_argument("--root", default=str(Path(__file__).resolve().parents[3]))
a = ap.parse_args()

root = Path(a.root)
inbox = root / "inbox"
read = []                                          # draft files to delete after the item is written


def draft(name):
    p = Path(name)
    p = p if p.is_absolute() else Path.cwd() / p
    if not p.exists() and not Path(name).is_absolute():
        p = root / name                           # "inbox/.source" from the brain's root, wherever the shell is
    read.append(p)
    return p.read_text(encoding="utf-8")


if a.source_file:
    source = (draft(a.source_file).strip().splitlines() or [""])[0].strip()
    if not source:
        sys.exit(f"new_item: {a.source_file} is empty")
else:
    source = a.source
if a.body_file:
    body = draft(a.body_file).strip()
else:
    body = "" if sys.stdin.isatty() else sys.stdin.read().strip()

now = datetime.now(timezone.utc)
slug = re.sub(r"[^a-z0-9]+", "-", a.title.lower()).strip("-")[:60] or "item"
path = inbox / f"{now:%Y-%m-%d}-{slug}.md"
n = 2
while path.exists():
    path = inbox / f"{now:%Y-%m-%d}-{slug}-{n}.md"; n += 1
note = a.note.replace('"', "'")
path.write_text(
    f"---\nsource: {source}\ncaptured_at: {now:%Y-%m-%dT%H:%M:%SZ}\ncaptured_by: {a.by}\n"
    f'note: "{note}"\nfetch: {a.fetch}\n---\n\n{body or source}\n',
    encoding="utf-8",
)
for p in read:
    if p.resolve().parent == inbox.resolve():
        p.unlink(missing_ok=True)
print(path.relative_to(root))
