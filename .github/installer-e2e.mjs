// End-to-end check of install.mjs and sync.mjs on a real machine (CI: .github/workflows/installer.yml).
// Every case uses a fresh home folder with spaces in its path, never the runner's own.
//   node .github/installer-e2e.mjs native <agents>   agents found on the PATH, e.g. "claude,codex"
//   node .github/installer-e2e.mjs cases <claudeBin> <codexBin>   none / Claude only / Codex only / both
//   node .github/installer-e2e.mjs as-user nodev|devmode <home>   Windows: run by a non-admin user, in its real
//     profile folder <home> (the process starts with the runner's environment, so the script sets the user's own)
//   node .github/installer-e2e.mjs hermes   the real Hermes (installed in ~/.hermes, `hermes` on the PATH) sees the
//     brain: its skills list, and the prompt it sends to a stand-in model (.github/mock-model.mjs, no model key)
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const brain = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skills = fs.readdirSync(path.join(brain, "skills")).filter((n) => !n.startsWith(".")).sort();
const DEV_MODE = "Windows blocks the skill links. Turn on Settings → System → For developers → Developer Mode, then run the installer again.";
const AGENTS = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };
const results = [];

function step(name, fn) {
  try {
    fn();
    results.push(["pass", name]);
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push(["FAIL", name]);
    console.log(`FAIL  ${name}\n${err.stack || err}`);
  }
}

const tmp = (label) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${label} with spaces-`)));
const homeEnv = (home, extra = {}) => ({ ...process.env, HOME: home, USERPROFILE: home, CLAUDE_DIR: "", CLAUDE_CONFIG_DIR: "", CODEX_HOME: "", HERMES_HOME: "", ...extra });

function install(env) {
  for (const k of ["CLAUDE_DIR", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "HERMES_HOME"]) if (env[k] === "") delete env[k];
  const r = spawnSync(process.execPath, [path.join(brain, "install.mjs")], { env, encoding: "utf8" });
  console.log(r.stdout + r.stderr);
  return { code: r.status, out: r.stdout + r.stderr };
}

const linkedSkills = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.lstatSync(path.join(dir, n)).isSymbolicLink()).sort() : [];
const pointers = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("My second brain is at ").length - 1 : 0);

// Install twice in `home`; `found` lists the agent keys that must be found, the others must not.
function installTwice(label, home, env, found) {
  const claudeFile = path.join(home, ".claude", "CLAUDE.md");
  const codexFile = path.join(home, ".codex", "AGENTS.md");
  if (found.length === 0) {
    step(`${label}: no agent → message, exit 1, nothing written`, () => {
      const r = install(env);
      assert.equal(r.code, 1);
      assert.match(r.out, /No coding agent found on this machine/);
      assert.deepEqual(fs.readdirSync(home), []);
    });
    return;
  }
  step(`${label}: first run links ${found.join(" + ")}`, () => {
    const r = install(env);
    assert.equal(r.code, 0);
    for (const [key, name] of Object.entries(AGENTS)) {
      if (found.includes(key)) assert.match(r.out, new RegExp(`${name} +${skills.length} linked in `));
      else assert.match(r.out, new RegExp(`${name} +not found`));
    }
    if (found.includes("claude")) {
      assert.deepEqual(linkedSkills(path.join(home, ".claude", "skills")), skills);
      assert.equal(fs.realpathSync(path.join(home, ".claude", "skills", skills[0], "SKILL.md")), fs.realpathSync(path.join(brain, "skills", skills[0], "SKILL.md")));
      assert.equal(pointers(claudeFile), 1);
    }
    if (found.includes("codex") || found.includes("cursor")) assert.deepEqual(linkedSkills(path.join(home, ".agents", "skills")), skills);
    if (found.includes("codex")) assert.equal(pointers(codexFile), 1);
    if (found.includes("cursor")) assert.match(r.out, /Paste this line into Cursor/);
  });
  step(`${label}: second run changes nothing`, () => {
    const r = install(env);
    assert.equal(r.code, 0);
    for (const key of found) if (key !== "cursor") assert.match(r.out, new RegExp(`${AGENTS[key]} +${skills.length} link ok in .* already in `));
    assert.equal(pointers(claudeFile), found.includes("claude") ? 1 : 0);
    assert.equal(pointers(codexFile), found.includes("codex") ? 1 : 0);
  });
}

// sync.mjs against a local bare remote, all paths with spaces, no git identity.
function syncChecks() {
  const root = tmp("sync");
  const env = { ...process.env, HOME: root, USERPROFILE: root, GIT_CONFIG_GLOBAL: path.join(root, "empty gitconfig"), GIT_CONFIG_NOSYSTEM: "1" };
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, "");
  const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, env, encoding: "utf8" }).trim();
  const remote = path.join(root, "remote repo.git");
  const mine = path.join(root, "my brain");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  git(root, "init", "-q", "-b", "main", mine);
  fs.copyFileSync(path.join(brain, "sync.mjs"), path.join(mine, "sync.mjs"));
  fs.writeFileSync(path.join(mine, "index.md"), "# Index\n");
  git(mine, "add", "-A");
  git(mine, "commit", "-q", "-m", "start");
  git(mine, "remote", "add", "origin", remote);
  git(mine, "push", "-q", "-u", "origin", "main");
  const sync = () => {
    const r = spawnSync(process.execPath, [path.join(mine, "sync.mjs")], { cwd: root, env, encoding: "utf8" });
    console.log(r.stdout + r.stderr);
    return { code: r.status, out: r.stdout + r.stderr };
  };

  step("sync: commit + push with no git identity", () => {
    fs.writeFileSync(path.join(mine, "note.md"), "one\n");
    const r = sync();
    assert.equal(r.code, 0);
    assert.match(r.out, /brain synced/);
    assert.equal(git(remote, "log", "-1", "--format=%an"), "brain sync");
  });
  step("sync: pull --rebase takes another machine's commit first", () => {
    const other = path.join(root, "other machine");
    git(root, "clone", "-q", remote, other);
    fs.writeFileSync(path.join(other, "theirs.md"), "theirs\n");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "theirs");
    git(other, "push", "-q");
    fs.writeFileSync(path.join(mine, "ours.md"), "ours\n");
    const r = sync();
    assert.equal(r.code, 0);
    const files = git(remote, "ls-tree", "--name-only", "main").split("\n");
    assert.ok(files.includes("theirs.md") && files.includes("ours.md"), files.join(","));
  });
  step("sync: a refused push → exit 1, NOT pushed, commit kept, lock freed", () => {
    fs.writeFileSync(path.join(remote, "hooks", "pre-receive"), "#!/bin/sh\necho refused by e2e hook >&2\nexit 1\n", { mode: 0o755 });
    fs.writeFileSync(path.join(mine, "note.md"), "two\n");
    const r = sync();
    assert.equal(r.code, 1);
    assert.match(r.out, /refused by e2e hook/);
    assert.match(r.out, /brain committed here, but NOT pushed/);
    assert.match(git(mine, "log", "-1", "--format=%s"), /^brain: sync /);
    assert.equal(fs.existsSync(path.join(mine, ".git", "brain-sync.lock")), false);
  });
}

// The real Hermes: a copy of its config.yaml and SOUL.md in a fresh HERMES_HOME with spaces; Hermes's code stays where
// the official installer put it. Hermes itself must list the brain's skills and send the pointer line in its prompt.
function hermesChecks() {
  const real = path.join(os.homedir(), ".hermes");
  const home = tmp("home");
  const hermesHome = path.join(home, "hermes home");
  fs.mkdirSync(path.join(hermesHome, "skills"), { recursive: true });
  for (const f of ["config.yaml", "SOUL.md"]) fs.copyFileSync(path.join(real, f), path.join(hermesHome, f));
  const env = { ...process.env, HOME: home, HERMES_HOME: hermesHome };
  const config = path.join(hermesHome, "config.yaml");
  const soul = path.join(hermesHome, "SOUL.md");
  const brainSkills = path.join(brain, "skills");
  const hermes = (...a) => {
    const r = spawnSync("hermes", a, { env, cwd: home, encoding: "utf8", timeout: 300000 });
    console.log(`$ hermes ${a.join(" ")}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const original = fs.readFileSync(config, "utf8");

  step("hermes: install adds the brain's skills folder to external_dirs and the pointer line to SOUL.md", () => {
    const r = install({ ...env });
    assert.equal(r.code, 0);
    assert.match(r.out, new RegExp(`Hermes +${skills.length} added to external_dirs in .*config.yaml +added to .*SOUL.md`));
    assert.equal(fs.readFileSync(`${config}.bak`, "utf8"), original);
    assert.ok(fs.readFileSync(config, "utf8").includes(`- ${brainSkills}\n`));
    assert.equal(pointers(soul), 1);
  });
  step("hermes: `hermes skills list` shows the brain's skills", () => {
    const r = hermes("skills", "list");
    assert.equal(r.status, 0);
    for (const s of skills) assert.match(r.stdout, new RegExp(`│ ${s} +│`));
  });
  step("hermes: the prompt Hermes sends holds the pointer line and the brain's skills", () => {
    const log = path.join(home, "requests.jsonl");
    const mock = spawn(process.execPath, [path.join(brain, ".github", "mock-model.mjs"), "8765", log], { stdio: "inherit" });
    try {
      for (const [k, v] of [["model.provider", "custom"], ["model.base_url", "http://127.0.0.1:8765/v1"], ["model.default", "mock-model"], ["model.api_key", "mock-not-a-key"]]) {
        assert.equal(hermes("config", "set", k, v).status, 0);
      }
      const r = hermes("chat", "-q", "Where is my second brain?", "-Q");
      assert.equal(r.status, 0);
      const sent = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l))
        .filter((q) => q.url.endsWith("/chat/completions")).map((q) => JSON.parse(q.body))
        .find((b) => JSON.stringify(b.messages).includes("Where is my second brain?"));
      const system = sent.messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : m.content.map((c) => c.text).join(""))).join("\n");
      assert.ok(system.includes(`My second brain is at ${brain}. Read its index.md first`), "pointer line in the system prompt");
      for (const s of skills) assert.match(system, new RegExp(`^ *- ${s}: `, "m"));
    } finally {
      mock.kill();
    }
  });
  step("hermes: second run (config.yaml rewritten by `hermes config set`) changes nothing", () => {
    const [c, s] = [fs.readFileSync(config, "utf8"), fs.readFileSync(soul, "utf8")];
    const r = install({ ...env });
    assert.equal(r.code, 0);
    assert.match(r.out, new RegExp(`Hermes +${skills.length} already in external_dirs in .* already in `));
    assert.equal(fs.readFileSync(config, "utf8"), c);
    assert.equal(fs.readFileSync(soul, "utf8"), s);
  });
}

const [mode, ...args] = process.argv.slice(2);
console.log(`node ${process.version}, ${process.platform}/${process.arch}, user ${os.userInfo().username}, brain ${brain}`);

if (mode === "native") {
  const found = args[0] ? args[0].split(",") : [];
  const home = tmp("home");
  installTwice("native", home, homeEnv(home), found);
  syncChecks();
} else if (mode === "cases") {
  const [claudeBin, codexBin] = args;
  const base = process.env.PATH;
  const sep = path.delimiter;
  const cases = [
    ["no agent", [], base],
    ["Claude only", ["claude"], `${claudeBin}${sep}${base}`],
    ["Codex only", ["codex"], `${codexBin}${sep}${base}`],
    ["Claude + Codex", ["claude", "codex"], `${claudeBin}${sep}${codexBin}${sep}${base}`],
  ];
  for (const [label, found, PATH] of cases) {
    const home = tmp("home");
    installTwice(label, home, homeEnv(home, { PATH }), found);
  }
  syncChecks();
} else if (mode === "as-user") {
  // Run by a non-admin Windows user in its real profile folder; Claude Code found by its folder.
  const home = args[1];
  const temp = path.join(home, "AppData", "Local", "Temp");
  fs.mkdirSync(temp, { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, TEMP: temp, TMP: temp,
    APPDATA: path.join(home, "AppData", "Roaming"), LOCALAPPDATA: path.join(home, "AppData", "Local"),
    CLAUDE_DIR: "", CLAUDE_CONFIG_DIR: "", CODEX_HOME: "",
  };
  if (args[0] === "nodev") {
    step(`non-admin ${os.userInfo().username}, Developer Mode off: exit 1 with the Developer Mode message, nothing linked`, () => {
      const r = install(env);
      assert.equal(r.code, 1);
      assert.equal(r.out.trim(), DEV_MODE);
      assert.equal(fs.existsSync(path.join(home, ".claude", "skills")), false);
      assert.equal(fs.existsSync(path.join(home, ".claude", "CLAUDE.md")), false);
    });
  } else {
    step(`non-admin ${os.userInfo().username}, Developer Mode on: links work`, () => {
      const r = install(env);
      assert.equal(r.code, 0);
      assert.deepEqual(linkedSkills(path.join(home, ".claude", "skills")), skills);
      assert.equal(pointers(path.join(home, ".claude", "CLAUDE.md")), 1);
    });
  }
} else if (mode === "hermes") {
  hermesChecks();
} else {
  console.log("usage: native <agents> | cases <claudeBin> <codexBin> | as-user nodev|devmode | hermes");
  process.exit(2);
}

const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
