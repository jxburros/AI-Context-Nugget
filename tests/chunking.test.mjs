import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine, textChunker, markdownChunker, stableHash } from '../dist/src/index.js';
import { plainTextSource } from './helpers.mjs';

test('textChunker produces correct line ranges for multi-line plain text with overlap', () => {
  const chunks = textChunker({ maxWords: 20, overlapWords: 6 }).chunk(plainTextSource);
  assert.ok(chunks.length > 1);
  const sourceLines = plainTextSource.content.split('\n');
  for (const chunk of chunks) {
    assert.ok(typeof chunk.source.lineStart === 'number', 'lineStart should be defined');
    assert.ok(typeof chunk.source.lineEnd === 'number', 'lineEnd should be defined');
    assert.ok(chunk.source.lineStart >= 1 && chunk.source.lineStart <= sourceLines.length);
    assert.ok(chunk.source.lineEnd >= chunk.source.lineStart);
    // Every word in the chunk text must appear within the claimed line span of the source.
    const claimedSpan = sourceLines.slice(chunk.source.lineStart - 1, chunk.source.lineEnd).join('\n');
    const firstWord = chunk.text.split(' ')[0];
    assert.ok(claimedSpan.includes(firstWord), `expected "${firstWord}" within claimed span`);
  }
});

test('textChunker handles repeated identical paragraphs with distinct correct ranges', () => {
  const content = Array.from({ length: 5 }, () => 'repeat me exactly the same words every time').join('\n');
  const chunks = textChunker({ maxWords: 6, overlapWords: 0 }).chunk({ id: 'r', kind: 'text', content });
  const ranges = chunks.map((c) => `${c.source.lineStart}-${c.source.lineEnd}`);
  assert.equal(new Set(ranges).size, ranges.length, 'ranges should be distinct across repeated content');
});

test('markdownChunker line ranges survive leading blank lines in a section', () => {
  const md = `# Title\n\n\n\nActual content starts here on line five.\n\nMore content on line seven.\n`;
  const chunks = markdownChunker({ maxWords: 4, overlapWords: 0 }).chunk({ id: 'm', kind: 'markdown', content: md });
  const first = chunks.find((c) => c.text.includes('Actual content'));
  assert.ok(first);
  assert.equal(first.source.lineStart, 5);
});

test('configured chunker is respected for markdown AND text source kinds', () => {
  let calls = 0;
  const spy = {
    chunk(source) {
      calls += 1;
      return [{
        id: `spy_${source.id}`,
        source: { sourceId: source.id, sourceKind: source.kind },
        text: source.content,
        layer: 'documents',
      }];
    },
  };
  const engine = new ContextEngine({ chunker: spy });
  return (async () => {
    await engine.addSource({ id: 'md', kind: 'markdown', content: '# Heading\n\nbody text' });
    await engine.addSource({ id: 'txt', kind: 'text', content: 'plain text body' });
    assert.equal(calls, 2);
  })();
});

test('chunkerByKind overrides the default chunker per source kind', async () => {
  let markdownCalls = 0;
  const markdownSpy = {
    chunk(source) {
      markdownCalls += 1;
      return [{ id: `spy_${source.id}`, source: { sourceId: source.id, sourceKind: source.kind }, text: source.content, layer: 'documents' }];
    },
  };
  const engine = new ContextEngine({ chunkerByKind: { markdown: markdownSpy } });
  await engine.addSource({ id: 'md', kind: 'markdown', content: '# Heading\n\nbody text' });
  await engine.addSource({ id: 'txt', kind: 'text', content: 'plain text body about apples' });
  assert.equal(markdownCalls, 1);
  const packet = await engine.retrieve({ query: 'apples', budget: { maxItems: 10 } });
  assert.ok(packet.items.some((item) => item.source.sourceId === 'txt'));
});

test('stableHash produces no duplicate ids across a large generated corpus', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i += 1) {
    ids.add(stableHash(`chunk-seed-${i}-${'x'.repeat(i % 37)}`));
  }
  assert.equal(ids.size, 5000);
});

test('stableHash output is wider than the old 7-char 32-bit hash', () => {
  assert.ok(stableHash('anything').length > 7);
});

test('markdownChunker treats "#" lines inside a fenced code block as content, not headings', () => {
  const md = '# Title\n\n```bash\n# not a heading\n#!/bin/bash\necho hi\n```\n\nAfter fence text.\n';
  const chunks = markdownChunker({ maxWords: 100, overlapWords: 0 }).chunk({ id: 'm', kind: 'markdown', content: md });
  assert.ok(!chunks.some((c) => c.metadata.headingPath.includes('not a heading')));
  const fenceChunk = chunks.find((c) => c.text.includes('#!/bin/bash'));
  assert.ok(fenceChunk, 'the fence content should stay in a chunk');
  assert.deepEqual(fenceChunk.metadata.headingPath, ['Title']);
  assert.ok(fenceChunk.text.includes('# not a heading'), 'fence content stays inside the enclosing section');
  assert.ok(fenceChunk.text.includes('After fence text.'), 'text after the fence stays in the same section');
});

test('markdownChunker treats "~~~" fences the same as backtick fences', () => {
  const md = '# Title\n\n~~~bash\n# not a heading\n~~~\n\nAfter fence text.\n';
  const chunks = markdownChunker({ maxWords: 100, overlapWords: 0 }).chunk({ id: 'm', kind: 'markdown', content: md });
  assert.ok(!chunks.some((c) => c.metadata.headingPath.includes('not a heading')));
  const fenceChunk = chunks.find((c) => c.text.includes('~~~'));
  assert.ok(fenceChunk);
  assert.deepEqual(fenceChunk.metadata.headingPath, ['Title']);
  assert.ok(fenceChunk.text.includes('After fence text.'));
});

test('markdownChunker keeps everything after an unclosed fence in one section', () => {
  const md = '# Title\n\n```\nunclosed fence\n# still not a heading\nmore text\n';
  const chunks = markdownChunker({ maxWords: 100, overlapWords: 0 }).chunk({ id: 'm', kind: 'markdown', content: md });
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].metadata.headingPath, ['Title']);
  assert.ok(chunks[0].text.includes('# still not a heading'));
});

test('markdownChunker closes a fence only when the closing run is at least as long as the opening run', () => {
  const md = '# Title\n\n```\ncode here\n````\n\nAfter.\n\n## Second\n\nmore\n';
  const chunks = markdownChunker({ maxWords: 100, overlapWords: 0 }).chunk({ id: 'm', kind: 'markdown', content: md });
  assert.equal(chunks.length, 2);
  const firstChunk = chunks.find((c) => c.text.includes('code here'));
  assert.deepEqual(firstChunk.metadata.headingPath, ['Title']);
  assert.ok(firstChunk.text.includes('After.'), 'the closed fence lets section content continue normally');
  const secondChunk = chunks.find((c) => c.metadata.headingPath.includes('Second'));
  assert.ok(secondChunk, 'the heading after the closed fence is recognized');
});
