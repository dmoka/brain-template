#!/usr/bin/env node
// Connect this brain to the coding agents on this machine (Claude Code, Codex, Cursor). Safe to run again.
//  1. links the brain's skills into each agent's global skills folder (links only, never copies)
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
export function findAgents({ env, home, platform, has, onPath }) {
  const claudeDir = env.CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  const codexHome = env.CODEX_HOME || path.join(home, ".codex");
  const cursorConfig = {
    darwin: path.join(home, "Library", "Application Support", "Cursor"),
    win32: path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "Cursor"),
  }[platform] || path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "Cursor");
  const agentsSkills = path.join(home, ".agents", "skills");
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
  ];
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
  const agents = findAgents({ env, home, platform, has, onPath: onPath || makeOnPath({ env, platform, fs: f }) });
  const found = agents.filter((a) => a.found);
  if (found.length === 0) {
    log("No coding agent found on this machine (looked for Claude Code, Codex and Cursor). Install one, then run node install.mjs again.");
    return 1;
  }

  // Windows makes links only with Developer Mode (or as admin): find out before changing anything.
  if (platform === "win32") {
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
  const notes = [];
  for (const agent of found) {
    if (!linked.has(agent.skills)) {
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
      f.mkdirSync(path.dirname(agent.file), { recursive: true });
      const text = has(agent.file) ? f.readFileSync(agent.file, "utf8") : "";
      const pointers = [...text.matchAll(/My second brain is at (.+?)\. Read its index\.md first/g)];
      if (pointers.some((m) => sameDir(f, platform, m[1], brain))) {
        pointed.set(agent.file, "already in");
      } else {
        f.appendFileSync(agent.file, `\n${pointerLine(brain)}\n`);
        pointed.set(agent.file, "added to");
      }
      if (agent.override && has(agent.override)) {
        notes.push(`Codex reads ${agent.override} instead of AGENTS.md while it exists: add the line there too, or remove it.`);
      }
    }
  }

  const short = (p) => (p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);
  const rows = agents.map((a) => {
    if (!a.found) return [a.name, "not found", "-"];
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
