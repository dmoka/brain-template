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

A dev container sees only its own project, so it keeps its own copy of the brain, cloned from
your brain repo. The course's TicketBay box does this: it clones the brain into its own volume
(`/home/node/brain`) the first time it starts, pulls it every time after that, and runs
`install.sh` there (`CLAUDE_DIR=/home/node/.claude`), so Claude Code in the box gets the pointer
line and the skills. It never mounts the brain folder on your laptop, so nothing in the box can
change the files your laptop runs. No brain set up? The box starts without one.

The box pushes the brain itself, with its own deploy key: an SSH key that GitHub accepts for your
brain repo only, so nothing in the box can push to your other repos with it. In the box,
`./sync.sh` commits and pushes; your laptop gets the box's changes at its next pull (`./sync.sh`).

🙋 **Give the box its deploy key (once, about 2 minutes):**
1. Make a key pair just for the box, with no passphrase, and name your brain repo:
   ```bash
   mkdir -p ~/.config/brain && chmod 700 ~/.config/brain
   ssh-keygen -t ed25519 -N "" -C "brain box" -f ~/.config/brain/box_deploy_key
   echo 'BRAIN_REPO=git@github.com:<you>/brain.git' > ~/.config/brain/box.env
   ```
2. GitHub → your brain repo → Settings → **Deploy keys** → **Add deploy key**. Paste the contents
   of `~/.config/brain/box_deploy_key.pub`, tick **Allow write access**, and add it.
3. The box reads the folder when it is created: if it is already running, remove it and start it
   again (TicketBay: `.devcontainer/README.md`, "The brain in the box").

The box mounts `~/.config/brain` read-only. `sync.sh` uses the key only for its own git commands
(`BRAIN_SSH_KEY`), never in a git config. Never put the private key in the brain: it is a git repo.

## Rules worth knowing

- Keep it **private**: it's your knowledge. Never put secrets in it.
- When in doubt, don't create a note. A junk note costs every agent that reads the brain.
- `sources/` is evidence and never edited; everything else is interpretation and links back to it.

MIT license.

Last verified: 2026-10-05 with Claude Code 2.1.284 (fresh copy in a node:22 container: install twice, lint clean, sync.sh against a local bare remote with no git identity, an unreachable remote, a held lock, a folder owned by another user)
