#!/usr/bin/env python3
"""Deterministic brain lint. Finds the mechanical problems; the agent handles judgment.

Usage: python3 skills/lint/scripts/lint.py [--fix] [--root PATH]
  --fix   repair index drift: add files missing from index.md, drop index lines that point to nothing.
Exit 0 = clean (warnings allowed), 1 = problems left.
"""
import argparse, re, sys
from datetime import datetime, timezone
from pathlib import Path

FOLDERS = {"guidelines": "Guidelines", "decisions": "Decisions", "projects": "Projects", "notes": "Notes"}
NEEDS_SOURCE = ("notes", "guidelines")
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+?)(?:#[^)]*)?\)")
TASTE_MAX = 150


def rel_links(text):
    for target in LINK.findall(text):
        if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
            continue
        yield target


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}
    out = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


def title_of(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[3]))
    a = ap.parse_args()
    root = Path(a.root).resolve()
    index = root / "index.md"
    if not index.exists():
        print(f"no index.md in {root}"); return 1

    content = sorted(p for f in FOLDERS for p in (root / f).glob("*.md") if p.name != "README.md")
    fixed, errors, warnings = [], [], []

    # 1. index drift: lines that point to nothing, files missing from the index
    lines = index.read_text(encoding="utf-8").splitlines()
    listed, keep = set(), []
    for line in lines:
        targets = list(rel_links(line))
        dead = [t for t in targets if not (root / t).exists()]
        if targets and dead:
            if a.fix:
                fixed.append(f"index: removed line pointing to nothing: {dead[0]}")
                continue
            errors.append(f"index: line points to nothing: {dead[0]}")
        for t in targets:
            listed.add((root / t).resolve())
        keep.append(line)
    missing = [p for p in content if p.resolve() not in listed]
    for p in missing:
        rel = p.relative_to(root).as_posix()
        if a.fix:
            section = f"## {FOLDERS[p.parent.name]}"
            entry = f"- [{title_of(p)}]({rel}) — TODO: one line on what it is"
            if section in keep:
                i = keep.index(section) + 1
                while i < len(keep) and keep[i].startswith("- "):
                    i += 1
                keep.insert(i, entry)
            else:
                keep += ["", section, entry]
            fixed.append(f"index: added {rel} (write its one-line summary)")
        else:
            errors.append(f"not in index: {rel}")
    if a.fix and fixed:
        index.write_text("\n".join(keep) + "\n", encoding="utf-8")

    # 2. dead links inside the brain's own files
    scan = content + [root / "taste.md", root / "AGENTS.md"] + sorted(root.glob("*/README.md"))
    for p in scan:
        if not p.exists():
            continue
        for t in rel_links(p.read_text(encoding="utf-8")):
            if not (p.parent / t).exists() and not (root / t).exists():
                errors.append(f"dead link in {p.relative_to(root).as_posix()}: {t}")

    # 3. notes and guidelines must cite their source
    for p in content:
        if p.parent.name in NEEDS_SOURCE:
            text = p.read_text(encoding="utf-8")
            if "sources/" not in text and not re.search(r"https?://", text):
                errors.append(f"no source cited: {p.relative_to(root).as_posix()}")

    # 4. decisions: a date, and superseded ones point to their replacement
    for p in (root / "decisions").glob("*.md"):
        if p.name == "README.md":
            continue
        fm = frontmatter(p.read_text(encoding="utf-8"))
        rel = p.relative_to(root).as_posix()
        if not fm.get("date"):
            errors.append(f"decision without a date: {rel}")
        if fm.get("status") == "superseded":
            by = fm.get("superseded_by", "")
            if not by or not (root / by).exists():
                errors.append(f"superseded decision without an existing superseded_by: {rel}")

    # 5. inbox should be empty after triage
    pending = [p.name for p in (root / "inbox").glob("*") if p.name not in ("README.md", ".gitkeep")]
    if pending:
        warnings.append(f"inbox has {len(pending)} item(s) waiting for triage")

    # 6. taste stays short, every entry has a reason and a date
    taste = root / "taste.md"
    if taste.exists():
        tl = taste.read_text(encoding="utf-8").splitlines()
        if len(tl) > TASTE_MAX:
            warnings.append(f"taste.md has {len(tl)} lines (keep it under {TASTE_MAX})")
        for line in tl:
            if line.startswith("- ") and not ("because" in line and re.search(r"\(\d{4}-\d{2}-\d{2}\)", line)):
                warnings.append(f"taste entry without 'because' or a (YYYY-MM-DD) date: {line[:70]}")

    for title, items in (("Fixed", fixed), ("Problems", errors), ("Warnings", warnings)):
        if items:
            print(f"{title}:")
            for i in items:
                print(f"  - {i}")
    if not (fixed or errors or warnings):
        print("brain lint: clean")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
