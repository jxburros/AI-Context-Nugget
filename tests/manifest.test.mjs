import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import {
  ContextEngine,
  buildManifest,
  canonicalJson,
  manifestHash,
  packContext,
  packetFromResults,
  verifyManifest,
} from '../dist/src/index.js';
import { markdownSource, plainTextSource } from './helpers.mjs';

async function buildPack() {
  const engine = new ContextEngine();
  await engine.addSource(markdownSource);
  await engine.addSource(plainTextSource);
  return engine.retrieveAndPack({ query: 'memory layers alpha', budget: { maxItems: 3 } });
}

test('packContext attaches a verifiable manifest by default', async () => {
  const pack = await buildPack();
  assert.ok(pack.manifest, 'manifest present');
  assert.equal(pack.manifest.manifestVersion, 1);
  assert.equal(pack.manifest.packetId, pack.packet.id);
  assert.equal(pack.manifest.items.length, pack.packet.items.length);
  assert.ok(verifyManifest(pack.manifest));
  for (const item of pack.manifest.items) {
    assert.equal(typeof item.contentHash, 'string');
    assert.ok(item.contentHash.length > 0);
    assert.ok(item.locator.sourceId);
    assert.equal(typeof item.tokensEstimated, 'number');
  }
});

test('packageHash is stable across runs at different times', async () => {
  const first = await buildPack();
  await delay(5);
  const second = await buildPack();
  assert.notEqual(first.packet.createdAt === second.packet.createdAt && first.packet.id === second.packet.id, true);
  assert.equal(first.manifest.packageHash, second.manifest.packageHash);
});

test('packageHash changes when selected content changes', async () => {
  const base = await buildPack();
  const engine = new ContextEngine();
  await engine.addSource({ ...markdownSource, content: markdownSource.content.replace('temporary', 'permanent') });
  await engine.addSource(plainTextSource);
  const changed = await engine.retrieveAndPack({ query: 'memory layers alpha', budget: { maxItems: 3 } });
  assert.notEqual(base.manifest.packageHash, changed.manifest.packageHash);
});

test('manifest records excluded candidates with machine-readable reasons', async () => {
  const engine = new ContextEngine({ chunkerOptions: { maxWords: 30, overlapWords: 0 } });
  await engine.addSource(plainTextSource);
  const pack = await engine.retrieveAndPack({ query: 'alpha beta gamma', budget: { maxItems: 1 } });
  assert.ok(pack.manifest.excluded.length > 0, 'excluded candidates recorded');
  for (const candidate of pack.manifest.excluded) {
    assert.ok(candidate.reasons.includes('max-items'));
    assert.ok(candidate.locator.sourceId);
  }
});

test('policy-filtered drops appear in packet exclusions and the manifest', async () => {
  const engine = new ContextEngine({
    memoryPolicy: { mode: 'manual', shouldRetrieve: () => false },
  });
  await engine.addMemory({
    id: 'mem-1',
    layer: 'user',
    scope: 'user:1',
    text: 'The user prefers terse answers about memory layers.',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
  });
  await engine.addSource(markdownSource);
  const packet = await engine.retrieve({ query: 'memory layers' });
  const policyExclusions = (packet.exclusions ?? []).filter((e) => e.reasons.includes('policy-filtered'));
  assert.equal(policyExclusions.length, 1);
  const manifest = buildManifest(packet);
  assert.ok(manifest.excluded.some((c) => c.reasons.includes('policy-filtered')));
});

test('manifest budget converges with the measured pack estimate', async () => {
  const pack = await buildPack();
  const { actualTokens, packTokensEstimated } = pack.manifest.budget;
  assert.equal(packTokensEstimated, pack.tokensEstimated);
  // Budgeted (content + overhead) should be within ~20% of the measured pack.
  const ratio = actualTokens / packTokensEstimated;
  assert.ok(ratio > 0.8 && ratio < 1.25, `budgeted ${actualTokens} vs measured ${packTokensEstimated}`);
});

test('includeManifest: false omits the manifest', async () => {
  const packet = packetFromResults([], { query: 'q' });
  const pack = packContext(packet, { includeManifest: false });
  assert.equal(pack.manifest, undefined);
});

test('manifestHash ignores time and scores but covers content and order', async () => {
  const pack = await buildPack();
  const manifest = pack.manifest;
  const timeShifted = { ...manifest, createdAt: '1999-01-01T00:00:00.000Z', packetId: 'packet_other' };
  assert.equal(manifestHash(timeShifted), manifest.packageHash);
  const items = manifest.items.map((item) => ({ ...item }));
  items[0] = { ...items[0], contentHash: 'tampered' };
  assert.notEqual(manifestHash({ ...manifest, items }), manifest.packageHash);
  const reordered = { ...manifest, items: [...manifest.items].reverse() };
  if (manifest.items.length > 1) {
    assert.notEqual(manifestHash(reordered), manifest.packageHash);
  }
});

test('canonicalJson sorts keys recursively and drops undefined', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: undefined, c: [1, undefined] } }), '{"a":{"c":[1,null]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});
