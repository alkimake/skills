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
