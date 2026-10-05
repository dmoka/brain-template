#!/usr/bin/env node
// Connect this brain to the agents on this machine (Claude Code, Codex, Cursor, Hermes). Safe to run again.
//  1. links the brain's skills into each agent's global skills folder (links only, never copies);
//     Hermes reads the brain's skills folder itself: it is added to skills.external_dirs in its config.yaml
//  2. adds one pointer line to each agent's global instruction file; Cursor keeps its rules in
//     its settings, so for Cursor it prints the line to paste
// Run: node install.mjs (Node 18+, no dependencies). On Windows the links need Developer Mode.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_MODE =
  "Windows blocks the skill links. Turn on Settings → System → For developers → Developer Mode, then run the installer again.";

export const pointerLine = (brain) =>
  `My second brain is at ${brain}. Read its index.md first, then grep it, before you search anywhere else, and save new decisions, guidelines and gotchas there (see its AGENTS.md).`;

// Each agent: how to find it, its global skills folder, its global instruction file.
// Sources (checked 2026-10-05):
//  Claude Code: ~/.claude/skills, ~/.claude/CLAUDE.md (code.claude.com/docs/en/skills)
//  Codex: ~/.agents/skills, $CODEX_HOME/AGENTS.md (learn.chatgpt.com/docs/build-skills, .../agents-md)
//  Cursor: ~/.agents/skills; user rules live in Customize → Rules, not in a file (cursor.com/docs/context/skills, /rules)
//  Hermes: skills.external_dirs in $HERMES_HOME/config.yaml, $HERMES_HOME/SOUL.md (the one global instruction
//    file: identity slot #1); $HERMES_HOME defaults to ~/.hermes, on Windows %LOCALAPPDATA%\hermes
//    (hermes-agent v0.21.5: hermes_constants.py, agent/skill_utils.py, user-guide/which-file-does-what)
export function findAgents({ env, home, platform, has, onPath }) {
  const claudeDir = env.CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  const codexHome = env.CODEX_HOME || path.join(home, ".codex");
  const cursorConfig = {
    darwin: path.join(home, "Library", "Application Support", "Cursor"),
    win32: path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "Cursor"),
  }[platform] || path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "Cursor");
  const agentsSkills = path.join(home, ".agents", "skills");
  const hermesHome = env.HERMES_HOME
    ? path.resolve(expandHome(env.HERMES_HOME, env, home))
    : platform === "win32"
      ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "hermes")
      : path.join(home, ".hermes");
  return [
    {
      name: "Claude Code",
      found: Boolean(env.CLAUDE_DIR || env.CLAUDE_CONFIG_DIR) || onPath("claude") || has(claudeDir),
      skills: path.join(claudeDir, "skills"),
      file: path.join(claudeDir, "CLAUDE.md"),
    },
    {
      name: "Codex",
      found: Boolean(env.CODEX_HOME) || onPath("codex") || has(codexHome),
      skills: agentsSkills,
      file: path.join(codexHome, "AGENTS.md"),
      override: path.join(codexHome, "AGENTS.override.md"),
    },
    {
      name: "Cursor",
      found: onPath("cursor") || has(path.join(home, ".cursor")) || has(cursorConfig),
      skills: agentsSkills,
      paste: "Cursor → Customize → Rules → User Rules",
    },
    {
      name: "Hermes",
      found: Boolean(env.HERMES_HOME) || onPath("hermes") || has(hermesHome),
      hermesHome,
      config: path.join(hermesHome, "config.yaml"),
      file: path.join(hermesHome, "SOUL.md"),
    },
  ];
}

// ~ and $VAR / ${VAR} the way Hermes expands its paths (os.path.expandvars, then expanduser).
function expandHome(p, env, home) {
  const vars = p.replace(/\$\{(\w+)\}|\$(\w+)/g, (m, a, b) => env[a || b] ?? m);
  return vars === "~" || /^~[\\/]/.test(vars) ? home + vars.slice(1) : vars;
}

export function makeOnPath({ env, platform, fs: f = fs }) {
  const dirs = (env.PATH || "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  const exts = platform === "win32" ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  return (cmd) =>
    dirs.some((dir) =>
      exts.some((ext) => {
        try {
          const file = path.join(dir, cmd + ext);
          if (!f.statSync(file).isFile()) return false;
          if (platform !== "win32") f.accessSync(file, fs.constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
    );
}

// Windows without Developer Mode refuses a symlink with EPERM.
const windowsRefused = (err, platform) => platform === "win32" && err.code === "EPERM";

// The same folder, also through a symlink or in another letter case on Windows.
function sameDir(f, platform, a, b) {
  const real = (p) => {
    try {
      return f.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const [x, y] = [real(a), real(b)];
  return platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// One skill folder: "linked", "link ok", or "left alone" (something that is not a link is in the way).
function linkSkill(f, platform, target, link) {
  let st = null;
  try {
    st = f.lstatSync(link);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (st && !st.isSymbolicLink()) return "left alone";
  if (st) {
    if (sameDir(f, platform, path.resolve(path.dirname(link), f.readlinkSync(link)), target)) return "link ok";
    f.unlinkSync(link);
    f.symlinkSync(target, link, "dir");
    return "link ok";
  }
  f.symlinkSync(target, link, "dir");
  return "linked";
}

// Hermes keeps its extra skill folders in config.yaml (skills.external_dirs). Node has no YAML parser,
// so this reads and edits that one key line by line. Anything it can't read for sure throws
// HermesConfigError before a byte is written.
export class HermesConfigError extends Error {}

const blankOrComment = (l) => /^\s*(#.*)?$/.test(l);
const indentOf = (l) => l.match(/^ */)[0].length;

// One YAML scalar: plain, 'single' or "double" quoted, with an optional comment after it.
function scalar(text, where) {
  const s = text.trim();
  const fail = (why) => new HermesConfigError(`${where}: ${why}`);
  let value, rest;
  if (s.startsWith("'")) {
    const m = s.match(/^'((?:[^']|'')*)'(.*)$/);
    if (!m) throw fail("a quote is not closed");
    [value, rest] = [m[1].replaceAll("''", "'"), m[2]];
  } else if (s.startsWith('"')) {
    const m = s.match(/^"((?:[^"\\]|\\.)*)"(.*)$/);
    if (!m) throw fail("a quote is not closed");
    try {
      value = JSON.parse(`"${m[1]}"`);
    } catch {
      throw fail("a backslash escape this installer can't read");
    }
    rest = m[2];
  } else {
    if (s === "" || /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) throw fail(`"${s}" is not a plain path`);
    [value, rest] = [s.replace(/\s+#.*$/, ""), ""];
    if (/:(\s|$)/.test(value)) throw fail(`"${value}" is a mapping, not a path`);
  }
  if (!blankOrComment(rest)) throw fail(`unexpected text after the value: "${rest.trim()}"`);
  return value;
}

// The items of a one-line flow list "[a, 'b', "c"]" (the text between the brackets).
function flowItems(inner, where) {
  const items = [];
  let cur = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "[" || ch === "{") throw new HermesConfigError(`${where}: a nested list or mapping`);
    else if (ch === ",") {
      items.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (quote) throw new HermesConfigError(`${where}: a quote is not closed`);
  items.push(cur);
  if (items.at(-1).trim() === "") items.pop(); // a trailing comma
  return items.map((item) => scalar(item, where));
}

// Where skills.external_dirs is in config.yaml, and what it holds.
export function readHermesConfig(text) {
  const bom = text.startsWith("﻿") ? "﻿" : "";
  const body = text.slice(bom.length);
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r?\n/);
  const at = (i, why) => new HermesConfigError(`config.yaml line ${i + 1}: ${why}`);

  const content = lines.map((l, i) => [l, i]).filter(([l]) => !blankOrComment(l));
  if (content.length && /^[\[{]/.test(content[0][0].trim())) {
    throw at(content[0][1], "the file is one flow mapping or list ({…} or […]), not `key: value` lines");
  }
  for (const [l, i] of content) {
    if (/^\t/.test(l)) throw at(i, "indented with a tab (YAML allows spaces only)");
    if (/^(---|\.\.\.)(\s|$)/.test(l) && i !== content[0][1]) throw at(i, "a second YAML document");
    if (/^["']skills["']\s*:/.test(l)) throw at(i, "a quoted skills key");
  }
  const tops = content.filter(([l]) => /^skills\s*:(\s|$)/.test(l)).map(([, i]) => i);
  if (tops.length > 1) throw at(tops[1], "skills: appears twice");
  const result = { lines, eol, bom, skills: null, ext: null, entries: [] };
  if (tops.length === 0) return result;

  const s = tops[0];
  const after = lines[s].replace(/^skills\s*:/, "");
  let flowEmpty = false;
  if (/^\s*\{\s*\}\s*(#.*)?$/.test(after)) flowEmpty = true;
  else if (!blankOrComment(after)) throw at(s, "skills: is not a block of `key: value` lines below it");
  let end = s + 1; // the skills block runs to the next top-level key
  while (end < lines.length && (blankOrComment(lines[end]) || indentOf(lines[end]) > 0)) end++;
  let last = s; // its last indented line, comments too: a new key goes after it
  for (let i = s + 1; i < end; i++) {
    if (blankOrComment(lines[i]) && lines[i].trim() === "") continue;
    if (/^ *\t/.test(lines[i])) throw at(i, "indented with a tab (YAML allows spaces only)");
    if (indentOf(lines[i]) > 0) last = i;
  }
  if (flowEmpty && last !== s) throw at(s, "skills: {} with lines below it");
  const children = [];
  for (let i = s + 1; i < end; i++) if (!blankOrComment(lines[i])) children.push(i);
  const childIndent = children.length ? indentOf(lines[children[0]]) : 2;
  for (const i of children) if (indentOf(lines[i]) < childIndent) throw at(i, "uneven indentation in the skills block");
  result.skills = { line: s, flowEmpty, last, childIndent };

  const keys = children.filter((i) => indentOf(lines[i]) === childIndent && /^ *external_dirs\s*:(\s|$)/.test(lines[i]));
  if (keys.length > 1) throw at(keys[1], "external_dirs appears twice");
  if (keys.length === 0) return result;

  const k = keys[0];
  const where = `config.yaml line ${k + 1}`;
  const value = lines[k].replace(/^ *external_dirs\s*:/, "");
  const ext = { line: k, keyIndent: childIndent };
  if (blankOrComment(value)) {
    // a block list below the key, or nothing (null)
    const items = [];
    for (let i = k + 1; i < end; i++) {
      if (blankOrComment(lines[i])) continue;
      const ind = indentOf(lines[i]);
      const item = lines[i].match(/^ *-(\s+(.*))?$/);
      if (ind < childIndent || (ind === childIndent && !item)) break;
      if (!item) throw at(i, "external_dirs has a value over more than one line");
      if (items.length && ind !== items[0].indent) throw at(i, "uneven indentation in external_dirs");
      if (!item[2]) throw at(i, "an external_dirs item with no path on its line");
      items.push({ line: i, indent: ind, value: scalar(item[2], `config.yaml line ${i + 1}`) });
    }
    Object.assign(ext, items.length ? { style: "block", items } : { style: "null", items });
  } else if (value.trim().startsWith("[")) {
    const m = value.match(/^(\s*\[)(.*?)\](\s*(#.*)?)$/);
    if (!m) throw at(k, "external_dirs is a […] list over more than one line");
    const open = lines[k].length - value.length + m[1].length;
    Object.assign(ext, { style: "flow", items: flowItems(m[2], where).map((v) => ({ value: v })), open, close: open + m[2].length });
  } else {
    const raw = value.replace(/\s+#.*$/, "").trim();
    Object.assign(ext, { style: "scalar", raw, comment: value.slice(value.indexOf(raw) + raw.length).trim(), items: [{ value: scalar(value, where) }] });
  }
  result.ext = ext;
  result.entries = ext.items.map((it) => it.value);
  return result;
}

// A path as a YAML scalar: plain when that is safe, else 'single quoted' (no escapes to get wrong).
const yamlPath = (p) => (/^[\w~\/.][\w~\/. ()+=@-]*$/.test(p) && !p.endsWith(" ") ? p : `'${p.replaceAll("'", "''")}'`);

// config.yaml with `dir` added to skills.external_dirs, or null when `isDir` matches an entry already.
export function addHermesSkillsDir(text, dir, isDir) {
  const c = readHermesConfig(text);
  if (c.entries.some(isDir)) return null;
  const { lines, skills, ext } = c;
  const item = yamlPath(dir);
  const pad = (n) => " ".repeat(n);
  if (!skills) {
    while (lines.length && lines.at(-1).trim() === "") lines.pop();
    if (lines.length) lines.push("");
    lines.push("skills:", "  external_dirs:", `    - ${item}`, "");
  } else if (!ext) {
    if (skills.flowEmpty) lines[skills.line] = lines[skills.line].replace(/\{\s*\}\s*/, "").trimEnd();
    const ci = skills.childIndent;
    lines.splice(skills.last + 1, 0, `${pad(ci)}external_dirs:`, `${pad(ci + 2)}- ${item}`);
  } else if (ext.style === "null") {
    lines.splice(ext.line + 1, 0, `${pad(ext.keyIndent + 2)}- ${item}`);
  } else if (ext.style === "block") {
    const lastItem = ext.items.at(-1);
    lines.splice(lastItem.line + 1, 0, `${pad(lastItem.indent)}- ${item}`);
  } else if (ext.style === "flow") {
    const l = lines[ext.line];
    const inner = l.slice(ext.open, ext.close);
    const joined = inner.trim() === "" ? item : `${inner.replace(/,?\s*$/, "")}, ${item}`;
    lines[ext.line] = l.slice(0, ext.open) + joined + l.slice(ext.close);
  } else {
    const key = `${pad(ext.keyIndent)}external_dirs:${ext.comment ? ` ${ext.comment}` : ""}`;
    lines.splice(ext.line, 1, key, `${pad(ext.keyIndent + 2)}- ${ext.raw}`, `${pad(ext.keyIndent + 2)}- ${item}`);
  }
  const out = c.bom + lines.join(c.eol);
  if (!readHermesConfig(out).entries.some(isDir)) throw new Error("install.mjs bug: the new config.yaml does not list the brain's skills");
  return out;
}

// SKILL.md files under `root` that Hermes would also find by one of `names` (its folder name or the
// frontmatter name), like tools/skills_tool.py: the same file through a link is not a second skill.
const SKIPPED_DIRS = new Set([".git", ".github", ".hub", ".archive", ".curator_backups", ".locks", ".venv", "venv", "node_modules", "site-packages", "__pycache__"]);
const SUPPORT_DIRS = new Set(["references", "templates", "assets", "scripts"]);
const frontmatterName = (text) =>
  text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1];

export function hermesSkillsNamed(f, root, names) {
  const found = [];
  const seen = new Set();
  const walk = (dir, inSkill) => {
    let real;
    try {
      real = f.realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);
    let entries;
    try {
      entries = f.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const isSkill = entries.some((e) => e.name === "SKILL.md");
    if (isSkill) {
      const file = path.join(dir, "SKILL.md");
      let fm;
      try {
        fm = frontmatterName(f.readFileSync(file, "utf8"));
      } catch {}
      const name = names.find((n) => n === path.basename(dir) || n === fm);
      if (name) found.push({ name, file });
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (!inSkill && !isSkill && e.name.endsWith(".md") && e.name !== "SKILL.md" && names.includes(e.name.slice(0, -3))) {
        found.push({ name: e.name.slice(0, -3), file: p }); // Hermes also loads a loose <name>.md as a skill
      }
      let dirLike = e.isDirectory();
      if (e.isSymbolicLink()) {
        try {
          dirLike = f.statSync(p).isDirectory();
        } catch {}
      }
      if (!dirLike || SKIPPED_DIRS.has(e.name) || (isSkill && SUPPORT_DIRS.has(e.name))) continue;
      walk(p, inSkill || isSkill);
    }
  };
  walk(root, false);
  return found;
}

export function install({ brain, env, home, platform, fs: f = fs, onPath, tmpdir = os.tmpdir(), log = console.log }) {
  const skillsRoot = path.join(brain, "skills");
  const isDir = (p) => {
    try {
      return f.statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const skills = f
    .readdirSync(skillsRoot)
    .filter((name) => !name.startsWith(".") && isDir(path.join(skillsRoot, name)))
    .sort();
  const has = (p) => f.existsSync(p);
  const short = (p) => (p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);
  const agents = findAgents({ env, home, platform, has, onPath: onPath || makeOnPath({ env, platform, fs: f }) });
  const found = agents.filter((a) => a.found);
  if (found.length === 0) {
    log("No coding agent found on this machine (looked for Claude Code, Codex, Cursor and Hermes). Install one, then run node install.mjs again.");
    return 1;
  }
  const notes = [];

  // Hermes: read its config.yaml before changing anything, so a file this script can't read stops it here.
  const hermes = found.find((a) => a.config);
  let hermesPlan = null;
  if (hermes) {
    const isBrainSkills = (entry) => sameDir(f, platform, path.resolve(hermes.hermesHome, expandHome(entry, env, home)), skillsRoot);
    hermesPlan = { config: has(hermes.config) ? f.readFileSync(hermes.config, "utf8") : null, next: null };
    if (hermesPlan.config !== null) {
      try {
        hermesPlan.next = addHermesSkillsDir(hermesPlan.config, skillsRoot, isBrainSkills);
      } catch (err) {
        if (!(err instanceof HermesConfigError)) throw err;
        log(`Hermes: ${err.message}. This script edits config.yaml only when it can read it for sure, so it changed nothing on this machine.`);
        log(`Fix that line, or add ${skillsRoot} to skills.external_dirs in ${hermes.config} yourself, then run node install.mjs again.`);
        return 1;
      }
      // Hermes refuses a skill name that two of its skill folders provide: say which brain skill clashes.
      const brainFiles = new Map();
      for (const name of skills) {
        const file = path.join(skillsRoot, name, "SKILL.md");
        let fm;
        try {
          fm = frontmatterName(f.readFileSync(file, "utf8"));
        } catch {}
        for (const n of [name, fm]) if (n) brainFiles.set(n, f.realpathSync(path.join(skillsRoot, name)));
      }
      const entries = readHermesConfig(hermesPlan.next ?? hermesPlan.config).entries;
      const roots = [path.join(hermes.hermesHome, "skills"), ...entries.map((e) => path.resolve(hermes.hermesHome, expandHome(e, env, home)))];
      const searched = [];
      for (const root of roots) {
        if (!isDir(root) || sameDir(f, platform, root, skillsRoot) || searched.some((r) => sameDir(f, platform, r, root))) continue;
        searched.push(root);
        for (const { name, file } of hermesSkillsNamed(f, root, [...brainFiles.keys()])) {
          let real;
          try {
            real = f.realpathSync(file);
          } catch {
            continue; // a broken link: Hermes can't read it either
          }
          if (!real.startsWith(brainFiles.get(name) + path.sep)) {
            notes.push(`Hermes: a skill named ${name} is also at ${short(file)}. Hermes refuses a skill name that two of its skill folders provide ("Ambiguous skill name") and loads neither: rename or remove one of them.`);
          }
        }
      }
    }
  }

  // Windows makes links only with Developer Mode (or as admin): find out before changing anything.
  if (platform === "win32" && found.some((a) => a.skills)) {
    const probe = path.join(tmpdir, `brain-link-test-${process.pid}`);
    try {
      f.symlinkSync(skillsRoot, probe, "dir");
      f.unlinkSync(probe);
    } catch (err) {
      if (windowsRefused(err, platform)) {
        log(DEV_MODE);
        return 1;
      }
      throw err;
    }
  }

  const linked = new Map(); // skills folder -> per-skill results, so a shared folder is linked once
  const pointed = new Map(); // instruction file -> "added" | "already in"
  for (const agent of found) {
    if (agent.config) {
      if (hermesPlan.config === null) {
        hermesPlan.state = "none: no";
      } else if (hermesPlan.next === null) {
        hermesPlan.state = `${skills.length} already in external_dirs in`;
      } else {
        // Keep the config as it was before the first change: config.yaml.bak (Hermes never touches that name).
        let backup = `${agent.config}.bak`;
        try {
          f.copyFileSync(agent.config, backup, fs.constants.COPYFILE_EXCL);
        } catch (err) {
          if (err.code !== "EEXIST") throw err;
          backup = `${agent.config}.bak-brain-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
          f.copyFileSync(agent.config, backup);
        }
        f.writeFileSync(agent.config, hermesPlan.next);
        hermesPlan.state = `${skills.length} added to external_dirs in`;
        notes.push(`Hermes: the config.yaml from before this change is saved as ${short(backup)}.`);
      }
    }
    if (agent.skills && !linked.has(agent.skills)) {
      f.mkdirSync(agent.skills, { recursive: true });
      const results = [];
      for (const name of skills) {
        const link = path.join(agent.skills, name);
        try {
          results.push([name, linkSkill(f, platform, path.join(skillsRoot, name), link)]);
        } catch (err) {
          if (windowsRefused(err, platform)) {
            log(DEV_MODE);
            return 1;
          }
          throw err;
        }
        if (results.at(-1)[1] === "left alone") notes.push(`skill ${name}: ${link} exists and is not a link, left it alone`);
      }
      linked.set(agent.skills, results);
    }
    if (agent.file && !pointed.has(agent.file)) {
      const text = has(agent.file) ? f.readFileSync(agent.file, "utf8") : "";
      const pointers = [...text.matchAll(/My second brain is at (.+?)\. Read its index\.md first/g)];
      if (pointers.some((m) => sameDir(f, platform, m[1], brain))) {
        pointed.set(agent.file, "already in");
      } else if (agent.config && text.trim() === "") {
        // An empty or missing SOUL.md means Hermes's built-in persona; a SOUL.md with only this line would replace it.
        pointed.set(agent.file, "not written:");
        notes.push(
          has(agent.file)
            ? `Hermes: ${short(agent.file)} is empty, so Hermes uses its built-in persona, and a SOUL.md with only the pointer line would replace it. Write your persona there with this line below it:\n${pointerLine(brain)}`
            : `Hermes has not run here yet: it writes ${short(agent.file)} (and config.yaml) when it starts. Run hermes once, then node install.mjs again.`,
        );
      } else {
        f.mkdirSync(path.dirname(agent.file), { recursive: true });
        f.appendFileSync(agent.file, `\n${pointerLine(brain)}\n`);
        pointed.set(agent.file, "added to");
      }
      if (agent.override && has(agent.override)) {
        notes.push(`Codex reads ${agent.override} instead of AGENTS.md while it exists: add the line there too, or remove it.`);
      }
    }
  }

  const rows = agents.map((a) => {
    if (!a.found) return [a.name, "not found", "-"];
    if (a.config) return [a.name, `${hermesPlan.state} ${short(a.config)}`, `${pointed.get(a.file)} ${short(a.file)}`];
    const states = linked.get(a.skills).map(([, state]) => state);
    const counts = ["linked", "link ok", "left alone"]
      .map((s) => [s, states.filter((x) => x === s).length])
      .filter(([, n]) => n > 0);
    const skillCell = `${counts.map(([s, n]) => `${n} ${s}`).join(", ")} in ${short(a.skills)}`;
    const pointerCell = a.file ? `${pointed.get(a.file)} ${short(a.file)}` : "paste it (below)";
    return [a.name, skillCell, pointerCell];
  });
  const table = [["agent", "skills", "pointer line"], ...rows];
  const widths = [0, 1].map((i) => Math.max(...table.map((r) => r[i].length)));
  log(`brain: ${brain} (${skills.length} skills)\n`);
  for (const r of table) log(`${r[0].padEnd(widths[0])}  ${r[1].padEnd(widths[1])}  ${r[2]}`);
  for (const n of notes) log(`\n${n}`);
  if (hermes && (hermesPlan.next !== null || pointed.get(hermes.file) === "added to")) {
    log("\nHermes reads its skills and SOUL.md when a session starts: start a new session to use the brain.");
  }
  for (const a of found.filter((x) => x.paste)) {
    log(`\n${a.name} keeps its rules in its settings, not in a file. Paste this line into ${a.paste}:\n${pointerLine(brain)}`);
  }
  return 0;
}

// Run as a script (not imported by the tests). Windows paths ignore case.
const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (process.platform === "win32" ? invoked.toLowerCase() === self.toLowerCase() : invoked === self) {
  process.exitCode = install({
    brain: path.dirname(self),
    env: process.env,
    home: os.homedir(),
    platform: process.platform,
  });
}
