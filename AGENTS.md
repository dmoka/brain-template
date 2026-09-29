# AGENTS.md — rules for this brain

This repo is a second brain: knowledge that applies to every project. Project-specific
knowledge stays in each project's own AGENTS.md and skills, never here.

## Read

- Read `index.md` first. It lists every note in one line each. Then grep for details.
- Read `taste.md` before you judge or create anything: it says what good means here.
- `sources/` holds originals (links, pasted text, files). They are evidence, never edited.
  Everything else is interpretation of them.

## Write

- New things go to `inbox/` first, with the capture skill. Only triage files them.
- One topic per file. File names: kebab-case, decisions and inbox items start with the date (`YYYY-MM-DD-`).
- Every note links the source it came from (`sources/…` or a URL).
- Every file you add gets one line in `index.md`, in its folder's section.
- A changed decision is never deleted: mark the old one `status: superseded`,
  set `superseded_by:` to the new file, and link back from the new one.
- When in doubt, don't create the note. A missing note can be written later; a junk note costs every agent.
- Never store secrets: no keys, tokens, passwords, or personal data of others.

## Finish

- Run the lint (`python3 skills/lint/scripts/lint.py`) after you change more than one file.
- Always leave the repo pushed: `./sync.sh` (commit, pull --rebase, push).
