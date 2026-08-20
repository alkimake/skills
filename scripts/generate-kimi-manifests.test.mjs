import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKimiPluginManifest, buildKimiMarketplace } from './generate-kimi-manifests.mjs';

test('buildKimiPluginManifest fills fields from skill + version', () => {
  const m = buildKimiPluginManifest(
    { name: 'unslop', description: 'Removes AI slop. Second sentence.' },
    '1.2.3',
    { skillsPath: './' },
  );
  assert.equal(m.name, 'unslop');
  assert.equal(m.version, '1.2.3');
  assert.equal(m.description, 'Removes AI slop. Second sentence.');
  assert.equal(m.skills, './');
  assert.equal(m.interface.displayName, 'Unslop');
  assert.equal(m.interface.shortDescription, 'Removes AI slop.');
  // Kimi has no longDescription field — must not be present.
  assert.equal(m.interface.longDescription, undefined);
});

test('buildKimiMarketplace emits schema version 2, bundle first, then one plugin per skill', () => {
  const mkt = buildKimiMarketplace(
    [{ name: 'alpha', description: 'A.' }, { name: 'beta', description: 'B.' }],
    '1.0.0',
  );
  assert.equal(mkt.version, '2');
  assert.equal(mkt.plugins.length, 3);

  const bundle = mkt.plugins[0];
  assert.equal(bundle.id, 'ake-skills');
  assert.equal(bundle.displayName, 'Ake Skills');
  assert.equal(bundle.source, './');

  const alpha = mkt.plugins[1];
  assert.equal(alpha.id, 'alpha');
  assert.equal(alpha.displayName, 'Alpha');
  assert.equal(alpha.source, './skills/alpha');
});
