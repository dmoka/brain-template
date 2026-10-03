---
name: triage
description: "Sort the brain inbox: file each item, then empty it. Use when the user says 'process my inbox', 'triage', 'sort the brain', or on the scheduled daily job. Files every inbox item in exactly one home (guideline, decision, project note, or general note) with a link to its source, moves the original to sources/, updates index.md, and ends with an empty inbox. Runs the lint skill right after."
---

# Triage

Triage does the thinking capture skipped. Read `AGENTS.md` and `taste.md` first.

## For each item in `inbox/` (skip README.md)

1. Read it. Pick exactly **one** home:

   | Home | When | Example |
   |---|---|---|
   | `intents/<goal>.md` | something you want to reach, with why and how you'll know it's met | "the example app takes its first payment" |
   | `guidelines/<topic>.md` | how you build in every project | "integration tests use a real database" |
   | `decisions/YYYY-MM-DD-<topic>.md` | a choice with a date and a reason | "Postgres is the default database" |
   | `projects/<name>.md` | a fact about one project's admin: where it runs, status, owner | "the app moved to a new server" |
   | `notes/<topic>.md` | anything else worth keeping, including good agent answers | a comparison, a technique |
   | none | not worth a note | a mildly interesting link |

2. **When in doubt, don't create a note.** Prefer extending an existing note over a new one. Grep first.
3. Write or extend the note in a few lines: the insight, why it matters, and a link to the source (`../sources/<file>.md`). Don't dump the raw text.
4. Move the original, unchanged: `git mv inbox/<file> sources/<file>` (also for "none" items, so nothing is lost).
5. Add or update the note's line in `index.md`, in its folder's section: `- [Title](path) — one line on what it is`.
6. A decision that replaces an older one: follow `decisions/README.md` (the old one gets `status: superseded` and `superseded_by:`). Never delete it.

## Finish

- The inbox holds only its README.
- Run the lint skill.
- Run `./sync.sh`.

## Gotchas

- Never edit a file in `sources/`. Notes point to it; it must stay the original.
- A project-specific rule (how one repo is built) does not belong here. Tell the user it goes into that project's AGENTS.md.
- One item can mention three topics. Still one home: file it where it compounds most, and link from the others only if the link is real.
