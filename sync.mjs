#!/usr/bin/env node
// Commit whatever changed, take the latest from the remote, push. Safe to run from cron.
// Run: node sync.mjs (Node 18+, no dependencies, needs git).
// On a machine without your git login (a dev container), set BRAIN_SSH_KEY to a deploy key that
// can write only this repo: the sync script uses it for its own git commands, never in any git config.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

const fail = (msg, code = 1) => {
  if (msg) console.error(msg);
  process.exit(code);
};

// Stopped (Ctrl-C, kill, cron timeout): stop git too, free the lock, exit 128 + signal number.
let child = null;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    child?.kill(signal);
    process.exit(128 + os.constants.signals[signal]);
  });
}

// runGit(): git's output goes to the terminal unless captured; resolves to { status, out }.
const runGit = (args, { capture = false, quiet = false } = {}) =>
  new Promise((resolve) => {
    child = spawn("git", [...git, ...args], { env, stdio: ["ignore", capture ? "pipe" : "inherit", quiet ? "ignore" : "inherit"] });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.on("error", (err) => fail(`could not run git: ${err.message}`));
    child.on("close", (code) => {
      child = null;
      resolve({ status: code ?? 1, out: out.trim() });
    });
  });
const run = async (...args) => (await runGit(args)).status;
const mustRun = async (...args) => {
  const status = await run(...args);
  if (status) fail("", status);
};

// A machine with no git identity (a fresh container) still commits, as "brain sync".
if (!(await runGit(["config", "user.email"], { capture: true })).out) {
  git.push("-c", "user.name=brain sync", "-c", "user.email=brain-sync@localhost");
}

// An agent and a cron job can run it at the same time: one sync at a time.
const gitDir = await runGit(["rev-parse", "--git-dir"], { capture: true });
if (gitDir.status) fail("", gitDir.status);
const lock = path.resolve(brain, gitDir.out, "brain-sync.lock");
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

await mustRun("add", "-A");
if (await run("diff", "--cached", "--quiet")) {
  const stamp = new Date().toISOString().slice(0, 16);
  await mustRun("commit", "-q", "-m", `brain: sync ${stamp}Z`);
}
if (!(await runGit(["remote", "get-url", "origin"], { capture: true, quiet: true })).status) {
  if ((await run("pull", "-q", "--rebase", "--autostash")) || (await run("push", "-q"))) {
    console.error("brain committed here, but NOT pushed (see the error above).");
    const rebase = await runGit(["rev-parse", "--git-path", "rebase-merge"], { capture: true });
    if (rebase.out && fs.existsSync(path.resolve(brain, rebase.out))) {
      console.error("a rebase stopped on a conflict: fix it (git status), or undo it with git rebase --abort");
    }
    fail();
  }
}
console.log("brain synced");
