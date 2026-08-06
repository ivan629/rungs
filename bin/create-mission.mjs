#!/usr/bin/env node
// Installs mission into the current repo: one bundled file, a starter
// mission.json, the method docs, and the /mission agent skill. Zero
// dependencies added to the host. Never overwrites anything that exists.

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.cwd();

if (existsSync(join(target, "mission"))) {
  console.error("mission/ already exists here — nothing touched. Delete it first to reinstall.");
  process.exit(1);
}

const put = (from, to) => {
  mkdirSync(dirname(join(target, to)), { recursive: true });
  copyFileSync(join(pkgRoot, from), join(target, to));
  console.log(`  + ${to}`);
};

put("dist/cli.mjs", "mission/cli.mjs");
put("mission/mission.json", "mission/mission.json");
mkdirSync(join(target, "mission/data"), { recursive: true });

if (!existsSync(join(target, "docs/method.md"))) put("docs/method.md", "docs/method.md");
if (!existsSync(join(target, "docs/journal.md"))) put("docs/journal.md", "docs/journal.md");
if (!existsSync(join(target, ".claude/skills/mission/SKILL.md")))
  put(".claude/skills/mission/SKILL.md", ".claude/skills/mission/SKILL.md");

// package.json: create a minimal one if absent; add the script if not taken.
const pkgFile = join(target, "package.json");
const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : { name: basename(target), private: true };
pkg.scripts ??= {};
if (pkg.scripts.mission) {
  console.log(`  · package.json already has a "mission" script — left as is`);
} else {
  pkg.scripts.mission = "node mission/cli.mjs";
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  ~ package.json — added "mission" script`);
}

// .gitignore: append only the lines that are missing.
const giFile = join(target, ".gitignore");
const existing = existsSync(giFile) ? readFileSync(giFile, "utf8") : "";
const lines = ["mission/out/", "mission/capabilities.json"].filter((line) => !existing.split("\n").includes(line));
if (lines.length) {
  appendFileSync(giFile, `${existing.endsWith("\n") || !existing ? "" : "\n"}${lines.join("\n")}\n`);
  console.log(`  ~ .gitignore — added ${lines.join(", ")}`);
}

console.log(`
mission installed. Next:

  1. npm run mission          — see the board now (works before anything is wired)
  2. in your agent: /mission init   — it interviews you (3 questions), scans the
     repo for bindable sources, and writes mission.json for you
`);
