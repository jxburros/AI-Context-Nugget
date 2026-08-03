import test from 'node:test';
import assert from 'node:assert/strict';

import { applyContextBudget, estimateTokens } from '../dist/src/index.js';

function makeResult(id, text, { sourceId = 'src-1', tokensEstimated, score = 1 } = {}) {
  return {
    chunk: {
      id,
      source: { sourceId, sourceKind: 'text', title: sourceId },
      text,
      tokensEstimated,
    },
    score,
    retrievalMode: 'manual',
  };
}

test('maxTokens admits items until the token budget is exhausted', () => {
  const results = [
    makeResult('a', 'x'.repeat(40)), // 10 tokens
    makeResult('b', 'x'.repeat(40)), // 10 tokens
    makeResult('c', 'x'.repeat(40)), // 10 tokens
  ];
  const report = applyContextBudget(results, { maxTokens: 25 });
  assert.deepEqual(report.included.map((r) => r.chunk.id), ['a', 'b']);
  assert.equal(report.exclusions.length, 1);
  assert.deepEqual(report.exclusions[0].reasons, ['max-tokens']);
  assert.equal(report.tokensEstimated, 20);
});

test('mixed explicit and estimated token counts accumulate consistently', () => {
  const results = [
    makeResult('a', 'x'.repeat(40), { tokensEstimated: 7 }), // explicit 7
    makeResult('b', 'x'.repeat(40)), // estimated 10
  ];
  const report = applyContextBudget(results, { maxTokens: 100 });
  assert.equal(report.tokensEstimated, 7 + estimateTokens('x'.repeat(40)));
  assert.equal(report.contentTokensEstimated, report.tokensEstimated);
  assert.equal(report.overheadTokens, 0);
});

test('maxChars excludes with a machine-readable reason', () => {
  const report = applyContextBudget([makeResult('a', 'x'.repeat(100))], { maxChars: 50 });
  assert.equal(report.included.length, 0);
  assert.deepEqual(report.exclusions[0].reasons, ['max-chars']);
});

test('reserveTokens >= maxTokens yields no-token-budget with a report reason', () => {
  const report = applyContextBudget([makeResult('a', 'small text')], { maxTokens: 100, reserveTokens: 500 });
  assert.equal(report.included.length, 0);
  assert.deepEqual(report.exclusions[0].reasons, ['no-token-budget']);
  assert.equal(report.reasons.length, 1);
  assert.match(report.reasons[0], /reserveTokens \(500\) >= maxTokens \(100\)/);
});

test('reserveTokens is deducted from maxTokens before packing', () => {
  const results = [makeResult('a', 'x'.repeat(40)), makeResult('b', 'x'.repeat(40))];
  const report = applyContextBudget(results, { maxTokens: 15, reserveTokens: 4 });
  // 15 - 4 = 11 tokens available; each item is 10 tokens.
  assert.deepEqual(report.included.map((r) => r.chunk.id), ['a']);
  assert.equal(report.reasons.length, 0);
});

test('an item can fail multiple constraints and all are reported', () => {
  const results = [
    makeResult('a', 'x'.repeat(40)),
    makeResult('b', 'x'.repeat(400), { sourceId: 'src-1' }),
  ];
  const report = applyContextBudget(results, { maxItemsPerSource: 1, maxTokens: 50 });
  assert.deepEqual(report.included.map((r) => r.chunk.id), ['a']);
  assert.deepEqual(report.exclusions[0].reasons, ['per-source-cap', 'max-tokens']);
});

test('skip-and-continue: a smaller later item is admitted after a large one is excluded', () => {
  const results = [
    makeResult('big', 'x'.repeat(400), { score: 9 }), // 100 tokens
    makeResult('small', 'x'.repeat(20), { score: 1 }), // 5 tokens
  ];
  const report = applyContextBudget(results, { maxTokens: 10 });
  assert.deepEqual(report.included.map((r) => r.chunk.id), ['small']);
  assert.deepEqual(report.exclusions.map((e) => e.result.chunk.id), ['big']);
});

test('per-item overhead is charged against the token budget and reported', () => {
  const results = [makeResult('a', 'x'.repeat(40)), makeResult('b', 'x'.repeat(40))];
  const report = applyContextBudget(results, { maxTokens: 25 }, { overheadTokensPerItem: 8 });
  // Each item costs 10 content + 8 overhead = 18; only one fits in 25.
  assert.deepEqual(report.included.map((r) => r.chunk.id), ['a']);
  assert.equal(report.contentTokensEstimated, 10);
  assert.equal(report.overheadTokens, 8);
  assert.equal(report.tokensEstimated, 18);
});

test('overhead can be a per-result function and fixed overhead is charged up front', () => {
  const results = [makeResult('a', 'x'.repeat(40))];
  const report = applyContextBudget(results, { maxTokens: 100 }, {
    overheadTokensPerItem: (result) => result.chunk.id.length,
    overheadTokensFixed: 20,
  });
  assert.equal(report.overheadTokens, 20 + 1);
  assert.equal(report.tokensEstimated, 20 + 1 + 10);
});

test('fixed overhead alone can exhaust the budget', () => {
  const report = applyContextBudget([makeResult('a', 'x'.repeat(40))], { maxTokens: 15 }, { overheadTokensFixed: 12 });
  assert.equal(report.included.length, 0);
  assert.deepEqual(report.exclusions[0].reasons, ['max-tokens']);
  assert.equal(report.tokensEstimated, 12);
});

test('maxItems excludes with reason and excluded stays in ranked order', () => {
  const results = [makeResult('a', 'aa'), makeResult('b', 'bb'), makeResult('c', 'cc')];
  const report = applyContextBudget(results, { maxItems: 1 });
  assert.deepEqual(report.included.map((r) => r.chunk.id), ['a']);
  assert.deepEqual(report.excluded.map((r) => r.chunk.id), ['b', 'c']);
  for (const exclusion of report.exclusions) assert.deepEqual(exclusion.reasons, ['max-items']);
});
