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
