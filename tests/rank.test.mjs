import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMemorySignals, applyMmr, applySourceDiversity, rankResults } from '../dist/src/index.js';

function makeResult(id, score, { sourceId = `src-${id}`, sourceKind = 'text', metadata, text = `text of ${id}`, updatedAt } = {}) {
  return {
    chunk: {
      id,
      source: { sourceId, sourceKind, title: sourceId },
      text,
      metadata,
      updatedAt,
    },
    score,
    retrievalMode: 'manual',
  };
}

const NOW = '2026-08-01T00:00:00.000Z';

test('memory boost is multiplicative: RRF-scale documents keep their order against memories', () => {
  // Hybrid RRF scores are ~1/61. A max-importance memory must not leap past a
  // clearly better-scored document the way the old +0.35 additive boost did.
  const doc = makeResult('doc', 0.0328);
  const memory = makeResult('mem', 0.0323, {
    sourceId: 'mem-1',
    sourceKind: 'memory',
    metadata: { memoryId: 'mem-1', importance: 1, confidence: 1 },
    updatedAt: NOW,
  });
  const ranked = rankResults([doc, memory], { now: NOW });
  const memScore = ranked.find((r) => r.chunk.id === 'mem').score;
  const docScore = ranked.find((r) => r.chunk.id === 'doc').score;
  // Boost is bounded by 2x, not +0.35 flat.
  assert.ok(memScore <= 0.0323 * 2 + 1e-9, `memory score ${memScore} should stay in scale`);
  assert.ok(memScore / docScore < 2.1, 'memory must not dominate by an order of magnitude');
});

test('memory boost gates on metadata.memoryId, not sourceKind', () => {
  // memoryToChunk preserves caller-supplied source refs, so a memory chunk can
  // carry sourceKind 'card' — it must still receive the boost via memoryId.
  const withRef = makeResult('a', 1, {
    sourceKind: 'card',
    metadata: { memoryId: 'mem-a', importance: 1, confidence: 1 },
    updatedAt: NOW,
  });
  const plain = makeResult('b', 1, { sourceKind: 'memory' });
  const boosted = applyMemorySignals([withRef, plain], { now: NOW });
  const a = boosted.find((r) => r.chunk.id === 'a');
  const b = boosted.find((r) => r.chunk.id === 'b');
  assert.ok(a.score > 1, 'memoryId-carrying chunk is boosted');
  assert.equal(a.scoreBreakdown.preBoostScore, 1);
  assert.ok(a.scoreBreakdown.memoryBoostFactor > 1);
  assert.equal(a.scoreBreakdown.memoryAdjusted, a.score);
  assert.equal(b.score, 1, 'sourceKind alone does not trigger the boost');
  assert.equal(b.scoreBreakdown?.memoryBoostFactor, undefined);
});

test('memory boost is deterministic with a fixed now', () => {
  const memory = () => makeResult('m', 1, { metadata: { memoryId: 'm', importance: 0.5, confidence: 0.5 }, updatedAt: '2026-07-01T00:00:00.000Z' });
  const first = applyMemorySignals([memory()], { now: NOW });
  const second = applyMemorySignals([memory()], { now: NOW });
  assert.equal(first[0].score, second[0].score);
});

test('applySourceDiversity is input-order independent', () => {
  const build = () => [
    makeResult('a', 10, { sourceId: 'S1' }),
    makeResult('b', 9, { sourceId: 'S1' }),
    makeResult('c', 8, { sourceId: 'S2' }),
  ];
  const sorted = applySourceDiversity(build());
  const shuffledInput = [build()[1], build()[2], build()[0]];
  const shuffled = applySourceDiversity(shuffledInput);
  assert.deepEqual(
    shuffled.map((r) => [r.chunk.id, r.score]),
    sorted.map((r) => [r.chunk.id, r.score]),
  );
  // The best chunk per source always takes the zero-penalty slot.
  assert.equal(sorted.find((r) => r.chunk.id === 'a').score, 10);
});

test('applyMmr is deterministic and demotes near-duplicates', () => {
  const results = [
    makeResult('a', 10, { text: 'alpha beta gamma delta epsilon' }),
    makeResult('b', 9.5, { text: 'alpha beta gamma delta zeta' }), // near-duplicate of a
    makeResult('c', 6, { text: 'completely different topic entirely' }),
  ];
  const first = applyMmr(results, { lambda: 0.5 });
  const second = applyMmr(results, { lambda: 0.5 });
  assert.deepEqual(first.map((r) => r.chunk.id), second.map((r) => r.chunk.id));
  assert.equal(first[0].chunk.id, 'a', 'best result still first');
  assert.equal(first[1].chunk.id, 'c', 'diverse result promoted over the near-duplicate');
  assert.equal(first[2].chunk.id, 'b');
  for (const result of first) assert.equal(typeof result.scoreBreakdown.mmr, 'number');
});

test('applyMmr leaves scores untouched (budget math unaffected)', () => {
  const results = [
    makeResult('a', 3, { text: 'one two three' }),
    makeResult('b', 2, { text: 'four five six' }),
  ];
  const out = applyMmr(results);
  assert.deepEqual(out.map((r) => r.score).sort(), [2, 3]);
});

test('rankResults applies MMR only when requested', () => {
  const results = [
    makeResult('a', 10, { text: 'alpha beta gamma delta epsilon' }),
    makeResult('b', 9.5, { text: 'alpha beta gamma delta zeta' }),
    makeResult('c', 6, { text: 'completely different topic entirely' }),
  ];
  const plain = rankResults(results, { now: NOW });
  assert.deepEqual(plain.map((r) => r.chunk.id), ['a', 'b', 'c']);
  const mmr = rankResults(results, { now: NOW, mmr: { lambda: 0.5 } });
  assert.deepEqual(mmr.map((r) => r.chunk.id), ['a', 'c', 'b']);
});
