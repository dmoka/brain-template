// Tests for skills/lint/scripts/lint.py on a small brain in a temporary folder. Run: node --test
// Needs Python 3 (python3 or python on the PATH); without it the tests are skipped.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lintScript = path.join(repo, "skills", "lint", "scripts", "lint.py");
const python = ["python3", "python"].find(
  (cmd) => spawnSync(cmd, ["-c", "import sys; sys.exit(sys.version_info[0] != 3)"]).status === 0,
);
const needsPython = { skip: !python && "no Python 3 on the PATH" };

// A brain with the given files (path → text); index.md lists every one of them.
function brain(files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "brain-lint-")));
  const index = ["# Index"];
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
    index.push(`- [${rel}](${rel}) — test file`);
  }
  fs.writeFileSync(path.join(root, "index.md"), index.join("\n") + "\n");
  return root;
}

function lint(root) {
  const r = spawnSync(python, [lintScript, "--root", root], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

test("the template itself has no lint problems", needsPython, () => {
  const r = lint(repo);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Problems:/);
});

test("a guideline with `source: own` in its front matter passes", needsPython, () => {
  const r = lint(brain({ "guidelines/use-pnpm.md": "---\nsource: own\n---\n# Use pnpm, never npm\n" }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /brain lint: clean/);
});

test("`source: own` passes in notes too, in any case and in quotes", needsPython, () => {
  const r = lint(brain({
    "notes/a.md": "---\ntitle: A\nsource: Own\n---\n# A\n",
    "notes/b.md": "---\nsource: \"OWN\"\n---\n# B\n",
  }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /brain lint: clean/);
});

test("a guideline with no source still fails", needsPython, () => {
  const r = lint(brain({ "guidelines/use-pnpm.md": "# Use pnpm, never npm\n" }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no source cited: guidelines\/use-pnpm\.md/);
});

test("`source: own` outside the front matter does not count", needsPython, () => {
  const r = lint(brain({ "guidelines/use-pnpm.md": "# Use pnpm, never npm\n\nsource: own\n" }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no source cited: guidelines\/use-pnpm\.md/);
});

test("another front-matter source value does not count", needsPython, () => {
  const r = lint(brain({ "guidelines/use-pnpm.md": "---\nsource: someone\n---\n# Use pnpm, never npm\n" }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no source cited: guidelines\/use-pnpm\.md/);
});
