---
source: pasted
captured_at: 2026-01-18T14:00:00Z
captured_by: you
note: "example source for the sample guideline"
fetch: text-only
---

Example source text: a refactor renamed one private helper and moved a function to another
module. No behavior changed, and 14 tests failed, because they asserted which internal
function was called and mocked the project's own modules.
