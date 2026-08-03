import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine } from '../dist/src/index.js';
import { asAiNuggetContextMessages, asAiNuggetMetadata, hasAiNuggetContext } from '../dist/src/ai-nugget.js';

async function packFor(query) {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', content: 'The bridge turns a context packet into AI Nugget-compatible messages.' });
  return engine.retrieveAndPack({ query, strategy: 'bm25' }, { includeCitations: true });
}

test('asAiNuggetContextMessages returns a single system message with the packed text', async () => {
  const pack = await packFor('bridge messages');
  const messages = asAiNuggetContextMessages(pack);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[0].content, pack.text);
});

test('asAiNuggetContextMessages returns no messages for an empty pack', () => {
  const emptyPack = { text: '   ', packet: { id: 'p', retrievalMode: 'bm25' }, sources: [], citations: [], tokensEstimated: 0 };
  assert.deepEqual(asAiNuggetContextMessages(emptyPack), []);
});

test('asAiNuggetMetadata carries a stable contextPacketId', async () => {
  const pack = await packFor('bridge messages');
  const metadata = asAiNuggetMetadata(pack);
  assert.equal(metadata.contextPacketId, pack.packet.id);
  assert.equal(metadata.contextRetrievalMode, 'bm25');
});

test('hasAiNuggetContext is true only when metadata carries a contextPacketId', async () => {
  const pack = await packFor('bridge messages');
  assert.equal(hasAiNuggetContext(asAiNuggetMetadata(pack)), true);
  assert.equal(hasAiNuggetContext({}), false);
  assert.equal(hasAiNuggetContext(undefined), false);
  assert.equal(hasAiNuggetContext({ contextPacketId: 42 }), false);
});

test('asAiNuggetMetadata carries contextManifestHash matching pack.manifest.packageHash by default', async () => {
  const pack = await packFor('bridge messages');
  assert.ok(pack.manifest, 'packContext should attach a manifest by default');
  const metadata = asAiNuggetMetadata(pack);
  assert.equal(metadata.contextManifestHash, pack.manifest.packageHash);
  assert.equal(typeof metadata.contextManifestHash, 'string');
});

test('asAiNuggetMetadata has no contextManifestHash when the pack opts out of the manifest', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', content: 'The bridge turns a context packet into AI Nugget-compatible messages.' });
  const pack = await engine.retrieveAndPack({ query: 'bridge messages', strategy: 'bm25' }, { includeManifest: false });
  assert.equal(pack.manifest, undefined);
  const metadata = asAiNuggetMetadata(pack);
  assert.equal(metadata.contextManifestHash, undefined);
});

test('hasAiNuggetContext acts as a boolean-returning guard over asAiNuggetMetadata output', async () => {
  const pack = await packFor('bridge messages');
  const metadata = asAiNuggetMetadata(pack);
  const result = hasAiNuggetContext(metadata);
  assert.equal(typeof result, 'boolean');
  assert.equal(result, true);
});

test('a packet with no items packs to empty text, so the bridge emits no messages', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', content: 'alpha beta gamma' });
  const pack = await engine.retrieveAndPack(
    { query: 'nothingherematchesthisquery' },
    { trustBoundary: 'untrusted-source-data', includeCitations: true },
  );
  assert.equal(pack.packet.items.length, 0);
  assert.equal(pack.text, '');
  assert.equal(pack.tokensEstimated, 0);
  assert.deepEqual(pack.citations, []);
  assert.deepEqual(asAiNuggetContextMessages(pack), []);
});
