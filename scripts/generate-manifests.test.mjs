import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync as mkdirSyncT, writeFileSync as writeFileSyncT } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinT } from 'node:path';
import {
  parseFrontmatter,
  validateSkill,
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
  assert.throws(() => parseFrontmatter('---\nname: a\n', 'x/SKILL.md'), /x\/SKILL\.md.*unterminated/);
});

test('parseFrontmatter handles CRLF line endings and trailing fence whitespace', () => {
  const fm = parseFrontmatter('---\r\nname: my-skill\r\ndescription: Does things.\r\n---\r\nbody', 'x/SKILL.md');
  assert.equal(fm.name, 'my-skill');
  assert.equal(fm.description, 'Does things.');
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
  assert.equal(m.description, 'Personal cross-agent skill collection');
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

test('updateReadme throws when markers are reversed', () => {
  assert.throws(
    () => updateReadme('a\n<!-- skills:end -->\nb\n<!-- skills:start -->\nc', 'x'),
    /skills:end.*before.*skills:start/,
  );
});

test('parseFrontmatter treats indented --- inside folded blocks as content', () => {
  const text = '---\nname: my-skill\ndescription: >\n  before the rule\n  ---\n  after the rule\n---\n';
  const fm = parseFrontmatter(text, 'x/SKILL.md');
  assert.equal(fm.description, 'before the rule --- after the rule');
});
