// Tests for the Hermes part of install.mjs: skills.external_dirs in config.yaml, the pointer line in SOUL.md.
// Run: node --test. Every test uses its own temporary home folder, never yours.
// HERMES_PYTHON=<Hermes's own venv python> also parses every config.yaml written here with PyYAML.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { addHermesSkillsDir, findAgents, HermesConfigError, install, pointerLine, readHermesConfig } from "../install.mjs";

const brain = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const brainSkills = path.join(brain, "skills");
const skills = fs.readdirSync(brainSkills).sort();
const nowhere = () => false;
const SOUL = "You are my agent. Be direct.\n";

// A home with ~/.hermes/config.yaml (when `config` is a string) and ~/.hermes/SOUL.md.
function hermesHome(config, { soul = SOUL } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "brain-home-"));
  const dir = path.join(home, ".hermes");
  fs.mkdirSync(path.join(dir, "skills"), { recursive: true });
  if (config !== null) fs.writeFileSync(path.join(dir, "config.yaml"), config, { mode: 0o600 });
  if (soul !== null) fs.writeFileSync(path.join(dir, "SOUL.md"), soul);
  return { home, dir, config: path.join(dir, "config.yaml"), soul: path.join(dir, "SOUL.md") };
}

function run(home, { env = {}, platform = process.platform, f = fs, onPath = nowhere } = {}) {
  const lines = [];
  const code = install({ brain, env, home, platform, fs: f, onPath, tmpdir: home, log: (l) => lines.push(l) });
  return { code, out: lines.join("\n").replaceAll("\\", "/") };
}

const read = (p) => fs.readFileSync(p, "utf8");
const pointers = (file) => read(file).split(`My second brain is at ${brain}.`).length - 1;
const isBrain = (e) => path.resolve(e) === brainSkills;
const add = (text) => addHermesSkillsDir(text, brainSkills, isBrain);
const lineOf = (p) => (/^[\w~/.][\w~/. ()+=@-]*$/.test(p) ? p : `'${p.replaceAll("'", "''")}'`);
const B = lineOf(brainSkills); // the brain's skills folder as config.yaml shows it

// The YAML Hermes itself reads, when HERMES_PYTHON names a python with PyYAML (Hermes's venv has it).
const py = process.env.HERMES_PYTHON;
function yamlParse(text) {
  const r = spawnSync(py, ["-c", "import json,sys,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))"], { input: text, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
// The new file means the same as the old one, plus the brain's folder at the end of skills.external_dirs.
function sameButBrainAdded(before, after) {
  if (!py) return;
  const [a, b] = [yamlParse(before) ?? {}, yamlParse(after)];
  const old = a.skills?.external_dirs;
  const list = old == null ? [] : Array.isArray(old) ? old : [old];
  assert.deepEqual(b.skills.external_dirs, [...list, brainSkills]);
  delete b.skills.external_dirs;
  if (a.skills) delete a.skills.external_dirs;
  if (!a.skills || Object.keys(a.skills).length === 0) a.skills = b.skills = undefined;
  assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
}

const TEMPLATE = `_config_version: 46
model:
  default: some/model

# Skills are reusable procedures.
skills:
  # Nudge the agent to create skills after complex tasks.
  creation_nudge_interval: 15

  # External skill directories
  # external_dirs:
  #   - ~/.agents/skills

# =====
agent:
  max_turns: 500
`;

test("Hermes's own template config: external_dirs added at the end of the skills block, nothing else changed", () => {
  const out = add(TEMPLATE);
  assert.equal(
    out,
    TEMPLATE.replace("  #   - ~/.agents/skills\n", `  #   - ~/.agents/skills\n  external_dirs:\n    - ${B}\n`),
  );
  sameButBrainAdded(TEMPLATE, out);
  assert.equal(add(out), null);
});

test("config.yaml cases: no skills key, an existing list, null, [], a flow list, one path, skills: {}", () => {
  const cases = [
    ["model:\n  default: x\n", `model:\n  default: x\n\nskills:\n  external_dirs:\n    - ${B}\n`],
    ["model: x", `model: x\n\nskills:\n  external_dirs:\n    - ${B}\n`],
    ["", `skills:\n  external_dirs:\n    - ${B}\n`],
    ["skills:\n  external_dirs:\n    - ~/dev/skills  # mine\n    - '/a b/c'\nagent: {}\n", `skills:\n  external_dirs:\n    - ~/dev/skills  # mine\n    - '/a b/c'\n    - ${B}\nagent: {}\n`],
    ["skills:\n  external_dirs:\n  - /x\n  disabled: []\n", `skills:\n  external_dirs:\n  - /x\n  - ${B}\n  disabled: []\n`],
    ["skills:\n    external_dirs:\n    disabled: []\n", `skills:\n    external_dirs:\n      - ${B}\n    disabled: []\n`],
    ["skills:\n  external_dirs: []\n", `skills:\n  external_dirs: [${B}]\n`],
    ["skills:\n  external_dirs: [/a, \"/b\"]  # two\n", `skills:\n  external_dirs: [/a, "/b", ${B}]  # two\n`],
    ["skills:\n  external_dirs: ~/dev/skills # one\n", `skills:\n  external_dirs: # one\n    - ~/dev/skills\n    - ${B}\n`],
    ["skills: {}\nagent: {}\n", `skills:\n  external_dirs:\n    - ${B}\nagent: {}\n`],
    ["skills:\nagent: {}\n", `skills:\n  external_dirs:\n    - ${B}\nagent: {}\n`],
  ];
  for (const [before, expected] of cases) {
    const out = add(before);
    assert.equal(out, expected, before);
    sameButBrainAdded(before, out);
    assert.equal(add(out), null, `second run on: ${out}`);
  }
});

test("Windows line endings and a byte order mark stay as they were", () => {
  const before = "\uFEFFskills:\r\n  external_dirs:\r\n    - C:/x\r\n";
  assert.equal(add(before), `\uFEFFskills:\r\n  external_dirs:\r\n    - C:/x\r\n    - ${B}\r\n`);
});

test("a path that YAML would misread is single-quoted, and read back the same", () => {
  for (const dir of ["C:\\Users\\me\\brain\\skills", "/home/me/my #1 brain/skills", "/it's/skills", "/x: y/skills"]) {
    const out = addHermesSkillsDir("skills:\n  external_dirs: []\n", dir, (e) => e === dir);
    assert.deepEqual(readHermesConfig(out).entries, [dir]);
    if (py) assert.deepEqual(yamlParse(out).skills.external_dirs, [dir]);
  }
});

test("config.yaml it can't read for sure: a clear error, nothing parsed as a guess", () => {
  const bad = [
    ["skills:\n\texternal_dirs: []\n", /line 2: indented with a tab/],
    ["skills:\n  external_dirs: []\nskills:\n  disabled: []\n", /line 3: skills: appears twice/],
    ["skills:\n  external_dirs: []\n  external_dirs: [/x]\n", /line 3: external_dirs appears twice/],
    ["skills:\n  external_dirs:\n    - '/a\n", /line 3: a quote is not closed/],
    ["skills:\n  external_dirs: [/a,\n    /b]\n", /line 2: external_dirs is a \[…\] list over more than one line/],
    ["skills:\n  external_dirs:\n    -\n      - /nested\n", /line 3: an external_dirs item with no path on its line/],
    ["skills:\n  external_dirs:\n    - /a\n      /continued\n", /line 4: external_dirs has a value over more than one line/],
    ["skills: yes\n", /line 1: skills: is not a block/],
    ["skills: {external_dirs: [/a]}\n", /line 1: skills: is not a block/],
    ['{"skills": {"external_dirs": []}}\n', /line 1: the file is one flow mapping/],
    ["skills:\n  external_dirs: &dirs\n    - /a\n", /line 2: "&dirs" is not a plain path/],
    ["skills:\n  external_dirs: *dirs\n", /line 2: "\*dirs" is not a plain path/],
    ["skills:\n    disabled: []\n  external_dirs: []\n", /line 3: uneven indentation in the skills block/],
    ["a: 1\n---\nskills: {}\n", /line 2: a second YAML document/],
  ];
  for (const [text, message] of bad) {
    assert.throws(() => add(text), (err) => err instanceof HermesConfigError && message.test(err.message), text);
  }
});

test("Hermes found by ~/.hermes: skills folder added, pointer line in SOUL.md, backup kept; second run changes nothing", () => {
  const h = hermesHome(TEMPLATE);
  const first = run(h.home);
  assert.equal(first.code, 0);
  assert.match(first.out, new RegExp(`Hermes +${skills.length} added to external_dirs in ~/.hermes/config.yaml +added to ~/.hermes/SOUL.md`));
  assert.match(first.out, /the config.yaml from before this change is saved as ~\/.hermes\/config.yaml.bak\./);
  assert.match(first.out, /start a new session to use the brain/);
  assert.equal(read(`${h.config}.bak`), TEMPLATE);
  if (process.platform !== "win32") assert.equal((fs.statSync(`${h.config}.bak`).mode & 0o777).toString(8), "600");
  assert.deepEqual(readHermesConfig(read(h.config)).entries, [brainSkills]);
  assert.equal(read(h.soul), `${SOUL}\n${pointerLine(brain)}\n`);
  for (const name of ["Claude Code", "Codex", "Cursor"]) assert.match(first.out, new RegExp(`${name} +not found`));
  assert.deepEqual(fs.readdirSync(h.home), [".hermes"]); // no links: Hermes reads the brain's folder itself

  const config = read(h.config);
  const again = run(h.home);
  assert.equal(again.code, 0);
  assert.match(again.out, new RegExp(`Hermes +${skills.length} already in external_dirs in ~/.hermes/config.yaml +already in ~/.hermes/SOUL.md`));
  assert.doesNotMatch(again.out, /saved as|start a new session/);
  assert.equal(read(h.config), config);
  assert.equal(pointers(h.soul), 1);
  assert.deepEqual(fs.readdirSync(h.dir).filter((n) => n.startsWith("config.yaml")).sort(), ["config.yaml", "config.yaml.bak"]);
});

test("already there under another spelling (~, ${HOME}, relative to HERMES_HOME, through a link): no change, no backup", () => {
  const h = hermesHome("");
  const alias = path.join(h.home, "brain-link");
  fs.symlinkSync(brain, alias, "dir");
  const spellings = [
    path.join(alias, "skills"),
    `~/${path.relative(h.home, alias)}/skills`,
    `\${HOME}/${path.relative(h.home, alias)}/skills`,
    path.relative(h.dir, brainSkills),
  ];
  for (const spelling of spellings) {
    const text = `skills:\n  external_dirs:\n    - ${lineOf(spelling)}\n`;
    fs.writeFileSync(h.config, text);
    const { code, out } = run(h.home, { env: { HOME: h.home } });
    assert.equal(code, 0);
    assert.match(out, /Hermes +\d+ already in external_dirs/, spelling);
    assert.equal(read(h.config), text);
    assert.equal(fs.existsSync(`${h.config}.bak`), false);
  }
});

test("a config.yaml.bak that is already there is kept; the backup gets its own name", () => {
  const h = hermesHome("model: x\n");
  fs.writeFileSync(`${h.config}.bak`, "someone else's backup\n");
  const { out } = run(h.home);
  assert.equal(read(`${h.config}.bak`), "someone else's backup\n");
  const ours = fs.readdirSync(h.dir).filter((n) => n.startsWith("config.yaml.bak-brain-"));
  assert.equal(ours.length, 1);
  assert.equal(read(path.join(h.dir, ours[0])), "model: x\n");
  assert.match(out, new RegExp(`saved as ~/.hermes/${ours[0]}\\.`));
});

test("a skill with a brain skill's name in another skill folder: warned (folder name, frontmatter name, loose .md, local skills)", () => {
  const h = hermesHome(null);
  const other = path.join(h.home, "team skills");
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  write(path.join(other, "ops", skills[0], "SKILL.md"), `---\nname: ${skills[0]}\n---\nsomeone else's\n`);
  write(path.join(other, "renamed", "SKILL.md"), `---\nname: "${skills[1]}"\ndescription: x\n---\n`);
  write(path.join(other, `${skills[2]}.md`), "a loose skill file\n");
  write(path.join(other, "pkg", "SKILL.md"), "---\nname: pkg\n---\n");
  write(path.join(other, "pkg", "references", `${skills[3]}.md`), "belongs to pkg, not a skill\n");
  write(path.join(other, "pkg", `${skills[0]}.md`), "a page of the pkg skill, not a skill\n");
  write(path.join(other, "pkg", "scripts", skills[3], "SKILL.md"), "a skill's support files: Hermes doesn't look in there\n");
  write(path.join(h.dir, "skills", "mine", skills[3], "SKILL.md"), "---\nname: x\n---\n");
  // The brain's own skill through a link is the same file: Hermes counts it once.
  const linked = path.join(h.home, "linked skills");
  fs.mkdirSync(linked);
  fs.symlinkSync(path.join(brainSkills, skills[0]), path.join(linked, skills[0]), "dir");
  fs.writeFileSync(h.config, `skills:\n  external_dirs:\n    - ${lineOf(other)}\n    - ${lineOf(linked)}\n    - /does/not/exist\n`);

  const { code, out } = run(h.home);
  assert.equal(code, 0);
  const warned = [...out.matchAll(/Hermes: a skill named (\S+) is also at (.+?)\. Hermes refuses/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(warned.sort(), [
    [skills[0], `~/team skills/ops/${skills[0]}/SKILL.md`],
    [skills[1], "~/team skills/renamed/SKILL.md"],
    [skills[2], `~/team skills/${skills[2]}.md`],
    [skills[3], `~/.hermes/skills/mine/${skills[3]}/SKILL.md`],
  ].sort());
  assert.match(out, /\("Ambiguous skill name"\) and loads neither: rename or remove one of them/);
  assert.deepEqual(readHermesConfig(read(h.config)).entries.at(-1), brainSkills);
});

test("a config.yaml it can't read: exit 1, says which line, nothing written for any agent", () => {
  const text = "skills:\n  external_dirs:\n    - /a\n\t- /b\n";
  const h = hermesHome(text);
  fs.mkdirSync(path.join(h.home, ".claude"));
  const { code, out } = run(h.home);
  assert.equal(code, 1);
  assert.match(out, /Hermes: config.yaml line 4: indented with a tab \(YAML allows spaces only\)\. .* changed nothing on this machine/);
  assert.match(out, new RegExp(`add ${brainSkills.replaceAll("\\", "/")} to skills.external_dirs in .*config.yaml yourself`));
  assert.equal(read(h.config), text);
  assert.equal(read(h.soul), SOUL);
  assert.deepEqual(fs.readdirSync(h.dir).sort(), ["SOUL.md", "config.yaml", "skills"]);
  assert.deepEqual(fs.readdirSync(path.join(h.home, ".claude")), []);
});

test("Hermes on the PATH that has not run yet (no config.yaml, no SOUL.md): says so, creates nothing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "brain-home-"));
  const { code, out } = run(home, { onPath: (cmd) => cmd === "hermes" });
  assert.equal(code, 0);
  assert.match(out, /Hermes +none: no ~\/.hermes\/config.yaml +not written: ~\/.hermes\/SOUL.md/);
  assert.match(out, /Hermes has not run here yet: .* Run hermes once, then node install.mjs again\./);
  assert.deepEqual(fs.readdirSync(home), []);
});

test("an empty SOUL.md (Hermes's built-in persona) is left empty, with the line to add", () => {
  const h = hermesHome("", { soul: "\n" });
  const { code, out } = run(h.home);
  assert.equal(code, 0);
  assert.match(out, /Hermes +\d+ added to external_dirs .* not written: ~\/.hermes\/SOUL.md/);
  assert.match(out, /SOUL.md is empty, so Hermes uses its built-in persona/);
  assert.equal(read(h.soul), "\n");
});

test("HERMES_HOME sets the Hermes folder; on Windows the default is %LOCALAPPDATA%\\hermes", () => {
  const h = hermesHome("");
  const custom = path.join(h.home, "profile");
  fs.renameSync(h.dir, custom);
  const { code } = run(h.home, { env: { HERMES_HOME: custom } });
  assert.equal(code, 0);
  assert.deepEqual(readHermesConfig(read(path.join(custom, "config.yaml"))).entries, [brainSkills]);
  assert.equal(pointers(path.join(custom, "SOUL.md")), 1);

  const hermesOf = (env, platform) => findAgents({ env, home: "/h", platform, has: nowhere, onPath: nowhere }).find((a) => a.name === "Hermes");
  assert.equal(hermesOf({ LOCALAPPDATA: "/local" }, "win32").config, path.join("/local", "hermes", "config.yaml"));
  assert.equal(hermesOf({}, "linux").config, path.join("/h", ".hermes", "config.yaml"));
  assert.equal(hermesOf({ HERMES_HOME: "~/hh" }, "linux").file, path.resolve("/h", "hh", "SOUL.md"));
  assert.equal(hermesOf({ HERMES_HOME: "/x" }, "linux").found, true);
});

test("Windows without Developer Mode, Hermes only: no links needed, so it works", () => {
  const h = hermesHome("");
  const f = { ...fs, symlinkSync: () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); } };
  const { code, out } = run(h.home, { platform: "win32", f, env: { LOCALAPPDATA: path.join(h.home, "nowhere") , HERMES_HOME: h.dir } });
  assert.equal(code, 0, out);
  assert.match(out, /Hermes +\d+ added to external_dirs/);
});

test("Claude Code and Hermes together: links for one, external_dirs for the other", () => {
  const h = hermesHome("");
  fs.mkdirSync(path.join(h.home, ".claude"));
  const { code, out } = run(h.home);
  assert.equal(code, 0);
  assert.match(out, /Claude Code +\d+ linked in ~\/.claude\/skills +added to ~\/.claude\/CLAUDE.md/);
  assert.match(out, /Hermes +\d+ added to external_dirs in ~\/.hermes\/config.yaml +added to ~\/.hermes\/SOUL.md/);
  assert.doesNotMatch(out, /a skill named/); // the ~/.claude/skills links are not one of Hermes's folders
});
