---
name: lint
description: "Check the brain for dead links, drift, and conflicts. Use right after every triage (same scheduled job), or when the user says 'lint the brain', 'check the brain', 'is the brain up to date'. Fixes the mechanical problems itself (index lines pointing to nothing, files missing from the index, dead links) and reports the judgment calls to the user (two notes that contradict, a guideline that no longer matches how they work) without changing them."
---

# Lint

A wrong note is worse than no note: the agent acts on it with full confidence. This skill keeps the brain true.

## 1. The mechanical pass (the script)

```bash
python3 skills/lint/scripts/lint.py --fix
```

It repairs index drift by itself and lists what is left. Then fix the rest:

| Problem | What you do |
|---|---|
| `index: added … (write its one-line summary)` | replace the TODO with one line on what the file is |
| `dead link in …` | find where the target moved (grep the name) and fix the link; if it is gone, remove the link |
| `no source cited: …` | add the source link; if there is none, tell the user |
| `superseded decision without …` | set `superseded_by:` to the replacing decision |
| `decision without a date` | add `date:` from the file name |
| warnings (inbox, taste) | tell the user; don't delete taste entries |

Run the script again until it prints no problems.

## 2. The judgment pass (you)

Read the notes changed recently, and the guidelines. Look for:
- **Contradictions:** two notes that claim opposite things. Add `> [!warning] Contradiction: <other note>` at the top of both. Don't pick a winner.
- **Stale facts:** a project note or guideline that no longer matches what you see in the projects.

Report these to the user in a short list. Never change their meaning yourself.

## Gotchas

- Don't "fix" a contradiction by deleting a note. Old decisions are marked superseded, never deleted.
- The script only knows structure. Two notes can both pass it and still disagree — that is why step 2 exists.
