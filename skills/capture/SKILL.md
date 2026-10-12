---
name: capture
description: "Save a link, snippet, or decision into the brain inbox. Use when the user says 'save this', 'remember this', 'note this decision', forwards a link, screenshot or pasted text, or at the end of a session when a decision was made or a gotcha was found. Also use when the user corrects you with a reason ('no, do it this way, because…'): that becomes a taste entry. Fast and dumb: one file into inbox/, no sorting — triage does the thinking later."
---

# Capture

Capture is fast and dumb. It writes one file into `inbox/`, runs `node sync.mjs`, and stops. It never sorts, summarizes into notes, or edits existing notes — that is triage's job.

## Save something

1. If it is a URL, try to fetch the text. If the page is blocked (login walls are common), keep the URL and the user's words and set `--fetch blocked`. Never fail a capture because a fetch failed.
2. Create the item with the script, content on stdin:
   ```bash
   echo "<fetched or pasted text>" | python3 skills/capture/scripts/new_item.py \
     --title "<short title>" --source "<url | pasted | conversation>" --note "<the user's reason, verbatim>"
   ```
   A link, or text with a URL in it: keep the URL out of the command line (a dev container blocks every shell command with a URL in it). Write the URL to `inbox/.source` and the text to `inbox/.body` with your file tool, then run:
   ```bash
   python3 skills/capture/scripts/new_item.py --title "<short title>" \
     --source-file inbox/.source --body-file inbox/.body --note "<the user's reason, verbatim>"
   ```
   The script deletes both draft files after it writes the item.
3. Run `node sync.mjs` from the brain folder. It commits the new item, pulls, and pushes.
4. Reply in one line: `saved to inbox (<path>)`. If sync.mjs says "NOT pushed", add that to the reply.

## Capture on your own

At the end of a session, capture what would otherwise be lost: a decision and its reason, or a gotcha you ran into. Use `--source conversation` and write the outcome, not a transcript.

## Taste entries

When the user corrects you with a reason, append one line to `taste.md` in the right section:
`- <the rule> — because <their reason> (YYYY-MM-DD)`. Use their words.
No reason given? Ask one question ("why?") first. No reason, no entry.
Then run `node sync.mjs` from the brain folder.

## Gotchas

- Don't create notes or edit the index here. Everything goes through `inbox/`, so nothing skips triage.
- Don't paste secrets or other people's personal data into the brain, even when the user forwards them. Keep the link, drop the secret.
- Screenshots: save the image file into `inbox/` next to the item and describe what it shows in the item's text.
