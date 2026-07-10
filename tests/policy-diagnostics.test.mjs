import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine, shouldStoreMemory, manualMemoryPolicy } from '../dist/src/index.js';
import { makeMemoryRecord } from './helpers.mjs';

test('shouldExpire policy excludes memory-backed chunks at retrieval time', async () => {
  const engine = new ContextEngine({
    memoryPolicy: { mode: 'auto', shouldExpire: (record) => record.id === 'mem-x' },
  });
  await engine.addMemory(makeMemoryRecord({ id: 'mem-x', text: 'excluded by policy expiry' }));
  await engine.addMemory(makeMemoryRecord({ id: 'mem-y', text: 'kept by policy' }));
  const packet = await engine.retrieve({ query: 'policy', layers: ['user'], budget: { maxItems: 10 } });
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0]?.text, 'kept by policy');
  assert.ok(packet.diagnostics?.reasons?.some((r) => r.includes('mem-x') && r.includes('shouldExpire')));
});

test('shouldRetrieve policy excludes memory-backed chunks per query', async () => {
  const engine = new ContextEngine({
    memoryPolicy: { mode: 'auto', shouldRetrieve: (record, query) => query.scope !== 'blocked' || record.scope !== 'blocked' },
  });
  await engine.addMemory(makeMemoryRecord({ id: 'mem-blocked', scope: 'blocked', text: 'blocked scope memory' }));
  const packet = await engine.retrieve({ query: 'memory', layers: ['user'], scope: 'blocked', budget: { maxItems: 10 } });
  assert.equal(packet.items.length, 0);
  assert.ok(packet.diagnostics?.reasons?.some((r) => r.includes('mem-blocked') && r.includes('shouldRetrieve')));
});

test('diagnostics report candidateChunks, retrievedResults, returnedItems, excludedItems distinctly', async () => {
  const engine = new ContextEngine();
  for (let i = 0; i < 40; i += 1) {
    await engine.addSource({ id: `s${i}`, kind: 'text', title: `S${i}`, content: `alpha beta gamma document number ${i}` });
  }
  const packet = await engine.retrieve({ query: 'alpha beta gamma', topK: 8, budget: { maxItems: 2 } });
  assert.equal(packet.diagnostics?.candidateChunks, 40);
  assert.equal(packet.diagnostics?.searchedChunks, 40);
  assert.equal(packet.diagnostics?.retrievedResults, 8);
  assert.equal(packet.diagnostics?.returnedItems, 2);
  assert.equal(packet.diagnostics?.excludedItems, 6);
});

test('empty/stopword-only query produces a well-formed empty packet with a diagnostics reason', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'some real content here' });
  const packet = await engine.retrieve({ query: 'the and of' });
  assert.equal(packet.items.length, 0);
  assert.ok(packet.diagnostics?.reasons?.includes('query produced no searchable terms'));
});

test('memory mode dispatch: manual never stores, shouldStore not consulted', async () => {
  const decision = await shouldStoreMemory(manualMemoryPolicy, { layer: 'user', scope: 'x', text: 'candidate' });
  assert.equal(decision.store, false);
});

test('memory mode dispatch: suggested with approving shouldStore yields suggested:true, not stored', async () => {
  const policy = { mode: 'suggested', shouldStore: () => ({ store: true, reason: 'looks good' }) };
  const decision = await shouldStoreMemory(policy, { layer: 'user', scope: 'x', text: 'candidate' });
  assert.equal(decision.store, false);
  assert.equal(decision.suggested, true);
});

test('memory mode dispatch: suggested with rejecting shouldStore stays rejected', async () => {
  const policy = { mode: 'suggested', shouldStore: () => ({ store: false, reason: 'nope' }) };
  const decision = await shouldStoreMemory(policy, { layer: 'user', scope: 'x', text: 'candidate' });
  assert.equal(decision.store, false);
  assert.equal(decision.reason, 'nope');
});

test('memory mode dispatch: suggested with no hook yields suggested:true', async () => {
  const policy = { mode: 'suggested' };
  const decision = await shouldStoreMemory(policy, { layer: 'user', scope: 'x', text: 'candidate' });
  assert.equal(decision.store, false);
  assert.equal(decision.suggested, true);
});

test('memory mode dispatch: auto with no hook stores by default', async () => {
  const policy = { mode: 'auto' };
  const decision = await shouldStoreMemory(policy, { layer: 'user', scope: 'x', text: 'candidate' });
  assert.equal(decision.store, true);
});

test('memory mode dispatch: auto with hook defers to hook', async () => {
  const policy = { mode: 'auto', shouldStore: () => ({ store: false, reason: 'app said no' }) };
  const decision = await shouldStoreMemory(policy, { layer: 'user', scope: 'x', text: 'candidate' });
  assert.equal(decision.store, false);
  assert.equal(decision.reason, 'app said no');
});
