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
- **Codex:** add the same pointer line to its global AGENTS.md:
  ```bash
  printf '\n%s\n' "My second brain is at $HOME/brain. Read its index.md first, then grep it, before you search anywhere else, and save new decisions, guidelines and gotchas there (see its AGENTS.md)." >> ~/.codex/AGENTS.md
  ```
- **Any other agent that reads AGENTS.md** (Cursor, …): point it at `<path>/index.md` the same way.
- **A dev container** (like the course's TicketBay box): see [In a dev container](#in-a-dev-container).
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

## In a dev container

A dev container sees only its own project, so it mounts the brain folder from your laptop, read
and write. The course's TicketBay box does this: it mounts `~/brain` at `/home/node/brain`,
and runs `install.sh` there every time it starts (`CLAUDE_DIR=/home/node/.claude`), so Claude
Code in the box gets the pointer line and the skills. No brain yet? The box creates an empty
`~/brain` and starts without one.

The box pushes the brain itself, with its own token. Its firewall blocks SSH, so it pushes over
HTTPS with a GitHub token that can write only your brain repo; nothing in the box can push to
your other repos with it.

🙋 **Create the token (once, about 2 minutes):**
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → your brain repo. Nothing else.
3. Permissions → Repository permissions → **Contents: Read and write**. Leave every other permission at "No access" (GitHub adds Metadata: read-only itself).
4. Pick an expiry (90 days is fine), generate, copy the token.
5. Save it in a file outside the brain, readable only by you:
   ```bash
   mkdir -p ~/.config/brain && printf 'BRAIN_GIT_TOKEN=%s\n' 'github_pat_…' > ~/.config/brain/box.env && chmod 600 ~/.config/brain/box.env
   ```
   The box reads the file when it is created: if it is already running, remove it and start it again
   (TicketBay: `.devcontainer/README.md`, "The brain in the box").

Never put the token in the brain folder (the box commits that folder) or in `.git/config` (the
laptop and the box share it). `sync.sh` reads it from the environment only.

Two things to know:
- The laptop and the box edit the same folder. `./sync.sh` in the box also commits what you
  changed on the laptop and haven't synced yet. One sync runs at a time (`.git/brain-sync.lock`).
- No token? `./sync.sh` still commits in the box, says it did not push, and exits 1. Run
  `./sync.sh` on the laptop to push.

## Rules worth knowing

- Keep it **private**: it's your knowledge. Never put secrets in it.
- When in doubt, don't create a note. A junk note costs every agent that reads the brain.
- `sources/` is evidence and never edited; everything else is interpretation and links back to it.

MIT license.

Last verified: 2026-09-29 with Claude Code 2.1.284 (fresh copy in a node:22 container: install, capture, triage, lint)
