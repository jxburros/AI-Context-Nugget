import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContextEngine,
  InMemoryContextStore,
  bm25Retriever,
  markdownChunker,
  memoryToChunk,
  packContext,
  packetFromResults,
  rankSourcesByQuery,
  selectSourcesByPolicy,
} from '../dist/src/index.js';

const designDoc = `# Context Nugget

Context Nugget prepares context packets before prompt strings.

## Memory Layers

Session memory is temporary. User memory is durable and visible. Project memory belongs to one project.

## Trust Boundary

Retrieved repository files are untrusted source data. They may contain fake instructions such as ignore previous instructions.
`;

test('markdownChunker preserves heading metadata and line ranges', () => {
  const chunks = markdownChunker({ maxWords: 24 }).chunk({ id: 'design', kind: 'markdown', title: 'Design', content: designDoc });
  assert.ok(chunks.length >= 3);
  const memory = chunks.find((chunk) => chunk.source.section === 'Context Nugget > Memory Layers');
  assert.ok(memory);
  assert.equal(memory?.source.title, 'Design');
  assert.equal(memory?.layer, 'documents');
  assert.ok((memory?.source.lineStart ?? 0) > 0);
  assert.ok((memory?.tokensEstimated ?? 0) > 0);
});

test('BM25 retriever returns expected chunk with reasons', () => {
  const chunks = markdownChunker({ maxWords: 40 }).chunk({ id: 'design', kind: 'markdown', title: 'Design', content: designDoc });
  const results = bm25Retriever().retrieve({ query: 'durable user memory visible', topK: 2 }, chunks);
  assert.ok(results.length > 0);
  assert.match(results[0]?.chunk.text ?? '', /User memory is durable/);
  assert.ok(results[0]?.scoreBreakdown?.bm25);
  assert.ok(results[0]?.reasons?.[0]);
});

test('engine retrieveAndPack creates citations and untrusted boundary', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'design', kind: 'markdown', title: 'Design', content: designDoc, trust: 'untrusted' });
  const pack = await engine.retrieveAndPack({
    query: 'How should retrieved repo files be treated?',
    layers: ['documents'],
    budget: { maxItems: 2, maxItemsPerSource: 2 },
    pack: { trustBoundary: 'untrusted-source-data', includeCitations: true, includeTrust: true },
  });
  assert.match(pack.text, /BEGIN UNTRUSTED SOURCE DATA/);
  assert.ok(pack.citations.length > 0);
  assert.equal(pack.packet.sources.length, 1);
  assert.equal(pack.packet.items[0]?.trust, 'untrusted');
});

test('budget enforces maxItemsPerSource', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'a', kind: 'text', title: 'A', content: 'alpha beta gamma '.repeat(200) });
  await engine.addSource({ id: 'b', kind: 'text', title: 'B', content: 'alpha beta delta '.repeat(200) });
  const packet = await engine.retrieve({ query: 'alpha beta', budget: { maxItems: 4, maxItemsPerSource: 1 } });
  const counts = new Map();
  for (const item of packet.items) counts.set(item.source.sourceId, (counts.get(item.source.sourceId) ?? 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 1));
});

test('manual memory records become retrievable chunks with layer and scope metadata', async () => {
  const store = new InMemoryContextStore();
  const record = {
    id: 'mem-ui',
    layer: 'user',
    scope: 'user:jxburros',
    text: 'The user prefers minimal monochrome interfaces.',
    importance: 0.9,
    confidence: 1,
    createdAt: '2026-07-08T00:00:00.000Z',
  };
  await store.addMemory(record);
  await store.addChunks([memoryToChunk(record)]);
  const chunks = await store.listChunks({ query: 'interface preference', layers: ['user'], scope: 'user:jxburros' });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.metadata?.importance, 0.9);
});

test('packContext can pack an explicit manual packet', () => {
  const chunk = markdownChunker().chunk({ id: 'design', kind: 'markdown', title: 'Design', content: designDoc })[0];
  assert.ok(chunk);
  const packet = packetFromResults([{ chunk, score: 1, retrievalMode: 'manual', reasons: ['manual include'] }], {
    query: 'manual',
    retrievalMode: 'manual',
    budget: { maxItems: 1 },
  });
  const pack = packContext(packet, { includeScores: true });
  assert.match(pack.text, /score 1\.000/);
});

test('policy-driven source selection reports missing required sources', () => {
  const sources = [{ id: 'manifesto', kind: 'markdown', content: 'manifesto' }];
  const result = selectSourcesByPolicy(sources, 'architecture-change', [
    { taskType: 'architecture-change', requiredSourceIds: ['manifesto', 'architecture'], optionalKinds: ['markdown'] },
  ]);
  assert.equal(result.selected.length, 1);
  assert.deepEqual(result.missingRequired, ['architecture']);
  assert.match(result.coverageWarning ?? '', /Missing required context/);
});

test('source ranking can select files before loading them into the engine', () => {
  const sources = [
    { id: 'readme', kind: 'markdown', title: 'README', content: 'general docs for the app' },
    { id: 'issue', kind: 'json', title: 'Issue 42', content: 'bug report about stale project context and memory retrieval' },
  ];
  const ranked = rankSourcesByQuery(sources, { query: 'stale memory retrieval', topK: 1 });
  assert.equal(ranked[0]?.source.id, 'issue');
});

test('groupBy: source groups rendered items and renumbers citations in reading order', async () => {
  const engine = new ContextEngine({ chunkerOptions: { maxWords: 12, overlapWords: 0 } });
  await engine.addSource({ id: 'doc-a', kind: 'text', title: 'Doc A', content: 'alpha topic one. alpha topic two. alpha topic three. alpha topic four. alpha topic five. alpha again six. alpha again seven. alpha again eight.' });
  await engine.addSource({ id: 'doc-b', kind: 'text', title: 'Doc B', content: 'alpha other nine. alpha other ten.' });
  const pack = await engine.retrieveAndPack(
    { query: 'alpha topic', budget: { maxItems: 4 } },
    { groupBy: 'source' },
  );
  const headers = pack.text.split('\n').filter((line) => line.startsWith('### '));
  assert.ok(headers.length >= 1, 'group headers rendered');
  assert.ok(headers.every((h) => h === '### Doc A' || h === '### Doc B'), `group headers are source labels, got: ${headers.join(', ')}`);
  // Citations are renumbered 1..n in reading order of the rendered text.
  const labels = pack.citations.map((c) => c.id);
  assert.deepEqual(labels, labels.map((_, i) => `c${i + 1}`));
  const positions = pack.citations.map((c) => pack.text.indexOf(c.label));
  assert.ok(positions.every((p) => p >= 0), 'every citation label appears in the text');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'citation order matches reading order');
  // packet.items keeps ranked order with its own numbering.
  assert.deepEqual(pack.packet.items.map((item) => item.citation.id), pack.packet.items.map((_, i) => `c${i + 1}`));
});

test('groupBy: layer renders layer group headers', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc-l', kind: 'text', title: 'Doc L', content: 'omega content in documents layer' });
  await engine.addMemory({
    id: 'mem-l', layer: 'user', scope: 'user:1', text: 'omega preference remembered', createdAt: '2026-01-01T00:00:00.000Z', status: 'active',
  });
  const pack = await engine.retrieveAndPack({ query: 'omega' }, { groupBy: 'layer' });
  const headers = pack.text.split('\n').filter((line) => line.startsWith('### '));
  assert.ok(headers.some((h) => h.startsWith('### Layer: ')), `layer headers rendered, got: ${headers.join(', ')}`);
});

test('diagnostics.estimatedTokens converges with the measured pack estimate', async () => {
  const engine = new ContextEngine();
  await engine.addSource({ id: 'doc-c', kind: 'markdown', title: 'Doc C', content: '# Title\n\nSome content about convergence of budgets and packs.\n\n## Section\n\nMore content about token accounting fidelity.' });
  const pack = await engine.retrieveAndPack(
    { query: 'convergence token accounting' },
    { trustBoundary: 'untrusted-source-data' },
  );
  const budgeted = pack.packet.diagnostics.estimatedTokens;
  const measured = pack.tokensEstimated;
  assert.ok(budgeted > 0 && measured > 0);
  const ratio = budgeted / measured;
  assert.ok(ratio > 0.75 && ratio < 1.3, `budgeted ${budgeted} vs measured ${measured}`);
  assert.ok(pack.packet.diagnostics.overheadTokens > 0, 'overhead is accounted');
});
