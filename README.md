# Brain template

A second brain for your coding agents: one git repo with the knowledge that applies to every
project, read by every agent you run. From the AI Agent Engineer course, module 5.

Project-specific knowledge stays in each project (its AGENTS.md and skills). This repo holds
what's true everywhere: your guidelines, your taste, your decisions, a short file per project,
and the three skills that keep it filled and true.

## What's inside

| Path | What it holds |
|---|---|
| `index.md` | one line per file; agents read it first |
| `taste.md` | what good means to you: never, prefer, tie-breakers — each with a reason and a date |
| `intents/` | what you want: one goal per file, with why and how you'll know it's met |
| `inbox/` | new things land here; triage empties it |
| `guidelines/` | how you build in every project |
| `decisions/` | one per file, dated; changed ones are marked superseded, never deleted |
| `projects/` | one short admin file per project |
| `notes/` | everything else worth keeping, each with its source |
| `sources/` | the originals; never edited |
| `skills/capture` | "save this" → one file in `inbox/` |
| `skills/triage` | files each inbox item in one home, links its source, empties the inbox |
| `skills/lint` | fixes index drift and dead links, reports contradictions |
| `AGENTS.md` | the rules every agent follows in this repo |

The sample files show the shape. Replace them with your own, or delete them.

## Start

1. **Use this template** on GitHub → create a **private** repo, then clone it, e.g. to `~/brain`.
2. Connect it to Claude Code on this machine:
   ```bash
   cd ~/brain && ./install.sh
   ```
   It links the three skills into `~/.claude/skills` and adds one line to your global `~/.claude/CLAUDE.md`:
   > My second brain is at ~/brain. Read its index.md first, then grep it, before you search anywhere else, and save new decisions, guidelines and gotchas there (see its AGENTS.md).

   Run it again any time; it doesn't duplicate anything.

## Connect other agents

- **Another machine:** clone the repo, run `./install.sh` there.
- **Hermes:** clone the repo on the box, add one line to `~/.hermes/SOUL.md`
  (`Before you answer about my work, read <path>/index.md first.`) and add
  `<path>/skills` to `skills.external_dirs` in `~/.hermes/config.yaml`.
- **Any agent that reads AGENTS.md** (Codex, Cursor, …): point it at `<path>/index.md` the same way.
- **An agent that can't clone** (a chat app): serve the brain through an MCP server (module 6).

## Use it

- **Save something:** tell any agent "save this" with a link, a snippet, or a screenshot.
- **Sort it:** "process my inbox" runs triage, then lint. Or schedule it once a day:
  - Claude Code routine: `/schedule` → daily, prompt "Run the triage skill, then the lint skill, then ./sync.sh" on this repo.
  - Hermes: `hermes cron create "0 6 * * *" "Run triage, then lint, then ./sync.sh" --skill triage --skill lint --workdir <path>`.
- **Keep it true:** "lint the brain" any time; it also runs after every triage.

## Sync

The brain is a git repo, and every agent reads the latest version:
```bash
./sync.sh   # commit what changed, pull --rebase, push
```
Agents run it after they change the brain (AGENTS.md says so). For a machine that edits the
brain without you, add a cron line: `*/15 * * * * cd ~/brain && ./sync.sh`.

## Rules worth knowing

- Keep it **private**: it's your knowledge. Never put secrets in it.
- When in doubt, don't create a note. A junk note costs every agent that reads the brain.
- `sources/` is evidence and never edited; everything else is interpretation and links back to it.

MIT license.

Last verified: 2026-09-29 with Claude Code 2.1.284 (fresh copy in a node:22 container: install, capture, triage, lint)
