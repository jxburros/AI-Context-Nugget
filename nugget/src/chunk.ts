import type { Chunker, ChunkerOptions, ContextChunk, ContextSource, ContextSourceRef } from './types.js';
import { estimateTokens, makeId } from './util.js';

export interface TextChunkerOptions extends ChunkerOptions {
  preserveParagraphs?: boolean;
}

function sourceRefFor(source: ContextSource, extra: Partial<ContextSourceRef> = {}): ContextSourceRef {
  return {
    sourceId: source.id,
    sourceKind: source.kind,
    title: source.title,
    path: typeof source.metadata?.path === 'string' ? source.metadata.path : undefined,
    url: typeof source.metadata?.url === 'string' ? source.metadata.url : undefined,
    ...extra,
  };
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

interface WordOffset {
  text: string;
  index: number;
}

function wordsWithOffsets(text: string): WordOffset[] {
  const out: WordOffset[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out.push({ text: match[0], index: match.index });
  }
  return out;
}

interface WordChunk {
  text: string;
  startWord: number;
  endWord: number;
  startOffset: number;
  endOffset: number;
}

function chunkWords(words: WordOffset[], maxWords: number, overlapWords: number): WordChunk[] {
  if (words.length === 0) return [];
  const safeMax = Math.max(1, maxWords);
  const safeOverlap = Math.max(0, Math.min(overlapWords, safeMax - 1));
  const out: WordChunk[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(words.length, start + safeMax);
    const slice = words.slice(start, end);
    const first = slice[0];
    const last = slice[slice.length - 1];
    out.push({
      text: slice.map((w) => w.text).join(' '),
      startWord: start,
      endWord: end,
      startOffset: first?.index ?? 0,
      endOffset: last ? last.index + last.text.length : 0,
    });
    if (end >= words.length) break;
    start = end - safeOverlap;
  }
  return out;
}

/** Maps character offsets within `content` to 1-based line numbers, via binary search over newline positions. */
function buildLineIndex(content: string): (offset: number) => number {
  const newlineOffsets: number[] = [];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') newlineOffsets.push(i);
  }
  return (offset: number): number => {
    let lo = 0;
    let hi = newlineOffsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((newlineOffsets[mid] ?? Number.POSITIVE_INFINITY) < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

export function textChunker(defaults: TextChunkerOptions = {}): Chunker {
  return {
    chunk(source: ContextSource, options: ChunkerOptions = {}): ContextChunk[] {
      const maxWords = options.maxWords ?? defaults.maxWords ?? 400;
      const overlapWords = options.overlapWords ?? defaults.overlapWords ?? 60;
      const layer = options.layer ?? defaults.layer ?? 'documents';
      const words = wordsWithOffsets(source.content);
      const chunks = chunkWords(words, maxWords, overlapWords);
      const lineOf = buildLineIndex(source.content);
      return chunks.map((chunk, index) => {
        const lineStart = lineOf(chunk.startOffset);
        const lineEnd = lineOf(Math.max(chunk.startOffset, chunk.endOffset - 1));
        return {
          id: makeId('chunk', `${source.id}:${index}:${chunk.text.length}:${chunk.text}`),
          source: sourceRefFor(source, { lineStart, lineEnd }),
          text: chunk.text,
          layer,
          trust: source.trust ?? 'untrusted',
          metadata: { ...source.metadata, chunkIndex: index, startWord: chunk.startWord, endWord: chunk.endWord },
          tokensEstimated: estimateTokens(chunk.text),
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        };
      });
    },
  };
}

interface MarkdownSection {
  headingPath: string[];
  startLine: number;
  lines: string[];
}

function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let headingStack: string[] = [];
  let current: MarkdownSection = { headingPath: [], startLine: 1, lines: [] };

  const pushCurrent = () => {
    if (current.lines.join('\n').trim()) sections.push(current);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      pushCurrent();
      const level = heading[1]?.length ?? 1;
      const title = heading[2]?.replace(/#+\s*$/, '').trim() ?? '';
      headingStack = headingStack.slice(0, level - 1);
      headingStack[level - 1] = title;
      current = { headingPath: headingStack.filter(Boolean), startLine: i + 1, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  pushCurrent();
  return sections;
}

interface SectionPiece {
  text: string;
  startOffset: number;
  endOffset: number;
}

/** Matches maximal runs of non-blank lines, i.e. paragraphs, tracking each match's offset in `text`. */
function paragraphsWithOffsets(text: string): WordOffset[] {
  const out: WordOffset[] = [];
  const re = /[^\n]+(?:\n[^\n]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out.push({ text: match[0], index: match.index });
  }
  return out;
}

/**
 * Splits section text into model-sized pieces, tracking each piece's character
 * offset within the untrimmed `sectionRawText` so line ranges stay exact even
 * when the section starts with blank lines.
 */
function splitSectionWithOffsets(sectionRawText: string, maxWords: number, overlapWords: number): SectionPiece[] {
  if (!sectionRawText.trim()) return [];
  if (wordsOf(sectionRawText).length <= maxWords) {
    const trimmed = sectionRawText.trim();
    const startOffset = sectionRawText.length - sectionRawText.trimStart().length;
    return [{ text: trimmed, startOffset, endOffset: startOffset + trimmed.length }];
  }

  const paragraphs = paragraphsWithOffsets(sectionRawText);
  const out: SectionPiece[] = [];
  let buffer: WordOffset[] = [];
  let bufferWords = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.map((p) => p.text).join('\n\n');
    const first = buffer[0];
    const last = buffer[buffer.length - 1];
    if (first && last) out.push({ text, startOffset: first.index, endOffset: last.index + last.text.length });
    buffer = [];
    bufferWords = 0;
  };

  for (const paragraph of paragraphs) {
    const count = wordsOf(paragraph.text).length;
    if (count > maxWords) {
      flush();
      for (const piece of chunkWords(wordsWithOffsets(paragraph.text), maxWords, overlapWords)) {
        out.push({
          text: piece.text,
          startOffset: paragraph.index + piece.startOffset,
          endOffset: paragraph.index + piece.endOffset,
        });
      }
      continue;
    }
    if (bufferWords + count > maxWords && bufferWords > 0) flush();
    buffer.push(paragraph);
    bufferWords += count;
  }
  flush();
  return out;
}

export function markdownChunker(defaults: TextChunkerOptions = {}): Chunker {
  return {
    chunk(source: ContextSource, options: ChunkerOptions = {}): ContextChunk[] {
      const maxWords = options.maxWords ?? defaults.maxWords ?? 360;
      const overlapWords = options.overlapWords ?? defaults.overlapWords ?? 40;
      const layer = options.layer ?? defaults.layer ?? 'documents';
      const sections = parseMarkdownSections(source.content);
      const chunks: ContextChunk[] = [];
      for (const section of sections) {
        const sectionRawText = section.lines.join('\n');
        const sectionLineOf = buildLineIndex(sectionRawText);
        const pieces = splitSectionWithOffsets(sectionRawText, maxWords, overlapWords);
        for (const piece of pieces) {
          const localLineStart = sectionLineOf(piece.startOffset);
          const localLineEnd = sectionLineOf(Math.max(piece.startOffset, piece.endOffset - 1));
          const lineStart = section.startLine + localLineStart - 1;
          const lineEnd = section.startLine + localLineEnd - 1;
          const sectionLabel = section.headingPath.join(' > ') || undefined;
          chunks.push({
            id: makeId('chunk', `${source.id}:${section.startLine}:${chunks.length}:${piece.text.length}:${piece.text}`),
            source: sourceRefFor(source, { section: sectionLabel, lineStart, lineEnd }),
            text: piece.text,
            layer,
            trust: source.trust ?? 'untrusted',
            metadata: { ...source.metadata, chunkIndex: chunks.length, headingPath: section.headingPath },
            tokensEstimated: estimateTokens(piece.text),
            createdAt: source.createdAt,
            updatedAt: source.updatedAt,
          });
        }
      }
      if (chunks.length === 0 && source.content.trim()) {
        return textChunker(defaults).chunk(source, options);
      }
      return chunks;
    },
  };
}
