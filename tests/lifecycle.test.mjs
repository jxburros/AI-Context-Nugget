import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine, InMemoryContextStore } from '../dist/src/index.js';
import { activeMemoryRecord, archivedMemoryRecord, expiredMemoryRecord, makeMemoryRecord } from './helpers.mjs';

test('updating a source replaces its chunks; old content is not retrievable', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'the original content about apples' });
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'the updated content about oranges' });
  const packet = await engine.retrieve({ query: 'apples oranges', budget: { maxItems: 10 } });
  const texts = packet.items.map((item) => item.text);
  assert.ok(texts.some((t) => t.includes('oranges')));
  assert.ok(!texts.some((t) => t.includes('apples')));
});

test('updating a memory replaces its chunk; only latest text is retrievable', async () => {
  const engine = new ContextEngine();
  await engine.addMemory(makeMemoryRecord({ id: 'mem-1', text: 'the user likes coffee', updatedAt: '2026-01-01T00:00:00.000Z' }));
  await engine.addMemory(makeMemoryRecord({ id: 'mem-1', text: 'the user likes tea', updatedAt: '2026-01-02T00:00:00.000Z' }));
  const packet = await engine.retrieve({ query: 'coffee tea', layers: ['user'], budget: { maxItems: 10 } });
  const texts = packet.items.map((item) => item.text);
  assert.ok(texts.some((t) => t.includes('tea')));
  assert.ok(!texts.some((t) => t.includes('coffee')));
});

test('expired, archived, and active memories are filtered correctly at retrieval time', async () => {
  const store = new InMemoryContextStore();
  const engine = new ContextEngine({ store });
  await engine.addMemory(expiredMemoryRecord);
  await engine.addMemory(archivedMemoryRecord);
  await engine.addMemory(activeMemoryRecord);

  const chunks = await store.listChunks();
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.metadata?.memoryId, 'mem-active');

  const packet = await engine.retrieve({ query: 'memory', layers: ['user'], budget: { maxItems: 10 } });
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0]?.text, activeMemoryRecord.text);
});

test('supersedes chain: adding B superseding A removes A chunks and flips A status', async () => {
  const store = new InMemoryContextStore();
  const engine = new ContextEngine({ store });
  await engine.addMemory(makeMemoryRecord({ id: 'mem-a', text: 'old fact' }));
  await engine.addMemory(makeMemoryRecord({ id: 'mem-b', text: 'new corrected fact', supersedes: ['mem-a'] }));

  const a = await store.getMemory('mem-a');
  assert.equal(a?.status, 'superseded');

  const chunks = await store.listChunks();
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.metadata?.memoryId, 'mem-b');
});

test('removeSource removes chunks and drops the source from export', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'some content here' });
  await engine.removeSource('doc');
  const snapshot = await engine.store.export();
  assert.equal(snapshot.sources.length, 0);
  assert.equal(snapshot.chunks.length, 0);
});

test('removeMemory removes chunks and drops the memory from export', async () => {
  const engine = new ContextEngine();
  await engine.addMemory(makeMemoryRecord({ id: 'mem-remove' }));
  await engine.removeMemory('mem-remove');
  const snapshot = await engine.store.export();
  assert.equal(snapshot.memories.length, 0);
  assert.equal(snapshot.chunks.length, 0);
});

test('snapshot round-trip is identity-stable for sources and memories', async () => {
  const store = new InMemoryContextStore();
  await store.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'content', updatedAt: '2026-01-01T00:00:00.000Z' });
  await store.addMemory(makeMemoryRecord({ id: 'mem-1', status: 'active' }));
  const snapshot1 = await store.export();

  const store2 = new InMemoryContextStore();
  await store2.import(snapshot1);
  const snapshot2 = await store2.export();

  assert.deepEqual(snapshot1, snapshot2);
});
