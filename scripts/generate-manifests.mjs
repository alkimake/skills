#!/usr/bin/env node
// Generates .claude-plugin/marketplace.json and the README skill table
// from skills/*/SKILL.md frontmatter. Zero dependencies. See
// docs/superpowers/specs/2026-06-12-skills-marketplace-design.md
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE_NAME = 'ake-skills';
const OWNER = { name: 'Alkim Ake Gozen' };
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
  if (ei < si) {
    throw new Error('README.md: <!-- skills:end --> appears before <!-- skills:start -->');
  }
  return content.slice(0, si + start.length) + '\n' + table + '\n' + content.slice(ei);
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
