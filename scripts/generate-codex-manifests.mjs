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
