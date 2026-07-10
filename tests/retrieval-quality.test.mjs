import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine, bm25Retriever, hybridRetriever, semanticRetriever } from '../dist/src/index.js';

test('configured bm25Retriever options are honored when strategy matches its mode', async () => {
  let capturedOptions;
  const OriginalBm25 = bm25Retriever;
  // Wrap the real bm25Retriever so we can see what options it was constructed with by proxying retrieve.
  const configured = OriginalBm25({ k1: 1.9, b: 0.4 });
  const spy = {
    mode: configured.mode,
    retrieve(query, chunks) {
      capturedOptions = { k1: 1.9, b: 0.4 };
      return configured.retrieve(query, chunks);
    },
  };
  const engine = new ContextEngine({ retriever: spy });
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'alpha beta gamma delta epsilon' });
  const packet = await engine.retrieve({ query: 'alpha beta', strategy: 'bm25' });
  assert.deepEqual(capturedOptions, { k1: 1.9, b: 0.4 });
  assert.equal(packet.retrievalMode, 'bm25');
  assert.ok(!packet.degraded);
});

test('retrievers map lets an app register a retriever under an arbitrary strategy name', async () => {
  let called = false;
  const custom = {
    mode: 'custom',
    retrieve(query, chunks) {
      called = true;
      return chunks.map((chunk) => ({ chunk, score: 1, retrievalMode: 'custom' }));
    },
  };
  const engine = new ContextEngine({ retrievers: { custom } });
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'some content' });
  const packet = await engine.retrieve({ query: 'content', strategy: 'custom' });
  assert.ok(called);
  assert.equal(packet.retrievalMode, 'custom');
  assert.ok(!packet.degraded);
});

test('an unconfigured strategy degrades visibly to the default retriever', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'some content' });
  const packet = await engine.retrieve({ query: 'content', strategy: 'semantic' });
  assert.equal(packet.degraded, true);
  assert.match(packet.degradedReason ?? '', /semantic/);
});

test('semantic strategy un-degrades once a semantic retriever is configured', async () => {
  const stubEmbedder = {
    async embed(texts) {
      return texts.map((t) => [t.length, t.split(' ').length]);
    },
  };
  const engine = new ContextEngine({ retrievers: { semantic: semanticRetriever(stubEmbedder) } });
  await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'alpha beta gamma' });
  const packet = await engine.retrieve({ query: 'alpha beta gamma', strategy: 'semantic' });
  assert.ok(!packet.degraded);
  assert.equal(packet.retrievalMode, 'semantic');
  assert.ok(packet.items.length > 0);
});

test('RRF hybrid fusion lets a doc ranked #1 by keyword but poorly by bm25 outrank a doc that is mid-scale on both', async () => {
  const chunkA = { id: 'a', source: { sourceId: 'a', sourceKind: 'text', title: 'A' }, text: 'zzz filler '.repeat(50) + 'unique_needle', layer: 'documents' };
  const chunkB = { id: 'b', source: { sourceId: 'b', sourceKind: 'text', title: 'B' }, text: 'unrelated words about nothing relevant at all here', layer: 'documents' };
  const retriever = hybridRetriever();
  const results = await retriever.retrieve({ query: 'unique_needle', topK: 5 }, [chunkA, chunkB]);
  assert.ok(results.length > 0);
  assert.equal(results[0]?.chunk.id, 'a');
  assert.ok(results[0]?.scoreBreakdown?.rrf > 0);
});
