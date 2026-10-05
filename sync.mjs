#!/usr/bin/env node
// Commit whatever changed, take the latest from the remote, push. Safe to run from cron.
// Run: node sync.mjs (Node 18+, no dependencies, needs git).
// On a machine without your git login (a dev container), set BRAIN_SSH_KEY to a deploy key that
// can write only this repo: the sync script uses it for its own git commands, never in any git config.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const brain = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(brain);

// A folder mounted from another machine belongs to another user: trust it for this run only.
const git = ["-c", `safe.directory=${brain.replaceAll("\\", "/")}`];
const env = { ...process.env };
if (env.BRAIN_SSH_KEY) {
  env.GIT_SSH_COMMAND = `ssh -i "${env.BRAIN_SSH_KEY}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
}

// run(): git's output goes to the terminal, returns the exit status; read(): returns git's output.
const spawnGit = (args, stdio, encoding) => {
  const r = spawnSync("git", [...git, ...args], { env, stdio, encoding });
  if (r.error) fail(`could not run git: ${r.error.message}`);
  return r;
};
const run = (...args) => spawnGit(args, "inherit").status ?? 1;
const read = (args, stderr = "inherit") => {
  const r = spawnGit(args, ["ignore", "pipe", stderr], "utf8");
  return r.status === 0 ? r.stdout.trim() : "";
};
const fail = (msg, code = 1) => {
  if (msg) console.error(msg);
  process.exit(code);
};

// A machine with no git identity (a fresh container) still commits, as "brain sync".
if (!read(["config", "user.email"])) git.push("-c", "user.name=brain sync", "-c", "user.email=brain-sync@localhost");

// An agent and a cron job can run it at the same time: one sync at a time.
const gitDir = read(["rev-parse", "--git-dir"]);
if (!gitDir) fail("not a git repo (see the error above)");
const lock = path.resolve(brain, gitDir, "brain-sync.lock");
try {
  fs.mkdirSync(lock);
} catch {
  fail(`another sync is running (or one crashed: remove ${lock} and run again)`);
}
process.on("exit", () => {
  try {
    fs.rmdirSync(lock);
  } catch {}
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(1));

let status = run("add", "-A");
if (status) fail("", status);
if (run("diff", "--cached", "--quiet")) {
  const stamp = new Date().toISOString().slice(0, 16);
  status = run("commit", "-q", "-m", `brain: sync ${stamp}Z`);
  if (status) fail("", status);
}
if (read(["remote", "get-url", "origin"], "ignore")) {
  if (run("pull", "-q", "--rebase", "--autostash") || run("push", "-q")) {
    console.error("brain committed here, but NOT pushed (see the error above).");
    const rebase = read(["rev-parse", "--git-path", "rebase-merge"]);
    if (rebase && fs.existsSync(path.resolve(brain, rebase))) {
      console.error("a rebase stopped on a conflict: fix it (git status), or undo it with git rebase --abort");
    }
    fail();
  }
}
console.log("brain synced");
