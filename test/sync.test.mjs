// Tests for sync.mjs against a local bare remote. Run: node --test
// Each test copies sync.mjs into a fresh brain repo in a temporary folder; no git identity, no
// global or system git config, so it behaves like a fresh container.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const syncScript = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "sync.mjs");
const posixOnly = { skip: process.platform === "win32" && "uses a POSIX shell for the fake ssh" };

function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "brain-sync-")));
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    GIT_CONFIG_GLOBAL: path.join(root, "empty-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, "");
  const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, env, encoding: "utf8" }).trim();
  const remote = path.join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const brain = path.join(root, "brain");
  git(root, "init", "-q", "-b", "main", brain);
  fs.copyFileSync(syncScript, path.join(brain, "sync.mjs"));
  fs.writeFileSync(path.join(brain, "index.md"), "# Index\n");
  git(brain, "add", "-A");
  git(brain, "commit", "-q", "-m", "start");
  git(brain, "remote", "add", "origin", remote);
  git(brain, "push", "-q", "-u", "origin", "main");
  const sync = (extra = {}) => {
    const r = spawnSync(process.execPath, ["sync.mjs"], { cwd: brain, env: { ...env, ...extra }, encoding: "utf8" });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { root, env, git, remote, brain, sync };
}

test("no git identity: commits as brain sync and pushes", () => {
  const { brain, remote, git, sync } = setup();
  fs.writeFileSync(path.join(brain, "note.md"), "new\n");
  const r = sync();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /brain synced/);
  assert.equal(git(remote, "log", "-1", "--format=%an <%ae>|%s").split("|")[0], "brain sync <brain-sync@localhost>");
  assert.match(git(remote, "log", "-1", "--format=%s"), /^brain: sync \d{4}-\d\d-\d\dT\d\d:\d\dZ$/);
  assert.equal(git(remote, "show", "main:note.md"), "new");
});

test("nothing changed: no new commit, still synced", () => {
  const { brain, git, sync } = setup();
  const before = git(brain, "rev-parse", "HEAD");
  const r = sync();
  assert.equal(r.code, 0, r.out);
  assert.equal(git(brain, "rev-parse", "HEAD"), before);
});

test("takes the other machine's changes first (pull --rebase), keeps both", () => {
  const { root, brain, remote, git, sync } = setup();
  const other = path.join(root, "other");
  git(root, "clone", "-q", remote, other);
  fs.writeFileSync(path.join(other, "from-other.md"), "other\n");
  git(other, "add", "-A");
  git(other, "commit", "-q", "-m", "other machine");
  git(other, "push", "-q");
  fs.writeFileSync(path.join(brain, "from-here.md"), "here\n");
  const r = sync();
  assert.equal(r.code, 0, r.out);
  const files = git(remote, "ls-tree", "--name-only", "main").split("\n");
  assert.ok(files.includes("from-other.md") && files.includes("from-here.md"));
});

test("unreachable remote: commits here, says NOT pushed, exits 1, frees the lock", () => {
  const { brain, git, sync } = setup();
  git(brain, "remote", "set-url", "origin", path.join(brain, "..", "no-such-remote.git"));
  fs.writeFileSync(path.join(brain, "note.md"), "new\n");
  const r = sync();
  assert.equal(r.code, 1);
  assert.match(r.out, /brain committed here, but NOT pushed \(see the error above\)\./);
  assert.match(git(brain, "log", "-1", "--format=%s"), /^brain: sync /);
  assert.equal(fs.existsSync(path.join(brain, ".git", "brain-sync.lock")), false);
});

test("a push the remote refuses: NOT pushed, exits 1", posixOnly, () => {
  const { brain, remote, sync } = setup();
  const hook = path.join(remote, "hooks", "pre-receive");
  fs.writeFileSync(hook, "#!/bin/sh\necho 'refused by test hook' >&2\nexit 1\n", { mode: 0o755 });
  fs.writeFileSync(path.join(brain, "note.md"), "new\n");
  const r = sync();
  assert.equal(r.code, 1);
  assert.match(r.out, /refused by test hook/);
  assert.match(r.out, /NOT pushed/);
});

test("a conflict stops the rebase: says how to fix or undo it", () => {
  const { root, brain, remote, git, sync } = setup();
  const other = path.join(root, "other");
  git(root, "clone", "-q", remote, other);
  fs.writeFileSync(path.join(other, "index.md"), "# Index\nfrom other\n");
  git(other, "commit", "-q", "-am", "other");
  git(other, "push", "-q");
  fs.writeFileSync(path.join(brain, "index.md"), "# Index\nfrom here\n");
  const r = sync();
  assert.equal(r.code, 1);
  assert.match(r.out, /NOT pushed/);
  assert.match(r.out, /a rebase stopped on a conflict: fix it \(git status\), or undo it with git rebase --abort/);
});

test("a held lock: refuses, exits 1, leaves the other sync's lock in place", () => {
  const { brain, git, sync } = setup();
  const lock = path.join(brain, ".git", "brain-sync.lock");
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(brain, "note.md"), "new\n");
  const r = sync();
  assert.equal(r.code, 1);
  assert.match(r.out, /another sync is running \(or one crashed: remove .*brain-sync.lock and run again\)/);
  assert.ok(fs.existsSync(lock));
  assert.equal(git(brain, "status", "--porcelain"), "?? note.md");
});

test("BRAIN_SSH_KEY: git uses that key for this run only, never in a git config", posixOnly, () => {
  const { root, brain, remote, git, sync } = setup();
  // A fake ssh on the PATH: records its arguments, then runs the git command it was given locally.
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const log = path.join(root, "ssh-args.log");
  fs.writeFileSync(
    path.join(bin, "ssh"),
    `#!/bin/sh\nprintf '[%s]' "$@" >> '${log}'\necho >> '${log}'\nfor a; do case "$a" in -G) exit 0;; esac; done\nfor a; do last="$a"; done\nexec sh -c "$last"\n`,
    { mode: 0o755 },
  );
  git(brain, "remote", "set-url", "origin", `git@github.example:${remote}`);
  const key = path.join(root, "keys dir", "box_deploy_key");
  fs.writeFileSync(path.join(brain, "note.md"), "over ssh\n");
  const r = sync({ BRAIN_SSH_KEY: key, PATH: `${bin}:${process.env.PATH}` });
  assert.equal(r.code, 0, r.out);
  assert.equal(git(remote, "show", "main:note.md"), "over ssh");
  const calls = fs.readFileSync(log, "utf8");
  assert.ok(calls.includes(`[-i][${key}][-o][IdentitiesOnly=yes][-o][StrictHostKeyChecking=accept-new]`), calls);
  assert.match(calls, /\[git@github.example\]\[git-receive-pack /);
  assert.ok(!git(brain, "config", "--list", "--show-origin").includes(key));
  assert.ok(!fs.readFileSync(path.join(root, "empty-gitconfig"), "utf8").includes(key));
});

// Needs root: a brain owned by another user, like a folder mounted from another machine.
const asRoot = { skip: !(process.getuid && process.getuid() === 0) && "needs root (run it in a container)" };
test("a brain owned by another user: trusted for this run only", asRoot, () => {
  const { brain, env, sync } = setup();
  execFileSync("chown", ["-R", "1000:1000", brain]);
  fs.writeFileSync(path.join(brain, "note.md"), "new\n");
  const plain = spawnSync("git", ["status"], { cwd: brain, env, encoding: "utf8" });
  assert.match(plain.stderr, /dubious ownership/);
  const r = sync();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /brain synced/);
});
