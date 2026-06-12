# Skills Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `alkimake/skills` into a cross-agent skill marketplace: skills under `skills/`, a generated `.claude-plugin/marketplace.json` (per-skill plugins + all-skills bundle), a zero-dependency generator script, and a CI drift check.

**Architecture:** All skills move into a `skills/` directory (the canonical layout for `npx skills`, Claude Code plugins, and Gemini CLI). A single Node script (`scripts/generate-manifests.mjs`) parses each `SKILL.md` frontmatter, validates it against the Agent Skills spec, and emits `marketplace.json` plus a README skill table. CI re-runs the generator and fails on any diff. Versions come from a `VERSION` file at the repo root (bumped by the `/release` skill) — **not** from git tags as the spec originally said, because the tag is created *after* the release commit, which would make CI regenerate a different version than what was committed.

**Tech Stack:** Node ≥ 18 (ESM, `node:test`, zero npm dependencies), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-12-skills-marketplace-design.md`

---

### Task 1: Restructure the repo

Move the three skills into `skills/`, add `.gitignore` and `VERSION`, refresh local symlinks.

**Files:**
- Move: `release/` → `skills/release/`, `glab-workflow/` → `skills/glab-workflow/`, `subagent-driven-development/` → `skills/subagent-driven-development/`
- Create: `.gitignore`
- Create: `VERSION`

- [ ] **Step 1: Move skills with git mv**

```bash
cd /Users/ake/Projects/ai/skills
mkdir skills
git mv release glab-workflow subagent-driven-development skills/
```

- [ ] **Step 2: Verify nothing was lost**

Run: `find skills -mindepth 2 -maxdepth 2 | sort`
Expected output includes exactly:
```
skills/glab-workflow/SKILL.md
skills/glab-workflow/evals
skills/release/SKILL.md
skills/subagent-driven-development/SKILL.md
skills/subagent-driven-development/TEST.md
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore` with:
```
glab-workflow-workspace/
node_modules/
```

- [ ] **Step 4: Create VERSION**

Create `VERSION` with exactly:
```
0.1.0
```

- [ ] **Step 5: Refresh local symlinks** (user's machine uses symlinks from `~/.claude/skills/`; after the move they point at dead paths)

```bash
for name in release glab-workflow subagent-driven-development; do
  [ -L ~/.claude/skills/"$name" ] && ln -sfn /Users/ake/Projects/ai/skills/skills/"$name" ~/.claude/skills/"$name"
done
ls -l ~/.claude/skills/ | grep Projects/ai/skills || true
```
Expected: any symlinks that existed now point at `.../skills/skills/<name>`. (If none existed, the command prints nothing — that's fine.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move skills under skills/ for cross-agent installer layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Generator — frontmatter parser and validation (TDD)

The parser handles the simple YAML subset our skills use: `key: value` scalars and `key: >` folded blocks. Validation enforces the Agent Skills spec rules.

**Files:**
- Create: `scripts/generate-manifests.mjs`
- Test: `scripts/generate-manifests.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/generate-manifests.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  validateSkill,
} from './generate-manifests.mjs';

test('parseFrontmatter reads simple key: value pairs', () => {
  const fm = parseFrontmatter('---\nname: my-skill\ndescription: Does things.\n---\nbody', 'x/SKILL.md');
  assert.equal(fm.name, 'my-skill');
  assert.equal(fm.description, 'Does things.');
});

test('parseFrontmatter joins folded (>) blocks into one line', () => {
  const text = '---\nname: my-skill\ndescription: >\n  First line of text\n  second line here.\n---\n';
  const fm = parseFrontmatter(text, 'x/SKILL.md');
  assert.equal(fm.description, 'First line of text second line here.');
});

test('parseFrontmatter throws on missing frontmatter block', () => {
  assert.throws(() => parseFrontmatter('# no frontmatter', 'x/SKILL.md'), /x\/SKILL\.md.*frontmatter/);
});

test('parseFrontmatter throws on unterminated frontmatter', () => {
  assert.throws(() => parseFrontmatter('---\nname: a\n', 'x/SKILL.md'), /unterminated/);
});

test('validateSkill passes a valid skill', () => {
  assert.deepEqual(validateSkill('my-skill', { name: 'my-skill', description: 'Good.' }), []);
});

test('validateSkill rejects name/directory mismatch', () => {
  const errs = validateSkill('other-dir', { name: 'my-skill', description: 'Good.' });
  assert.ok(errs.some((e) => e.includes('does not match directory')));
});

test('validateSkill rejects invalid name characters', () => {
  const errs = validateSkill('My_Skill', { name: 'My_Skill', description: 'Good.' });
  assert.ok(errs.some((e) => e.includes('lowercase')));
});

test('validateSkill rejects missing description and >1024-char description', () => {
  assert.ok(validateSkill('a', { name: 'a' }).some((e) => e.includes('description')));
  const errs = validateSkill('a', { name: 'a', description: 'x'.repeat(1025) });
  assert.ok(errs.some((e) => e.includes('1024')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/`
Expected: FAIL — `Cannot find module ... generate-manifests.mjs`

- [ ] **Step 3: Implement parser and validation**

Create `scripts/generate-manifests.mjs`:

```js
#!/usr/bin/env node
// Generates .claude-plugin/marketplace.json and the README skill table
// from skills/*/SKILL.md frontmatter. Zero dependencies. See
// docs/superpowers/specs/2026-06-12-skills-marketplace-design.md
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE_NAME = 'ake-skills';
const OWNER = { name: 'Alkim Ake Gozen' };
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFrontmatter(text, filePath) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') {
    throw new Error(`${filePath}: file must start with a --- frontmatter block`);
  }
  const end = lines.indexOf('---', 1);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: add frontmatter parser and Agent Skills spec validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Generator — skill loading, version, manifest and README builders (TDD)

**Files:**
- Modify: `scripts/generate-manifests.mjs` (append functions)
- Test: `scripts/generate-manifests.test.mjs` (append tests)

- [ ] **Step 1: Append failing tests**

Append to `scripts/generate-manifests.test.mjs` (and extend the import list at the top to include the new names):

```js
import { mkdtempSync, mkdirSync as mkdirSyncT, writeFileSync as writeFileSyncT } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinT } from 'node:path';
import {
  loadSkills,
  readVersion,
  buildMarketplace,
  renderReadmeTable,
  updateReadme,
  firstSentence,
} from './generate-manifests.mjs';

function makeRepo(skills) {
  const root = mkdtempSync(joinT(tmpdir(), 'genman-'));
  for (const [name, frontmatter] of Object.entries(skills)) {
    mkdirSyncT(joinT(root, 'skills', name), { recursive: true });
    writeFileSyncT(joinT(root, 'skills', name, 'SKILL.md'), frontmatter);
  }
  return root;
}

test('loadSkills returns sorted skills from skills/', () => {
  const root = makeRepo({
    'b-skill': '---\nname: b-skill\ndescription: B.\n---\n',
    'a-skill': '---\nname: a-skill\ndescription: A.\n---\n',
  });
  const skills = loadSkills(root);
  assert.deepEqual(skills.map((s) => s.name), ['a-skill', 'b-skill']);
  assert.equal(skills[0].description, 'A.');
});

test('loadSkills aggregates errors across skills and throws', () => {
  const root = makeRepo({
    'good-skill': '---\nname: good-skill\ndescription: Fine.\n---\n',
    'bad-skill': '---\nname: wrong-name\ndescription: Bad.\n---\n',
  });
  mkdirSyncT(joinT(root, 'skills', 'empty-skill'));
  assert.throws(() => loadSkills(root), (err) => {
    assert.match(err.message, /bad-skill.*does not match directory/);
    assert.match(err.message, /empty-skill.*missing SKILL\.md/);
    return true;
  });
});

test('readVersion reads VERSION file and rejects non-semver', () => {
  const root = makeRepo({});
  writeFileSyncT(joinT(root, 'VERSION'), '1.2.3\n');
  assert.equal(readVersion(root), '1.2.3');
  writeFileSyncT(joinT(root, 'VERSION'), 'not-a-version\n');
  assert.throws(() => readVersion(root), /not valid semver/);
});

test('readVersion falls back to 0.0.0 when VERSION is missing', () => {
  const root = makeRepo({});
  assert.equal(readVersion(root), '0.0.0');
});

test('buildMarketplace emits bundle first, then one plugin per skill', () => {
  const m = buildMarketplace(
    [{ name: 'alpha', description: 'A.' }, { name: 'beta', description: 'B.' }],
    '1.0.0',
  );
  assert.equal(m.name, 'ake-skills');
  assert.equal(m.plugins.length, 3);
  assert.equal(m.plugins[0].name, 'ake-skills');
  assert.deepEqual(m.plugins[0].skills, ['./skills/alpha', './skills/beta']);
  assert.equal(m.plugins[1].name, 'alpha');
  assert.equal(m.plugins[1].source, './skills/alpha');
  assert.deepEqual(m.plugins[1].skills, ['./']);
  assert.equal(m.plugins[1].version, '1.0.0');
});

test('firstSentence stops at sentence end, not at dots inside words', () => {
  assert.equal(firstSentence('Uses CHANGELOG.md files. Second sentence.'), 'Uses CHANGELOG.md files.');
  assert.equal(firstSentence('No terminator here'), 'No terminator here');
});

test('renderReadmeTable renders one linked row per skill and escapes pipes', () => {
  const table = renderReadmeTable([{ name: 'alpha', description: 'Does a | b. More.' }]);
  assert.ok(table.includes('| [`alpha`](skills/alpha) | Does a \\| b. |'));
});

test('updateReadme replaces content between markers and throws if missing', () => {
  const readme = 'intro\n<!-- skills:start -->\nold\n<!-- skills:end -->\noutro';
  const out = updateReadme(readme, 'NEW TABLE');
  assert.ok(out.includes('<!-- skills:start -->\nNEW TABLE\n<!-- skills:end -->'));
  assert.ok(!out.includes('old'));
  assert.throws(() => updateReadme('no markers', 'x'), /markers/);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test scripts/`
Expected: FAIL — `loadSkills` etc. not exported

- [ ] **Step 3: Implement the builders**

Append to `scripts/generate-manifests.mjs`:

```js
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

export function buildMarketplace(skills, version) {
  const bundle = {
    name: MARKETPLACE_NAME,
    source: './',
    description: 'All skills in this collection as one bundle',
    version,
    author: OWNER,
    strict: false,
    skills: skills.map((s) => `./skills/${s.name}`),
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
  return { name: MARKETPLACE_NAME, owner: OWNER, plugins: [bundle, ...perSkill] };
}

export function firstSentence(description) {
  const m = description.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : description;
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
  return content.slice(0, si + start.length) + '\n' + table + '\n' + content.slice(ei);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/`
Expected: all 16 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: add manifest and README builders to generator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Rewrite README and CLAUDE.md for the marketplace layout

The README gets per-agent install instructions and the generator markers. This task writes static content only — the table between the markers is filled by the generator in Task 5.

**Files:**
- Modify: `README.md` (full rewrite)
- Modify: `CLAUDE.md` (structure section)

- [ ] **Step 1: Replace README.md with**

````markdown
# skills

Personal cross-agent skill collection — installable into Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI, Cursor, and any other agent supporting the [Agent Skills spec](https://agentskills.io/specification).

## Skills

<!-- skills:start -->
<!-- skills:end -->

## Installation

### Claude Code (native marketplace)

```
/plugin marketplace add alkimake/skills
/plugin install ake-skills@ake-skills        # everything
/plugin install release@ake-skills           # one skill
```

### Any agent (cross-agent installer)

```bash
npx skills add alkimake/skills                       # interactive picker
npx skills add alkimake/skills --skill release       # one skill
npx skills add alkimake/skills -a codex -a cursor    # target specific agents
```

### Gemini CLI

```bash
gemini skills install https://github.com/alkimake/skills
```

### Manual (any agent)

Copy a skill directory into your agent's skill path, e.g.:

```bash
cp -r skills/release ~/.agents/skills/        # cross-agent convention
cp -r skills/release ~/.claude/skills/        # Claude Code native
```

For local development of this repo, symlink instead of copying:

```bash
ln -s "$PWD"/skills/release ~/.claude/skills/release
```

## Adding a new skill

```bash
mkdir skills/my-skill
# write skills/my-skill/SKILL.md with name + description frontmatter
node scripts/generate-manifests.mjs
```

The generator validates frontmatter against the Agent Skills spec and regenerates `.claude-plugin/marketplace.json` plus the skill table above. CI fails if you forget to run it.

## Skill format

Each skill is a directory under `skills/` with a `SKILL.md`:

```markdown
---
name: my-skill            # must match the directory name
description: >
  Use when [specific triggering conditions].
  Triggers on: [phrases users might say].
---

# My Skill

Instructions the agent follows when this skill is invoked.
```

Rules enforced by the generator: `name` is lowercase alphanumeric with single hyphens (max 64 chars) and matches the directory; `description` is required (max 1024 chars).

## Versioning

`VERSION` at the repo root is the single version source, stamped into all marketplace plugin entries. Cut releases with the `/release` skill (bumps `VERSION`, regenerates manifests, commits, tags).

## Related

- [obra/superpowers](https://github.com/obra/superpowers) — upstream superpowers skills this collection extends
- [agentskills.io/specification](https://agentskills.io/specification) — skill format specification
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — the `npx skills` cross-agent installer
````

- [ ] **Step 2: Update CLAUDE.md**

Replace the `## Structure` section's code block with:

```
skills/
  <skill-name>/
    SKILL.md        # skill definition (frontmatter + instructions)
.claude-plugin/
  marketplace.json  # GENERATED — never edit by hand
scripts/
  generate-manifests.mjs   # regenerates marketplace.json + README table
VERSION             # single version source, bumped by /release
```

And append to the `## Working in this project` list:

```markdown
- After adding or editing a skill's frontmatter, run `node scripts/generate-manifests.mjs` — CI fails on manifest drift.
- `.claude-plugin/marketplace.json` and the README skill table are generated; edit `SKILL.md` frontmatter instead.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: rewrite README and CLAUDE.md for marketplace layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire up main() and generate the real manifests

**Files:**
- Modify: `scripts/generate-manifests.mjs` (append main)
- Create (generated): `.claude-plugin/marketplace.json`
- Modify (generated): `README.md` skill table

- [ ] **Step 1: Append main() to scripts/generate-manifests.mjs**

```js
function main() {
  const skills = loadSkills(REPO_ROOT);
  const version = readVersion(REPO_ROOT);
  const marketplace = buildMarketplace(skills, version);
  mkdirSync(join(REPO_ROOT, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(marketplace, null, 2) + '\n',
  );
  const readmePath = join(REPO_ROOT, 'README.md');
  writeFileSync(readmePath, updateReadme(readFileSync(readmePath, 'utf8'), renderReadmeTable(skills)));
  console.log(`generated marketplace.json (${skills.length} skills, version ${version})`);
}

// URL comparison (not path) so the guard works for relative invocations
// like `node scripts/generate-manifests.mjs`
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

- [ ] **Step 2: Run the full test suite**

Run: `node --test scripts/`
Expected: all 16 tests PASS (main() must not execute during test import)

- [ ] **Step 3: Run the generator on the real repo**

Run: `node scripts/generate-manifests.mjs`
Expected output: `generated marketplace.json (3 skills, version 0.1.0)`

- [ ] **Step 4: Inspect the output**

Run: `cat .claude-plugin/marketplace.json`
Expected: `name: "ake-skills"`, 4 plugins — `ake-skills` bundle (3 skill paths) + `glab-workflow`, `release`, `subagent-driven-development` (alphabetical), each version `0.1.0`.

Run: `grep -A6 'skills:start' README.md`
Expected: a 3-row table with links to `skills/<name>`.

- [ ] **Step 5: Verify regeneration is idempotent**

```bash
node scripts/generate-manifests.mjs && git status --porcelain
```
Expected: second run produces no *new* changes beyond the already-pending ones (run it twice; the diff must be stable).

- [ ] **Step 6: Commit**

```bash
git add scripts/ .claude-plugin/ README.md
git commit -m "feat: generate marketplace.json and README skill table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: CI drift check

**Files:**
- Create: `.github/workflows/validate.yml`

- [ ] **Step 1: Create .github/workflows/validate.yml**

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
        run: node --test scripts/
      - name: Regenerate manifests
        run: node scripts/generate-manifests.mjs
      - name: Fail on manifest drift
        run: git diff --exit-code
```

- [ ] **Step 2: Sanity-check the drift gate locally**

```bash
node --test scripts/ && node scripts/generate-manifests.mjs && git diff --exit-code
```
Expected: tests pass, generator runs, `git diff --exit-code` returns 0 (clean tree).

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: validate skills and fail on manifest drift

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification against real installers

**Files:** none created — verification only. **Known uncertainty:** there is no official published schema for `marketplace.json`; the per-skill plugin shape (`source: "./skills/<name>"` + `skills: ["./"]`) is the best-researched guess and this task confirms or fixes it.

- [ ] **Step 1: Cross-agent installer discovers all skills**

Run: `npx skills add ./ --list`
Expected: lists exactly `glab-workflow`, `release`, `subagent-driven-development`.

- [ ] **Step 2: Claude Code validates the marketplace manifest**

Run: `claude plugin validate .` (if this subcommand is unavailable in the installed version, skip to Step 3 — Step 3 covers the same ground interactively)
Expected: validation passes for the marketplace and all 4 plugin entries.

- [ ] **Step 3: Live Claude Code install check (interactive — ask the user to run this)**

In a Claude Code session:
```
/plugin marketplace add /Users/ake/Projects/ai/skills
/plugin install release@ake-skills
```
Expected: marketplace lists 4 plugins; installing `release` makes ONLY the `release` skill available (not all three).

- [ ] **Step 4: Fallback if per-skill plugins load zero or all skills**

If Step 2/3 shows per-skill plugins are broken, change the `perSkill` mapping in `buildMarketplace` to the alternate shape and re-verify from Step 2:

```js
const perSkill = skills.map((s) => ({
  name: s.name,
  source: './',
  description: s.description,
  version,
  author: OWNER,
  strict: false,
  skills: [`./skills/${s.name}`],
}));
```
Note: with this shape, verify installing one per-skill plugin does NOT also auto-load the other skills (plugin root is the repo, which contains `skills/`). If both shapes fail granular install, drop per-skill plugins to bundle-only, update `buildMarketplace` and its test, and report the limitation to the user.

- [ ] **Step 5: Update the spec's versioning note**

In `docs/superpowers/specs/2026-06-12-skills-marketplace-design.md`, replace the **Versioning** paragraph with:

```markdown
**Versioning:** plugin `version` fields are stamped from the `VERSION` file at the repo root (single version source — git tags lag the release commit, which would break the CI drift check). The existing `/release` skill is the version authority; its flow becomes bump VERSION → regenerate → commit → tag.
```

- [ ] **Step 6: Final commit and push**

```bash
git add -A
git commit -m "docs: record verified versioning approach in spec

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```
Expected: CI `validate` workflow runs on GitHub and passes.
