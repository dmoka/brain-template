// Tests for install.mjs. Run: node --test
// Every test uses its own temporary home folder, never yours.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEV_MODE, findAgents, install, makeOnPath, pointerLine } from "../install.mjs";

const brain = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skills = fs.readdirSync(path.join(brain, "skills")).sort();
const nowhere = () => false;

function tmpHome(...dirs) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "brain-home-"));
  for (const d of dirs) fs.mkdirSync(path.join(home, d), { recursive: true });
  return home;
}

function run(home, { env = {}, platform = process.platform, f = fs, tmpdir = home, onPath = nowhere } = {}) {
  const lines = [];
  const code = install({ brain, env, home, platform, fs: f, onPath, tmpdir, log: (l) => lines.push(l) });
  return { code, out: lines.join("\n") };
}

const linksIn = (dir) =>
  fs.readdirSync(dir).filter((n) => fs.lstatSync(path.join(dir, n)).isSymbolicLink()).sort();
const pointerCount = (file) => fs.readFileSync(file, "utf8").split(`My second brain is at ${brain}.`).length - 1;

test("Claude Code and Codex: skills linked, one pointer line each, safe to run again", () => {
  const home = tmpHome(".claude", ".codex");
  const first = run(home);
  assert.equal(first.code, 0);
  assert.match(first.out, new RegExp(`Claude Code +${skills.length} linked in ~/.claude/skills +added to ~/.claude/CLAUDE.md`));
  assert.match(first.out, new RegExp(`Codex +${skills.length} linked in ~/.agents/skills +added to ~/.codex/AGENTS.md`));
  assert.match(first.out, /Cursor +not found/);
  for (const dir of [".claude/skills", ".agents/skills"]) {
    assert.deepEqual(linksIn(path.join(home, dir)), skills);
    assert.equal(fs.realpathSync(path.join(home, dir, skills[0])), fs.realpathSync(path.join(brain, "skills", skills[0])));
  }

  const again = run(home);
  assert.equal(again.code, 0);
  assert.match(again.out, new RegExp(`Claude Code +${skills.length} link ok .* already in ~/.claude/CLAUDE.md`));
  assert.match(again.out, new RegExp(`Codex +${skills.length} link ok .* already in ~/.codex/AGENTS.md`));
  assert.equal(pointerCount(path.join(home, ".claude/CLAUDE.md")), 1);
  assert.equal(pointerCount(path.join(home, ".codex/AGENTS.md")), 1);
});

test("keeps what is already in the instruction file", () => {
  const home = tmpHome(".claude");
  fs.writeFileSync(path.join(home, ".claude/CLAUDE.md"), "# mine\nkeep this\n");
  run(home);
  assert.equal(fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8"), `# mine\nkeep this\n\n${pointerLine(brain)}\n`);
});

test("Cursor only: skills linked, the pointer line printed to paste, no file written", () => {
  const home = tmpHome(".cursor");
  const { code, out } = run(home);
  assert.equal(code, 0);
  assert.match(out, /Cursor +\d+ linked in ~\/.agents\/skills +paste it \(below\)/);
  assert.match(out, /Paste this line into Cursor → Customize → Rules → User Rules:/);
  assert.ok(out.includes(pointerLine(brain)));
  assert.deepEqual(linksIn(path.join(home, ".agents/skills")), skills);
  assert.deepEqual(fs.readdirSync(home).sort(), [".agents", ".cursor"]);
});

test("Cursor found by its user config folder (Linux, macOS, Windows)", () => {
  const home = "/h";
  const cursorAt = (platform, env = {}) =>
    findAgents({ env, home, platform, onPath: nowhere, has: (p) => p === expected[platform] }).find((a) => a.name === "Cursor").found;
  const expected = {
    linux: path.join(home, ".config", "Cursor"),
    darwin: path.join(home, "Library", "Application Support", "Cursor"),
    win32: path.join("/appdata", "Cursor"),
  };
  assert.equal(cursorAt("linux"), true);
  assert.equal(cursorAt("darwin"), true);
  assert.equal(cursorAt("win32", { APPDATA: "/appdata" }), true);
});

test("no agent: says so, exits 1, changes nothing", () => {
  const home = tmpHome();
  const { code, out } = run(home);
  assert.equal(code, 1);
  assert.match(out, /No coding agent found on this machine \(looked for Claude Code, Codex and Cursor\)/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test("an agent on the PATH counts as found", () => {
  const home = tmpHome();
  const { code, out } = run(home, { onPath: (cmd) => cmd === "codex" });
  assert.equal(code, 0);
  assert.match(out, /Codex +\d+ linked/);
});

test("CLAUDE_DIR (the dev container) and CLAUDE_CONFIG_DIR set the Claude Code folder", () => {
  for (const name of ["CLAUDE_DIR", "CLAUDE_CONFIG_DIR"]) {
    const home = tmpHome();
    const dir = path.join(home, "box-claude");
    const { code } = run(home, { env: { [name]: dir } });
    assert.equal(code, 0);
    assert.deepEqual(linksIn(path.join(dir, "skills")), skills);
    assert.equal(pointerCount(path.join(dir, "CLAUDE.md")), 1);
    assert.equal(fs.existsSync(path.join(home, ".claude")), false);
  }
});

test("CODEX_HOME sets the Codex instruction file; AGENTS.override.md gets a warning", () => {
  const home = tmpHome();
  const codexHome = path.join(home, "codex-home");
  fs.mkdirSync(codexHome);
  fs.writeFileSync(path.join(codexHome, "AGENTS.override.md"), "temporary\n");
  const { out } = run(home, { env: { CODEX_HOME: codexHome } });
  assert.equal(pointerCount(path.join(codexHome, "AGENTS.md")), 1);
  assert.match(out, /Codex reads .*AGENTS.override.md instead of AGENTS.md while it exists/);
});

test("a folder that is not a link is left alone; a link to elsewhere is pointed back", () => {
  const home = tmpHome(".claude/skills");
  const own = path.join(home, ".claude/skills", skills[0]);
  fs.mkdirSync(own);
  fs.writeFileSync(path.join(own, "SKILL.md"), "my own skill\n");
  fs.symlinkSync(os.tmpdir(), path.join(home, ".claude/skills", skills[1]), "dir");
  const { code, out } = run(home);
  assert.equal(code, 0);
  assert.match(out, new RegExp(`skill ${skills[0]}: .* exists and is not a link, left it alone`));
  assert.match(out, new RegExp(`Claude Code +${skills.length - 2} linked, 1 link ok, 1 left alone`));
  assert.equal(fs.readFileSync(path.join(own, "SKILL.md"), "utf8"), "my own skill\n");
  assert.equal(fs.readlinkSync(path.join(home, ".claude/skills", skills[1])), path.join(brain, "skills", skills[1]));
});

// Windows refuses symlinks without Developer Mode (or admin): fs.symlink throws EPERM.
const eperm = () => Object.assign(new Error("EPERM: operation not permitted, symlink"), { code: "EPERM" });

test("Windows without Developer Mode: fails with the Developer Mode message, before changing anything", () => {
  const home = tmpHome(".claude", ".codex");
  const f = { ...fs, symlinkSync: () => { throw eperm(); } };
  const { code, out } = run(home, { platform: "win32", f });
  assert.equal(code, 1);
  assert.equal(out, DEV_MODE);
  assert.equal(DEV_MODE, "Windows blocks the skill links. Turn on Settings → System → For developers → Developer Mode, then run the installer again.");
  assert.deepEqual(fs.readdirSync(path.join(home, ".claude")), []);
  assert.deepEqual(fs.readdirSync(path.join(home, ".codex")), []);
});

test("Windows refusing a skill link after the test link: same message, exit 1", () => {
  const home = tmpHome(".claude");
  let calls = 0;
  const f = { ...fs, symlinkSync: (...a) => { if (calls++ > 0) throw eperm(); return fs.symlinkSync(...a); } };
  const { code, out } = run(home, { platform: "win32", f });
  assert.equal(code, 1);
  assert.equal(out, DEV_MODE);
  assert.equal(fs.existsSync(path.join(home, ".claude/CLAUDE.md")), false);
});

test("Windows with Developer Mode: links like everywhere else, no copies", () => {
  const home = tmpHome(".claude");
  const types = [];
  const f = { ...fs, symlinkSync: (t, l, type) => { types.push(type); return fs.symlinkSync(t, l, type); } };
  const { code } = run(home, { platform: "win32", f });
  assert.equal(code, 0);
  assert.deepEqual(linksIn(path.join(home, ".claude/skills")), skills);
  assert.ok(types.every((t) => t === "dir"));
});

test("EPERM on Linux or macOS is a real error, not the Windows message", () => {
  const home = tmpHome(".claude");
  const f = { ...fs, symlinkSync: () => { throw eperm(); } };
  assert.throws(() => run(home, { platform: "linux", f }), /EPERM/);
});

test("PATH lookup uses PATHEXT on Windows", () => {
  const files = new Set([path.join("C:/tools", "codex.CMD")]);
  const f = { statSync: (p) => { if (!files.has(p)) throw eperm(); return { isFile: () => true }; } };
  const onPath = makeOnPath({ env: { PATH: "C:/nope;C:/tools", PATHEXT: ".EXE;.CMD" }, platform: "win32", fs: f });
  assert.equal(onPath("codex"), true);
  assert.equal(onPath("claude"), false);
});

test("node install.mjs runs as a script", { skip: process.platform === "win32" }, () => {
  const home = tmpHome(".claude");
  const r = spawnSync(process.execPath, [path.join(brain, "install.mjs")], {
    env: { HOME: home, PATH: "" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code +\d+ linked/);
});
