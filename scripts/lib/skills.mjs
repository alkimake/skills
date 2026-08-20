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
