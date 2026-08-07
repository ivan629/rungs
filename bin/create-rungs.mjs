#!/usr/bin/env node
// Installs rungs into the current repo: one bundled file, a starter
// mission.json, the method docs, and the /rungs agent skill. Zero
// dependencies added to the host. Never overwrites anything that exists.

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.cwd();

if (existsSync(join(target, "rungs"))) {
  console.error("rungs/ already exists here — nothing touched. Delete it first to reinstall.");
  process.exit(1);
}

const put = (from, to) => {
  mkdirSync(dirname(join(target, to)), { recursive: true });
  copyFileSync(join(pkgRoot, from), join(target, to));
  console.log(`  + ${to}`);
};

put("dist/cli.mjs", "rungs/cli.mjs");
put("rungs/mission.json", "rungs/mission.json");
mkdirSync(join(target, "rungs/data"), { recursive: true });

if (!existsSync(join(target, "docs/method.md"))) put("docs/method.md", "docs/method.md");
if (!existsSync(join(target, "docs/journal.md"))) put("docs/journal.md", "docs/journal.md");
if (!existsSync(join(target, ".claude/skills/rungs/SKILL.md")))
  put(".claude/skills/rungs/SKILL.md", ".claude/skills/rungs/SKILL.md");

// package.json: create a minimal one if absent; add the script if not taken.
const pkgFile = join(target, "package.json");
const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : { name: basename(target), private: true };
pkg.scripts ??= {};
if (pkg.scripts.rungs) {
  console.log(`  · package.json already has a "rungs" script — left as is`);
} else {
  pkg.scripts.rungs = "node rungs/cli.mjs";
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  ~ package.json — added "rungs" script`);
}

// .gitignore: append only the lines that are missing.
const giFile = join(target, ".gitignore");
const existing = existsSync(giFile) ? readFileSync(giFile, "utf8") : "";
const lines = ["rungs/out/", "rungs/capabilities.json"].filter((line) => !existing.split("\n").includes(line));
if (lines.length) {
  appendFileSync(giFile, `${existing.endsWith("\n") || !existing ? "" : "\n"}${lines.join("\n")}\n`);
  console.log(`  ~ .gitignore — added ${lines.join(", ")}`);
}

console.log(`
rungs installed. Next:

  1. npm run rungs          — see the board now (works before anything is wired)
  2. in your agent: /rungs init   — it interviews you (3 questions), scans the
     repo for bindable sources, and writes mission.json for you
`);
