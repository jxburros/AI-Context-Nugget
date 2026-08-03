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

test('bitemporal: asOf selects records valid at the reference time', async () => {
  const engine = new ContextEngine();
  await engine.addMemory(makeMemoryRecord({
    id: 'mem-window',
    text: 'The user worked at Acme during 2025.',
    validFrom: '2025-01-01T00:00:00.000Z',
    validTo: '2026-01-01T00:00:00.000Z',
  }));
  const inside = await engine.retrieve({ query: 'Acme user worked', asOf: '2025-06-01T00:00:00.000Z', budget: { maxItems: 5 } });
  assert.ok(inside.items.some((item) => item.text.includes('Acme')), 'valid inside the window');
  const after = await engine.retrieve({ query: 'Acme user worked', asOf: '2026-06-01T00:00:00.000Z', budget: { maxItems: 5 } });
  assert.ok(!after.items.some((item) => item.text.includes('Acme')), 'not valid after validTo');
  const before = await engine.retrieve({ query: 'Acme user worked', asOf: '2024-06-01T00:00:00.000Z', budget: { maxItems: 5 } });
  assert.ok(!before.items.some((item) => item.text.includes('Acme')), 'not valid before validFrom');
});

test('bitemporal: asOf in the past resurrects a now-expired record', async () => {
  const engine = new ContextEngine();
  await engine.addMemory(makeMemoryRecord({
    id: 'mem-past',
    text: 'This expired fact was true in 2020.',
    expiresAt: '2021-01-01T00:00:00.000Z',
  }));
  const now = await engine.retrieve({ query: 'expired fact true', budget: { maxItems: 5 } });
  assert.equal(now.items.length, 0);
  const then = await engine.retrieve({ query: 'expired fact true', asOf: '2020-06-01T00:00:00.000Z', budget: { maxItems: 5 } });
  assert.ok(then.items.some((item) => item.text.includes('2020')));
});

test('proposed and disputed memories are excluded from retrieval but listable by status', async () => {
  const engine = new ContextEngine();
  const proposed = await engine.proposeMemory({ layer: 'user', scope: 'user:1', text: 'Proposed preference about density.' });
  assert.equal(proposed.status, 'proposed');
  await engine.addMemory(makeMemoryRecord({ id: 'mem-disputed', text: 'A disputed claim about density.', status: 'disputed' }));

  const packet = await engine.retrieve({ query: 'density', budget: { maxItems: 10 } });
  assert.equal(packet.items.length, 0, 'neither proposed nor disputed reaches retrieval');

  const inbox = await engine.store.listMemories({ query: '', memoryStatuses: ['proposed', 'disputed'] });
  assert.deepEqual(inbox.map((r) => r.status).sort(), ['disputed', 'proposed']);
});

test('propose -> approve makes a memory retrievable; dispute removes it again', async () => {
  const engine = new ContextEngine();
  const proposed = await engine.proposeMemory({ layer: 'user', scope: 'user:1', text: 'The user prefers keyboard shortcuts everywhere.' });

  assert.equal((await engine.retrieve({ query: 'keyboard shortcuts', budget: { maxItems: 5 } })).items.length, 0);

  const approved = await engine.approveMemory(proposed.id);
  assert.equal(approved.status, 'active');
  const afterApprove = await engine.retrieve({ query: 'keyboard shortcuts', budget: { maxItems: 5 } });
  assert.ok(afterApprove.items.some((item) => item.text.includes('keyboard')));

  const disputed = await engine.disputeMemory(proposed.id, 'user says otherwise');
  assert.equal(disputed.status, 'disputed');
  assert.equal(disputed.metadata.disputeReason, 'user says otherwise');
  assert.equal((await engine.retrieve({ query: 'keyboard shortcuts', budget: { maxItems: 5 } })).items.length, 0);
});

test('approveMemory and disputeMemory return undefined for unknown ids', async () => {
  const engine = new ContextEngine();
  assert.equal(await engine.approveMemory('nope'), undefined);
  assert.equal(await engine.disputeMemory('nope'), undefined);
});
