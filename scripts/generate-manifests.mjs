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
