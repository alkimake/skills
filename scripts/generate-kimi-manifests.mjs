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
