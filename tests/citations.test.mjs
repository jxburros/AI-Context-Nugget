import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSourceLabel, createCitation, citationKey, attachCitations } from '../dist/src/index.js';

test('formatSourceLabel renders page 0 instead of dropping it', () => {
  const label = formatSourceLabel({ sourceId: 's', sourceKind: 'text', title: 'T', page: 0 });
  assert.equal(label, 'T p.0');
});

test('formatSourceLabel renders lineStart 0 instead of dropping it', () => {
  const label = formatSourceLabel({ sourceId: 's', sourceKind: 'text', title: 'T', lineStart: 0 });
  assert.equal(label, 'T L0');
});

test('formatSourceLabel handles lineEnd 0 alongside lineStart 0', () => {
  const label = formatSourceLabel({ sourceId: 's', sourceKind: 'text', title: 'T', lineStart: 0, lineEnd: 0 });
  assert.equal(label, 'T L0');
});

test('formatSourceLabel renders page and line range together, page first', () => {
  const label = formatSourceLabel({ sourceId: 's', sourceKind: 'text', title: 'T', section: 'S', page: 3, lineStart: 10, lineEnd: 20 });
  assert.equal(label, 'T > S p.3 L10-L20');
});

test('formatSourceLabel collapses a line range where lineEnd equals lineStart', () => {
  const label = formatSourceLabel({ sourceId: 's', sourceKind: 'text', title: 'T', page: 3, lineStart: 10, lineEnd: 10 });
  assert.equal(label, 'T p.3 L10');
});

test('formatSourceLabel with no locator fields falls back through title/path/url/sourceId', () => {
  assert.equal(formatSourceLabel({ sourceId: 'sid', sourceKind: 'text', title: 'T', path: 'p', url: 'u' }), 'T');
  assert.equal(formatSourceLabel({ sourceId: 'sid', sourceKind: 'text', path: 'p', url: 'u' }), 'p');
  assert.equal(formatSourceLabel({ sourceId: 'sid', sourceKind: 'text', url: 'u' }), 'u');
  assert.equal(formatSourceLabel({ sourceId: 'sid', sourceKind: 'text' }), 'sid');
});

test('citationKey distinguishes page 0 from an undefined page', () => {
  const withPageZero = citationKey({ sourceId: 's', sourceKind: 'text', page: 0 });
  const withoutPage = citationKey({ sourceId: 's', sourceKind: 'text' });
  assert.notEqual(withPageZero, withoutPage);
});

test('createCitation and attachCitations still work with a numeric-locator-free source', () => {
  const source = { sourceId: 's1', sourceKind: 'text', title: 'Doc' };
  const citation = createCitation(source, 1);
  assert.equal(citation.label, '[1] Doc');
  const items = attachCitations([{ id: 'i1', text: 'hello', source }]);
  assert.equal(items[0].citation.label, '[1] Doc');
});
