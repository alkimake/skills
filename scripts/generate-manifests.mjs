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
