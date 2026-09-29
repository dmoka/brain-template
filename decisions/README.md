# decisions/

One decision per file, named `YYYY-MM-DD-slug.md`, with the date and the reason.

A decision is never deleted. When it changes:
1. write the new decision as a new file,
2. in the old file set `status: superseded` and `superseded_by: decisions/<new file>.md`,
3. in the new file add `supersedes: decisions/<old file>.md`.

The lint checks that every superseded decision points to a file that exists.
