# Codex CLI + Kimi Code Marketplace Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Codex CLI and Kimi Code marketplace/plugin manifests, generated from the same `skills/*/SKILL.md` frontmatter that already drives the Claude Code marketplace, so all three agents get a native `/plugin(s) marketplace` install path with per-skill granularity.

**Architecture:** Extract the SKILL.md frontmatter parsing/validation/version-reading that `scripts/generate-manifests.mjs` already has into a shared `scripts/lib/skills.mjs`. Add two new standalone generator scripts (`scripts/generate-codex-manifests.mjs`, `scripts/generate-kimi-manifests.mjs`) that import from the shared lib and each emit their own agent-native manifest files. Wire both into the existing CI drift gate. Update README/CLAUDE.md.

**Tech Stack:** Node.js (`node:fs`, `node:path`, `node:url`), `node:test` + `node:assert/strict` — zero dependencies, matching the existing generator.

**Spec:** `docs/superpowers/specs/2026-08-20-codex-kimi-marketplace-design.md`

## Global Constraints

- No new npm dependencies — pure Node built-ins, matching the existing generator.
- Every generated file is committed to git (none are gitignored) — same policy as the existing `.claude-plugin/marketplace.json`.
- `scripts/generate-manifests.mjs`'s existing public exports and behavior must not change — `scripts/generate-manifests.test.mjs` must pass unmodified.
- Codex plugin.json required fields (verified against `openai/codex`'s own `plugin-json-spec.md`): `name`, `version`, `description`, `author.name`, `interface.displayName`, `interface.shortDescription`, `interface.longDescription`.
- Codex marketplace.json plugin entries require: `name`, `source.source: "local"`, `source.path`, `policy.installation`, `policy.authentication`, `category`.
- Fixed Codex defaults (no SKILL.md equivalent): `category: "Productivity"`, `policy.installation: "AVAILABLE"`, `policy.authentication: "ON_USE"`.
- Kimi plugin manifest (`kimi.plugin.json`) required field: `name` matching `^[a-z0-9][a-z0-9_-]{0,63}$` (already guaranteed by existing skill-name validation).
- Kimi marketplace.json schema: `{"version": "2", "plugins": [{"id", "displayName", "source"}]}`.
- Bundle plugin identity is `ake-skills` in every agent (matches the existing Claude bundle name).

---

## File Structure

```
scripts/
  lib/
    skills.mjs                      # NEW — shared frontmatter parsing/validation/version/utils
  generate-manifests.mjs            # MODIFIED — imports from lib, behavior unchanged
  generate-manifests.test.mjs       # UNCHANGED
  generate-codex-manifests.mjs      # NEW
  generate-codex-manifests.test.mjs # NEW
  generate-kimi-manifests.mjs       # NEW
  generate-kimi-manifests.test.mjs  # NEW
.codex-plugin/
  plugin.json                       # GENERATED — Codex bundle manifest
.agents/plugins/
  marketplace.json                  # GENERATED — Codex marketplace catalog
kimi.plugin.json                    # GENERATED — Kimi bundle manifest
marketplace.json                    # GENERATED — Kimi marketplace catalog
skills/<name>/
  .codex-plugin/plugin.json         # GENERATED — Codex per-skill manifest
  kimi.plugin.json                  # GENERATED — Kimi per-skill manifest
.github/workflows/validate.yml      # MODIFIED — run new generators + broaden test glob
README.md                           # MODIFIED — Codex/Kimi install sections
CLAUDE.md                           # MODIFIED — structure + workflow instructions
```

---

### Task 1: Extract shared parsing/validation into `scripts/lib/skills.mjs`

**Files:**
- Create: `scripts/lib/skills.mjs`
- Modify: `scripts/generate-manifests.mjs`
- Test: `scripts/generate-manifests.test.mjs` (must pass unmodified — no edits to this file)

**Interfaces:**
- Produces (from `scripts/lib/skills.mjs`, consumed by Tasks 2 and 3):
  - `MARKETPLACE_NAME: string` — `'ake-skills'`
  - `OWNER: { name: string }`
  - `parseFrontmatter(text: string, filePath: string): object`
  - `validateSkill(dirName: string, fm: object): string[]`
  - `loadSkills(root: string): Array<{name: string, description: string}>`
  - `readVersion(root: string): string`
  - `firstSentence(description: string): string`
  - `titleCase(name: string): string` — `'glab-workflow'` → `'Glab Workflow'`
  - `writeJson(path: string, data: object): void` — creates parent dirs, writes pretty JSON with trailing newline

- [ ] **Step 1: Run the existing test suite to confirm current behavior (characterization baseline)**

Run: `node --test scripts/generate-manifests.test.mjs`
Expected: PASS (all existing tests green before touching anything)

- [ ] **Step 2: Create `scripts/lib/skills.mjs` with the extracted + new shared functions**

```js
// scripts/lib/skills.mjs
// Shared SKILL.md frontmatter parsing, validation, version reading, and
// small formatting utilities used by every scripts/generate-*-manifests.mjs
// generator. Keeping this in one place means Claude/Codex/Kimi manifests
// can never read the same SKILL.md two different ways.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const MARKETPLACE_NAME = 'ake-skills';
export const OWNER = { name: 'Alkim Ake Gozen' };
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFrontmatter(text, filePath) {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    throw new Error(`${filePath}: file must start with a --- frontmatter block`);
  }
  const end = lines.findIndex((l, i) => i >= 1 && /^---\s*$/.test(l));
  if (end === -1) {
    throw new Error(`${filePath}: unterminated frontmatter block`);
  }
  const fm = {};
  let currentKey = null;
  let folded = [];
  const flush = () => {
    if (currentKey) {
      fm[currentKey] = folded.join(' ').trim();
      currentKey = null;
      folded = [];
    }
  };
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const keyMatch = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (keyMatch) {
      flush();
      const key = keyMatch[1];
      const rest = keyMatch[2].trim();
      if (rest === '' || rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
        currentKey = key;
      } else {
        fm[key] = rest.replace(/^["']|["']$/g, '');
      }
    } else if (currentKey && line.trim() !== '') {
      // Folded semantics only: newlines (including from | blocks) collapse to spaces.
      folded.push(line.trim());
    }
  }
  flush();
  return fm;
}

export function validateSkill(dirName, fm) {
  const errors = [];
  if (!fm.name) {
    errors.push('missing required field: name');
  } else {
    if (fm.name !== dirName) {
      errors.push(`name "${fm.name}" does not match directory name "${dirName}"`);
    }
    if (fm.name.length > 64) {
      errors.push(`name is ${fm.name.length} chars (max 64)`);
    }
    if (!NAME_RE.test(fm.name)) {
      errors.push('name must be lowercase alphanumeric with single hyphens');
    }
  }
  if (!fm.description) {
    errors.push('missing required field: description');
  } else if (fm.description.length > 1024) {
    errors.push(`description is ${fm.description.length} chars (max 1024)`);
  }
  return errors;
}

export function loadSkills(root) {
  const skillsDir = join(root, 'skills');
  if (!existsSync(skillsDir)) {
    throw new Error('skills/ directory not found — run from the repo root');
  }
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const skills = [];
  const errors = [];
  for (const dir of dirs) {
    const rel = `skills/${dir}/SKILL.md`;
    const skillPath = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      errors.push(`${rel}: missing SKILL.md`);
      continue;
    }
    try {
      const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'), rel);
      const errs = validateSkill(dir, fm);
      if (errs.length) {
        errors.push(...errs.map((e) => `${rel}: ${e}`));
      } else {
        skills.push({ name: fm.name, description: fm.description });
      }
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (errors.length) {
    throw new Error('skill validation failed:\n  ' + errors.join('\n  '));
  }
  return skills;
}

export function readVersion(root) {
  const versionPath = join(root, 'VERSION');
  if (!existsSync(versionPath)) {
    console.warn('warning: VERSION file not found, using 0.0.0');
    return '0.0.0';
  }
  const v = readFileSync(versionPath, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v)) {
    throw new Error(`VERSION: "${v}" is not valid semver`);
  }
  return v;
}

export function firstSentence(description) {
  const m = description.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : description;
}

export function titleCase(name) {
  return name
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
```

- [ ] **Step 3: Rewrite `scripts/generate-manifests.mjs` to import from the shared lib, re-exporting the moved functions so the test file needs no changes**

```js
#!/usr/bin/env node
// Generates .claude-plugin/marketplace.json and the README skill table
// from skills/*/SKILL.md frontmatter. Zero dependencies. See
// docs/superpowers/specs/2026-06-12-skills-marketplace-design.md
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseFrontmatter,
  validateSkill,
  loadSkills,
  readVersion,
  firstSentence,
  MARKETPLACE_NAME,
  OWNER,
} from './lib/skills.mjs';

// Re-exported for scripts/generate-manifests.test.mjs, which imports these
// from this file directly.
export { parseFrontmatter, validateSkill, loadSkills, readVersion, firstSentence };

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildMarketplace(skills, version) {
  // The bundle relies on Claude Code's auto-discovery of <plugin-root>/skills/.
  // An explicit `skills` array would SUPPLEMENT auto-discovery, duplicating
  // every skill (verified against claude CLI 2.x `plugin details`).
  const bundle = {
    name: MARKETPLACE_NAME,
    source: './',
    description: 'All skills in this collection as one bundle',
    version,
    author: OWNER,
    strict: false,
  };
  const perSkill = skills.map((s) => ({
    name: s.name,
    source: `./skills/${s.name}`,
    description: s.description,
    version,
    author: OWNER,
    strict: false,
    skills: ['./'],
  }));
  return {
    name: MARKETPLACE_NAME,
    description: 'Personal cross-agent skill collection',
    owner: OWNER,
    plugins: [bundle, ...perSkill],
  };
}

export function renderReadmeTable(skills) {
  const rows = skills.map(
    (s) => `| [\`${s.name}\`](skills/${s.name}) | ${firstSentence(s.description).replaceAll('|', '\\|')} |`,
  );
  return ['| Skill | Description |', '|---|---|', ...rows].join('\n');
}

export function updateReadme(content, table) {
  const start = '<!-- skills:start -->';
  const end = '<!-- skills:end -->';
  const si = content.indexOf(start);
  const ei = content.indexOf(end);
  if (si === -1 || ei === -1) {
    throw new Error('README.md: missing <!-- skills:start --> / <!-- skills:end --> markers');
  }
  if (ei < si) {
    throw new Error('README.md: <!-- skills:end --> appears before <!-- skills:start -->');
  }
  return content.slice(0, si + start.length) + '\n' + table + '\n' + content.slice(ei);
}

function main() {
  const skills = loadSkills(REPO_ROOT);
  const version = readVersion(REPO_ROOT);
  const marketplace = buildMarketplace(skills, version);
  const readmePath = join(REPO_ROOT, 'README.md');
  const newReadme = updateReadme(readFileSync(readmePath, 'utf8'), renderReadmeTable(skills));
  mkdirSync(join(REPO_ROOT, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(marketplace, null, 2) + '\n',
  );
  writeFileSync(readmePath, newReadme);
  console.log(`generated marketplace.json (${skills.length} skills, version ${version})`);
}

// URL comparison (not path) so the guard works for relative invocations
// like `node scripts/generate-manifests.mjs`
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run the test suite again to confirm no regression**

Run: `node --test scripts/generate-manifests.test.mjs`
Expected: PASS, identical test count and results to Step 1

- [ ] **Step 5: Run the generator itself and confirm zero git diff (output byte-identical to before the refactor)**

Run: `node scripts/generate-manifests.mjs && git diff --stat`
Expected: only `scripts/generate-manifests.mjs` shows as changed (the refactor itself) — `.claude-plugin/marketplace.json` and `README.md` show NO diff

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/skills.mjs scripts/generate-manifests.mjs
git commit -m "refactor: extract shared SKILL.md parsing into scripts/lib/skills.mjs

Prep for Codex/Kimi manifest generators, which need the same
frontmatter parsing/validation/version-reading. generate-manifests.mjs
re-exports the moved functions so its test suite needs no changes.
No behavior change — generated output is byte-identical."
```

---

### Task 2: Codex CLI manifest generator

**Files:**
- Create: `scripts/generate-codex-manifests.mjs`
- Test: `scripts/generate-codex-manifests.test.mjs`

**Interfaces:**
- Consumes: `loadSkills`, `readVersion`, `firstSentence`, `titleCase`, `writeJson`, `MARKETPLACE_NAME`, `OWNER` from `./lib/skills.mjs` (Task 1)
- Produces (consumed by Task 4's CI step and Task 5's README):
  - `buildCodexPluginManifest(skill: {name, description}, version: string, opts: {skillsPath: string}): object`
  - `buildCodexMarketplace(skills: Array<{name, description}>, version: string): object`
  - Writes `.codex-plugin/plugin.json` (repo root), `.agents/plugins/marketplace.json` (repo root), `skills/<name>/.codex-plugin/plugin.json` (per skill)

- [ ] **Step 1: Write the failing tests**

```js
// scripts/generate-codex-manifests.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexPluginManifest, buildCodexMarketplace } from './generate-codex-manifests.mjs';

test('buildCodexPluginManifest fills required fields from skill + version', () => {
  const m = buildCodexPluginManifest(
    { name: 'unslop', description: 'Removes AI slop. Second sentence.' },
    '1.2.3',
    { skillsPath: './' },
  );
  assert.equal(m.name, 'unslop');
  assert.equal(m.version, '1.2.3');
  assert.equal(m.description, 'Removes AI slop. Second sentence.');
  assert.deepEqual(m.author, { name: 'Alkim Ake Gozen' });
  assert.equal(m.skills, './');
  assert.equal(m.interface.displayName, 'Unslop');
  assert.equal(m.interface.shortDescription, 'Removes AI slop.');
  assert.equal(m.interface.longDescription, 'Removes AI slop. Second sentence.');
});

test('buildCodexPluginManifest honors a multi-word hyphenated skill name', () => {
  const m = buildCodexPluginManifest(
    { name: 'glab-workflow', description: 'GitLab things.' },
    '0.1.0',
    { skillsPath: './' },
  );
  assert.equal(m.interface.displayName, 'Glab Workflow');
});

test('buildCodexMarketplace emits bundle first with skills path ./skills, then one plugin per skill', () => {
  const mkt = buildCodexMarketplace(
    [{ name: 'alpha', description: 'A.' }, { name: 'beta', description: 'B.' }],
    '1.0.0',
  );
  assert.equal(mkt.name, 'ake-skills');
  assert.equal(mkt.plugins.length, 3);

  const bundle = mkt.plugins[0];
  assert.equal(bundle.name, 'ake-skills');
  assert.deepEqual(bundle.source, { source: 'local', path: './' });
  assert.equal(bundle.category, 'Productivity');
  assert.equal(bundle.policy.installation, 'AVAILABLE');
  assert.equal(bundle.policy.authentication, 'ON_USE');

  const alpha = mkt.plugins[1];
  assert.equal(alpha.name, 'alpha');
  assert.deepEqual(alpha.source, { source: 'local', path: './skills/alpha' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/generate-codex-manifests.test.mjs`
Expected: FAIL — `Cannot find module './generate-codex-manifests.mjs'`

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// Generates Codex CLI plugin manifests (.codex-plugin/plugin.json, one at
// repo root plus one per skill) and the repo-scoped marketplace catalog
// (.agents/plugins/marketplace.json) from skills/*/SKILL.md frontmatter.
// Schema grounded in openai/codex's own plugin-json-spec.md. See
// docs/superpowers/specs/2026-08-20-codex-kimi-marketplace-design.md
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { loadSkills, readVersion, firstSentence, titleCase, writeJson, MARKETPLACE_NAME, OWNER } from './lib/skills.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = { name: MARKETPLACE_NAME, description: 'All skills in this collection as one bundle' };
const CATEGORY = 'Productivity';
const POLICY = { installation: 'AVAILABLE', authentication: 'ON_USE' };

export function buildCodexPluginManifest(skill, version, { skillsPath }) {
  return {
    name: skill.name,
    version,
    description: skill.description,
    author: OWNER,
    skills: skillsPath,
    interface: {
      displayName: titleCase(skill.name),
      shortDescription: firstSentence(skill.description),
      longDescription: skill.description,
    },
  };
}

export function buildCodexMarketplace(skills, version) {
  const bundle = {
    name: MARKETPLACE_NAME,
    source: { source: 'local', path: './' },
    policy: POLICY,
    category: CATEGORY,
  };
  const perSkill = skills.map((s) => ({
    name: s.name,
    source: { source: 'local', path: `./skills/${s.name}` },
    policy: POLICY,
    category: CATEGORY,
  }));
  return {
    name: MARKETPLACE_NAME,
    interface: { displayName: titleCase(MARKETPLACE_NAME) },
    plugins: [bundle, ...perSkill],
  };
}

function main() {
  const skills = loadSkills(REPO_ROOT);
  const version = readVersion(REPO_ROOT);

  writeJson(
    join(REPO_ROOT, '.codex-plugin', 'plugin.json'),
    buildCodexPluginManifest(BUNDLE, version, { skillsPath: './skills' }),
  );
  for (const skill of skills) {
    writeJson(
      join(REPO_ROOT, 'skills', skill.name, '.codex-plugin', 'plugin.json'),
      buildCodexPluginManifest(skill, version, { skillsPath: './' }),
    );
  }
  writeJson(
    join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json'),
    buildCodexMarketplace(skills, version),
  );
  console.log(`generated codex manifests (${skills.length} skills, version ${version})`);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/generate-codex-manifests.test.mjs`
Expected: PASS, all tests green

- [ ] **Step 5: Run the generator and inspect output**

```bash
node scripts/generate-codex-manifests.mjs
cat .codex-plugin/plugin.json
cat .agents/plugins/marketplace.json
cat skills/unslop/.codex-plugin/plugin.json
```
Expected: valid JSON matching the schemas above, one `.codex-plugin/plugin.json` per skill directory, `.agents/plugins/marketplace.json` listing the bundle plus 4 skills (`glab-workflow`, `release`, `subagent-driven-development`, `unslop`)

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-codex-manifests.mjs scripts/generate-codex-manifests.test.mjs \
  .codex-plugin skills/*/.codex-plugin .agents
git commit -m "feat: add Codex CLI marketplace manifest generator

Generates .codex-plugin/plugin.json (repo root + one per skill) and
.agents/plugins/marketplace.json from skills/*/SKILL.md frontmatter.
Schema grounded in openai/codex's plugin-json-spec.md."
```

---

### Task 3: Kimi Code manifest generator

**Files:**
- Create: `scripts/generate-kimi-manifests.mjs`
- Test: `scripts/generate-kimi-manifests.test.mjs`

**Interfaces:**
- Consumes: `loadSkills`, `readVersion`, `firstSentence`, `titleCase`, `writeJson`, `MARKETPLACE_NAME` from `./lib/skills.mjs` (Task 1)
- Produces (consumed by Task 4's CI step and Task 5's README):
  - `buildKimiPluginManifest(skill: {name, description}, version: string, opts: {skillsPath: string}): object`
  - `buildKimiMarketplace(skills: Array<{name, description}>, version: string): object`
  - Writes `kimi.plugin.json` (repo root), `marketplace.json` (repo root), `skills/<name>/kimi.plugin.json` (per skill)

- [ ] **Step 1: Write the failing tests**

```js
// scripts/generate-kimi-manifests.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKimiPluginManifest, buildKimiMarketplace } from './generate-kimi-manifests.mjs';

test('buildKimiPluginManifest fills fields from skill + version', () => {
  const m = buildKimiPluginManifest(
    { name: 'unslop', description: 'Removes AI slop. Second sentence.' },
    '1.2.3',
    { skillsPath: './' },
  );
  assert.equal(m.name, 'unslop');
  assert.equal(m.version, '1.2.3');
  assert.equal(m.description, 'Removes AI slop. Second sentence.');
  assert.equal(m.skills, './');
  assert.equal(m.interface.displayName, 'Unslop');
  assert.equal(m.interface.shortDescription, 'Removes AI slop.');
  // Kimi has no longDescription field — must not be present.
  assert.equal(m.interface.longDescription, undefined);
});

test('buildKimiMarketplace emits schema version 2, bundle first, then one plugin per skill', () => {
  const mkt = buildKimiMarketplace(
    [{ name: 'alpha', description: 'A.' }, { name: 'beta', description: 'B.' }],
    '1.0.0',
  );
  assert.equal(mkt.version, '2');
  assert.equal(mkt.plugins.length, 3);

  const bundle = mkt.plugins[0];
  assert.equal(bundle.id, 'ake-skills');
  assert.equal(bundle.displayName, 'Ake Skills');
  assert.equal(bundle.source, './');

  const alpha = mkt.plugins[1];
  assert.equal(alpha.id, 'alpha');
  assert.equal(alpha.displayName, 'Alpha');
  assert.equal(alpha.source, './skills/alpha');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/generate-kimi-manifests.test.mjs`
Expected: FAIL — `Cannot find module './generate-kimi-manifests.mjs'`

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// Generates Kimi Code plugin manifests (kimi.plugin.json, one at repo root
// plus one per skill) and the repo-scoped marketplace catalog
// (marketplace.json) from skills/*/SKILL.md frontmatter. Schema grounded
// in MoonshotAI/kimi-code's own plugins.md docs. See
// docs/superpowers/specs/2026-08-20-codex-kimi-marketplace-design.md
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { loadSkills, readVersion, firstSentence, titleCase, writeJson, MARKETPLACE_NAME } from './lib/skills.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = { name: MARKETPLACE_NAME, description: 'All skills in this collection as one bundle' };

export function buildKimiPluginManifest(skill, version, { skillsPath }) {
  return {
    name: skill.name,
    version,
    description: skill.description,
    skills: skillsPath,
    interface: {
      displayName: titleCase(skill.name),
      shortDescription: firstSentence(skill.description),
    },
  };
}

export function buildKimiMarketplace(skills, version) {
  const bundle = { id: MARKETPLACE_NAME, displayName: titleCase(MARKETPLACE_NAME), source: './' };
  const perSkill = skills.map((s) => ({
    id: s.name,
    displayName: titleCase(s.name),
    source: `./skills/${s.name}`,
  }));
  return { version: '2', plugins: [bundle, ...perSkill] };
}

function main() {
  const skills = loadSkills(REPO_ROOT);
  const version = readVersion(REPO_ROOT);

  writeJson(
    join(REPO_ROOT, 'kimi.plugin.json'),
    buildKimiPluginManifest(BUNDLE, version, { skillsPath: './skills/' }),
  );
  for (const skill of skills) {
    writeJson(
      join(REPO_ROOT, 'skills', skill.name, 'kimi.plugin.json'),
      buildKimiPluginManifest(skill, version, { skillsPath: './' }),
    );
  }
  writeJson(join(REPO_ROOT, 'marketplace.json'), buildKimiMarketplace(skills, version));
  console.log(`generated kimi manifests (${skills.length} skills, version ${version})`);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/generate-kimi-manifests.test.mjs`
Expected: PASS, all tests green

- [ ] **Step 5: Run the generator and inspect output**

```bash
node scripts/generate-kimi-manifests.mjs
cat kimi.plugin.json
cat marketplace.json
cat skills/unslop/kimi.plugin.json
```
Expected: valid JSON matching the schemas above, one `kimi.plugin.json` per skill directory, root `marketplace.json` listing the bundle plus 4 skills

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-kimi-manifests.mjs scripts/generate-kimi-manifests.test.mjs \
  kimi.plugin.json marketplace.json skills/*/kimi.plugin.json
git commit -m "feat: add Kimi Code marketplace manifest generator

Generates kimi.plugin.json (repo root + one per skill) and root
marketplace.json (schema version 2) from skills/*/SKILL.md
frontmatter. Schema grounded in MoonshotAI/kimi-code's plugins.md."
```

---

### Task 4: Wire CI to run and drift-check the new generators

**Files:**
- Modify: `.github/workflows/validate.yml`

**Interfaces:**
- Consumes: `scripts/generate-codex-manifests.mjs`, `scripts/generate-kimi-manifests.mjs` (Tasks 2, 3), `scripts/generate-codex-manifests.test.mjs`, `scripts/generate-kimi-manifests.test.mjs`

- [ ] **Step 1: Update the workflow file**

Replace the full contents of `.github/workflows/validate.yml` with:

```yaml
name: validate
on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Run generator tests
        run: node --test scripts/*.test.mjs
      - name: Regenerate manifests
        run: |
          node scripts/generate-manifests.mjs
          node scripts/generate-codex-manifests.mjs
          node scripts/generate-kimi-manifests.mjs
      - name: Fail on manifest drift
        # staged diff also catches generated files that were deleted in the
        # commit and recreated untracked by the generator
        run: git add -A && git diff --cached --exit-code
```

- [ ] **Step 2: Verify the broadened test glob picks up all four test files locally**

Run: `node --test scripts/*.test.mjs`
Expected: PASS — test output shows tests from all 4 files (`generate-manifests.test.mjs`, `generate-codex-manifests.test.mjs`, `generate-kimi-manifests.test.mjs`, and any future one)

- [ ] **Step 3: Verify the full regenerate + drift check sequence is clean on a freshly generated tree**

```bash
node scripts/generate-manifests.mjs
node scripts/generate-codex-manifests.mjs
node scripts/generate-kimi-manifests.mjs
git add -A && git diff --cached --exit-code
```
Expected: exit code 0, no output (nothing staged as changed — everything from Tasks 1-3 was already committed with generator output included)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/validate.yml
git commit -m "ci: run and drift-check Codex/Kimi manifest generators

Broadens the test step to scripts/*.test.mjs and regenerates all
three agents' manifests before the existing drift gate, which already
covers any generated file via git add -A."
```

---

### Task 5: Update README.md and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: file layout and commands established in Tasks 1-4 (no new code interfaces)

- [ ] **Step 1: Add Codex CLI and Kimi Code sections to README's Installation, right after the existing Claude Code section**

Find this block in `README.md`:

```markdown
### Claude Code (native marketplace)

```
/plugin marketplace add alkimake/skills
/plugin install ake-skills@ake-skills        # everything
/plugin install release@ake-skills           # one skill
```

### Any agent (cross-agent installer)
```

Replace it with:

```markdown
### Claude Code (native marketplace)

```
/plugin marketplace add alkimake/skills
/plugin install ake-skills@ake-skills        # everything
/plugin install release@ake-skills           # one skill
```

### Codex CLI (native marketplace)

```
/plugin marketplace add alkimake/skills
/plugin install ake-skills@ake-skills        # everything
/plugin install release@ake-skills           # one skill
```

### Kimi Code (native marketplace)

```
/plugins marketplace https://raw.githubusercontent.com/alkimake/skills/main/marketplace.json
```

Then open `/plugins` → the Custom tab to install the whole `ake-skills` bundle or an individual skill.

> Codex and Kimi manifests are generated to match their published plugin/marketplace specs but haven't been install-tested against the real CLIs yet — open an issue if a command above doesn't behave as documented.

### Any agent (cross-agent installer)
```

- [ ] **Step 2: Update the "Adding a new skill" section to list all three generators**

Find this block in `README.md`:

```markdown
```bash
mkdir skills/my-skill
# write skills/my-skill/SKILL.md with name + description frontmatter
node scripts/generate-manifests.mjs
```

The generator validates frontmatter against the Agent Skills spec and regenerates `.claude-plugin/marketplace.json` plus the skill table above. CI fails if you forget to run it.
```

Replace it with:

```markdown
```bash
mkdir skills/my-skill
# write skills/my-skill/SKILL.md with name + description frontmatter
node scripts/generate-manifests.mjs
node scripts/generate-codex-manifests.mjs
node scripts/generate-kimi-manifests.mjs
```

Each generator validates frontmatter against the Agent Skills spec and regenerates that agent's manifest files (Claude's `.claude-plugin/marketplace.json` plus the skill table above; Codex's `.codex-plugin/plugin.json` files and `.agents/plugins/marketplace.json`; Kimi's `kimi.plugin.json` files and root `marketplace.json`). CI fails if you forget to run any of them.
```

- [ ] **Step 3: Update `CLAUDE.md`'s Structure block and workflow bullets**

Find this block in `CLAUDE.md`:

```markdown
## Structure

```
skills/
  <skill-name>/
    SKILL.md        # skill definition (frontmatter + instructions)
.claude-plugin/
  marketplace.json  # GENERATED — never edit by hand
scripts/
  generate-manifests.mjs        # regenerates marketplace.json + README table
  generate-manifests.test.mjs   # node:test suite for the generator
docs/
  superpowers/      # design specs and implementation plans
VERSION             # single version source, bumped by /release
```
```

Replace it with:

```markdown
## Structure

```
skills/
  <skill-name>/
    SKILL.md                    # skill definition (frontmatter + instructions)
    .codex-plugin/plugin.json   # GENERATED — Codex per-skill manifest
    kimi.plugin.json            # GENERATED — Kimi per-skill manifest
.claude-plugin/
  marketplace.json    # GENERATED — Claude marketplace catalog, never edit by hand
.agents/plugins/
  marketplace.json    # GENERATED — Codex marketplace catalog
.codex-plugin/
  plugin.json          # GENERATED — Codex bundle manifest
kimi.plugin.json        # GENERATED — Kimi bundle manifest
marketplace.json        # GENERATED — Kimi marketplace catalog
scripts/
  lib/skills.mjs                     # shared SKILL.md parsing/validation/version reading
  generate-manifests.mjs             # regenerates Claude marketplace.json + README table
  generate-manifests.test.mjs
  generate-codex-manifests.mjs       # regenerates Codex plugin.json + marketplace.json files
  generate-codex-manifests.test.mjs
  generate-kimi-manifests.mjs        # regenerates Kimi plugin.json + marketplace.json files
  generate-kimi-manifests.test.mjs
docs/
  superpowers/      # design specs and implementation plans
VERSION             # single version source, bumped by /release
```
```

Then find this bullet in `CLAUDE.md`:

```markdown
- After adding or editing a skill's frontmatter, run `node scripts/generate-manifests.mjs` — CI fails on manifest drift.
- `.claude-plugin/marketplace.json` and the README skill table are generated; edit `SKILL.md` frontmatter instead.
- When cutting a release here: bump `VERSION`, run the generator, and include `.claude-plugin/marketplace.json` + `README.md` in the release commit.
```

Replace it with:

```markdown
- After adding or editing a skill's frontmatter, run all three generators — `node scripts/generate-manifests.mjs`, `node scripts/generate-codex-manifests.mjs`, `node scripts/generate-kimi-manifests.mjs` — CI fails on manifest drift.
- `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.codex-plugin/`, `kimi.plugin.json`, every `skills/*/.codex-plugin/plugin.json` and `skills/*/kimi.plugin.json`, and the README skill table are all generated; edit `SKILL.md` frontmatter instead.
- When cutting a release here: bump `VERSION`, run all three generators, and include every generated manifest file + `README.md` in the release commit.
```

- [ ] **Step 4: Run all three generators once more so the version-stamped generated files match the committed VERSION**

```bash
node scripts/generate-manifests.mjs
node scripts/generate-codex-manifests.mjs
node scripts/generate-kimi-manifests.mjs
git status --short
```
Expected: only `README.md` and `CLAUDE.md` show as modified (from Steps 1-3) — no diff in any generated JSON file (they were already committed in Tasks 2/3 with matching content)

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document Codex/Kimi native marketplace install + generators

Adds install instructions for both new agents to README, and updates
CLAUDE.md's structure map and workflow bullets to cover the new
generated files and the three generator commands."
```

---

## Self-Review Notes

- **Spec coverage:** every section of the spec (schemas, generator architecture, CI wiring, docs) maps to a task above. The spec's "fidelity caveat" is carried into the README (Task 5, Step 1).
- **Type consistency:** `buildCodexPluginManifest`/`buildKimiPluginManifest` signatures `(skill, version, {skillsPath})` are used identically in their respective `main()` and tests. `loadSkills`/`readVersion`/`firstSentence`/`titleCase`/`writeJson`/`MARKETPLACE_NAME`/`OWNER` names match exactly between the lib (Task 1) and both consumers (Tasks 2, 3).
- **Placeholder scan:** no TBD/TODO; every step has runnable commands or complete code.
