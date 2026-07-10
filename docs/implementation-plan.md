# Context Nugget — Implementation Plan

Derived from `docs/audit-2026-07-10.md` (finding IDs `P*` from the prior review, `N*` from the 2026-07-10 audit). Phases are ordered so that each ships independently, tests land with the code they verify, and the docs-truth pass happens *after* behavior stabilizes.

Versioning stance: the package is unpublished at `0.1.0`, so breaking changes to `ContextStore` and diagnostics are acceptable now and cheap; land them before anything ships to npm. Target: phases 0–4 ⇒ `v0.2.0` (first publishable), phases 5–6 ⇒ `v0.3.0`.

---

## Phase 0 — CI and test harness (enabler; fixes P6 part 1)

**Goal:** every later phase lands with a red→green test under CI.

1. **Add `.github/workflows/ci.yml`**
   - Trigger: `push`, `pull_request`.
   - Matrix: Node `20.x`, `22.x` on `ubuntu-latest`.
   - Steps: `npm ci` (add `package-lock.json` to the repo — it is currently untracked), `npm run typecheck`, `npm run build`, `npm test`, `npm pack --dry-run`.
2. **Split test scripts** in `package.json`:
   - `"pretest": "npm run build"` and `"test": "node --test tests/*.test.mjs"` (replaces the compound `test` script; behavior identical, but lets CI cache the build step).
3. **Add a test helper** `tests/helpers.mjs` with a tiny fixture corpus (3 sources: markdown, plain text with newlines, memory records with expiry/status variants) reused across new tests.

**Acceptance:** CI green on the default branch; a deliberately broken commit fails CI.
**Effort:** ~half a day. **Depends on:** nothing.

---

## Phase 1 — Data lifecycle: replace, remove, and stop serving dead data (fixes P1, P7, N1, part of N12)

**Goal:** updating or retiring a source/memory makes its old chunks unreachable, always.

### 1.1 Extend `ContextStore` (`src/types.ts`)

```ts
export interface ChunkFilter {
  sourceId?: string;   // matches chunk.source.sourceId
  memoryId?: string;   // matches chunk.metadata.memoryId
}

export interface ContextStore {
  // ...existing members...
  removeSource(sourceId: string): Promise<void> | void;        // also removes its chunks
  removeChunks(filter: ChunkFilter): Promise<number> | number; // returns removed count
  removeMemory(memoryId: string): Promise<void> | void;        // also removes its chunks
  getMemory(memoryId: string): Promise<MemoryRecord | undefined> | MemoryRecord | undefined;
}
```

Breaking for third-party store implementers — acceptable pre-publish; note it in the changelog.

### 1.2 Implement in `InMemoryContextStore` (`src/stores/memoryStore.ts`)

- `removeChunks`: iterate `this.chunks`, delete matches on `source.sourceId` / `metadata.memoryId`.
- `removeSource(id)`: delete from `sources` + `removeChunks({ sourceId: id })`.
- `removeMemory(id)`: delete from `memories` + `removeChunks({ memoryId: id })`.
- **Fix N1 here:** in `listChunks`, when a chunk has `metadata.memoryId`, look up the record and drop the chunk unless `recordIsActive(record)` (status `active`, not past `expiresAt`). Missing record ⇒ drop (orphan chunk).
- **N12 round-trip:** make `import()` apply the same normalization as the add-paths (or make `addSource` stop defaulting `updatedAt`); add a snapshot round-trip identity test and pick whichever direction keeps it green.

### 1.3 Replace semantics in `ContextEngine` (`src/engine.ts`)

- `addSource`: call `store.removeChunks({ sourceId: source.id })` before `addChunks` (store upsert already replaces the source record). Re-adding a source now *replaces* its chunks — document this in the method JSDoc and README.
- `addMemory`: call `store.removeChunks({ memoryId: record.id })` before adding the new chunk.
- Add `engine.removeSource(id)` and `engine.removeMemory(id)` pass-throughs.
- Honor `MemoryRecord.supersedes`: in `addMemory`, for each superseded ID, mark that record `status: 'superseded'` (via store) and remove its chunks.

### 1.4 Tests (extend `tests/`)

- Update a source ⇒ only new content retrievable (repro from audit becomes the regression test).
- Update a memory ⇒ only latest text retrievable.
- Expired / `archived` / `superseded` memory ⇒ zero chunks from `listChunks` and zero packet items.
- `supersedes` chain: adding B superseding A removes A's chunks and flips A's status.
- `removeSource` / `removeMemory` ⇒ subsequent retrieval and `export()` show no trace.

**Acceptance:** all audit repros for P1/N1 pass as tests; existing 8 tests still green.
**Effort:** ~1 day. **Depends on:** Phase 0.

---

## Phase 2 — Policy enforcement and honest diagnostics (fixes P2, P4, N10, empty-query note from N12)

**Goal:** the hooks the types promise actually run, and packets report true counts.

### 2.1 Enforce memory policy in `engine.retrieve` (`src/engine.ts`)

After `store.listChunks(query)` and before retrieval:

```ts
const candidates = [];
for (const chunk of chunks) {
  const memoryId = chunk.metadata?.memoryId;
  if (typeof memoryId !== 'string') { candidates.push(chunk); continue; }
  const record = await this.store.getMemory(memoryId);
  if (!record) continue;                                            // orphan
  if (await this.memoryPolicy.shouldExpire?.(record)) continue;     // policy expiry
  if (this.memoryPolicy.shouldRetrieve
      && !(await this.memoryPolicy.shouldRetrieve(record, query))) continue;
  candidates.push(chunk);
}
```

Record drops as diagnostics reasons (e.g. `"memory mem_x excluded by shouldRetrieve"`), capped like existing reasons.

### 2.2 Clarify policy dispatch (`src/memory.ts`, fixes N10)

Documented contract, implemented in `shouldStoreMemory`:
- `manual` ⇒ never store (hook not consulted); delete the dead `manualMemoryPolicy.shouldStore`.
- `suggested` ⇒ hook may *approve into a suggestion* but result is `{ store: false, suggested: true }`-shaped: extend `MemoryDecision` with `suggested?: boolean` so apps can route to an approval UI; only `auto` mode stores without app action.
- `auto` ⇒ hook decides; default allow when absent.
Unit-test all six mode×hook combinations.

### 2.3 Honest diagnostics (fixes P4)

- `ContextDiagnostics` (`src/types.ts`): add `candidateChunks: number` and `retrievedResults: number`; keep `searchedChunks` as a deprecated alias equal to `candidateChunks` (JSDoc `@deprecated`, remove in 0.4).
- `engine.retrieve` passes `candidateChunks: candidates.length` into `packetFromResults`'s options; `pack.ts` sets `retrievedResults: results.length` where it currently mislabels `searchedChunks`.
- Empty/stopword-only query: add diagnostics reason `"query produced no searchable terms"` and a test asserting an empty—but well-formed—packet.

**Acceptance:** a query against a store with 40 chunks, topK 8, budget maxItems 2 reports `candidateChunks: 40, retrievedResults: 8, returnedItems: 2, excludedItems: 6`.
**Effort:** ~1 day. **Depends on:** Phase 1 (needs `getMemory`).

---

## Phase 3 — Chunking correctness: injection and citations (fixes P3, N3, N7, markdown note from N12)

**Goal:** the configured chunker always wins, and every chunk's line range is present and true.

### 3.1 Respect configured chunkers (`src/engine.ts`)

```ts
export interface ContextEngineOptions {
  // ...
  chunker?: Chunker;                            // default for all kinds
  chunkerByKind?: Record<string, Chunker>;      // per-kind override
}
```

Resolution order in `addSource`: `chunkerByKind[source.kind]` → `options.chunker` → built-in default for the kind (`markdown` ⇒ `markdownChunker(defaultChunkerOptions)`, else `textChunker(defaultChunkerOptions)`). Key change: an explicitly provided `chunker` is used for *every* kind, restoring the constructor contract; kind-smart defaults only apply when the app injected nothing.

### 3.2 Offset-based line ranges (rewrite in `src/chunk.ts`)

Delete `lineRangeForText`. Track offsets forward instead of re-searching:

- Precompute newline offsets once per source: `const nl = [...content.matchAll(/\n/g)].map(m => m.index)`; `lineOf(offset)` = binary search ⇒ O(log n).
- `textChunker`: tokenize words via `matchAll(/\S+/g)` keeping each word's `index`. A chunk covering words `i..j` spans chars `word[i].index … word[j].index + word[j].length`; `lineStart/lineEnd` from `lineOf()` of those bounds. Overlap, repeated text, and whitespace normalization all become irrelevant — offsets are exact.
- `markdownChunker`: sections already carry `startLine`; give `splitSection` the same treatment by tracking each paragraph's char offset within the (untrimmed) section text, fixing the trim-offset drift noted in N12. When a long paragraph falls through to word-chunking, reuse the word-offset machinery with the paragraph's base offset.
- `lineEnd` now derives from source offsets, fixing the "single-line range for a 15-line chunk" defect.

### 3.3 Stronger chunk IDs (fixes N7)

- Extend `stableHash` to 64 bits (two-lane FNV-1a or cyrb-style mixing — still dependency-free, still deterministic) and include text length + full text in the seed (hash cost is linear anyway).
- Keep the `chunk_`/`mem_`/`packet_` prefixes; IDs remain deterministic for identical input. Note in changelog: chunk IDs change across this version.

### 3.4 Tests

- Spy-chunker test: custom chunker invoked for markdown AND text kinds (audit repro for P3).
- `chunkerByKind` beats `chunker` beats default.
- Line ranges: multi-line plain text with `overlapWords > 0` ⇒ every chunk has correct, verifiable `lineStart/lineEnd` (assert by slicing the source by lines and checking containment). Repeated identical paragraphs ⇒ distinct correct ranges. Markdown section with leading blank lines ⇒ no off-by-one.
- Hash: sanity collision test over a generated 100k-chunk corpus (no duplicate IDs).

**Acceptance:** audit repro N3 (all-`undefined` line ranges) passes; citation labels show `L<start>-L<end>` for text chunks.
**Effort:** ~1.5 days. **Depends on:** Phase 0 only (parallelizable with 1–2).

---

## Phase 4 — Safety hardening (fixes N2, P5, N9, N11)

**Goal:** the trust boundary resists forgery; redaction is real, opt-in, and honestly documented.

### 4.1 Sentinel hardening (`src/safety.ts`)

- `wrapUntrustedSourceData(text, options?: { nonce?: string })`:
  - Neutralize any line in `text` matching `/^\s*==\s*(BEGIN|END)\s+UNTRUSTED SOURCE DATA\b.*==\s*$/i` by prefixing it (e.g. `[neutralized] `).
  - Support fences `== BEGIN UNTRUSTED SOURCE DATA <nonce> ==` when a nonce is supplied; `packContext` gains `PackOptions.trustBoundaryNonce?: string` (app-supplied — the library stays deterministic and dependency-free; document that apps *should* pass a per-call random nonce).
- Test: the audit's forged-sentinel repro must yield output whose *only* fence pair is the outer one.

### 4.2 Redaction: patterns + wiring (`src/safety.ts`, `src/pack.ts`)

- Extend `SECRET_PATTERNS`: AWS access keys (`\bAKIA[0-9A-Z]{16}\b`), Slack (`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`), PEM blocks (`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`), GitLab (`\bglpat-[A-Za-z0-9_\-]{20,}\b`), npm (`\bnpm_[A-Za-z0-9]{36}\b`), JWT-shaped (`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b`). Table-driven tests with true/false-positive cases per pattern.
- `PackOptions.redact?: boolean | ((text: string) => string)` — applied per item in `packContext` before assembly (`true` ⇒ built-in `redactText`). Off by default; README states plainly: *untrusted wrapping is structural; redaction is best-effort and opt-in.*

### 4.3 Metadata hygiene (fixes N11)

- `packetFromResults`: replace wholesale metadata spread with an allowlist (`chunkIndex`, `headingPath`, `memoryId`, `scope`, `tags`, `importance`, `confidence`, `status`) plus `PacketOptions.metadataPolicy?: 'all' | 'minimal' | (meta) => meta` (default `'minimal'`). Changelog: packet consumers relying on arbitrary source metadata must opt into `'all'`.

### 4.4 `docs/security-model.md`

Guarantees (fenced untrusted packing with neutralized sentinels; deterministic output), non-guarantees (prompt-injection immunity, secret/PII discovery completeness, access control), app responsibilities (consent, deletion, transport, prompt policy). Link from README.

**Acceptance:** forged-sentinel and redaction-gap repros from the audit pass as tests; security-model doc merged.
**Effort:** ~1 day. **Depends on:** Phase 0 (parallelizable with 1–3).

---

## Phase 5 — Retrieval quality (fixes N4, N5, N6, P9 seams)

**Goal:** injected retrievers are honored, hybrid fusion is principled, and the semantic seam is real.

### 5.1 Strategy resolves to configured retrievers (fixes N4)

```ts
export interface ContextEngineOptions {
  // ...
  retriever?: Retriever;                          // default
  retrievers?: Record<string, Retriever>;         // strategy name -> retriever
}
```

`engine.retrieve` resolution: `retrievers[query.strategy]` → (strategy absent) `this.retriever` → built-in default for well-known strategy names. Degraded-mode check generalizes: if `query.strategy` names a mode no configured/built-in retriever provides, degrade visibly to the default (current semantic behavior becomes one case of the general rule).

### 5.2 Rank-based hybrid fusion (fixes N5)

Rewrite `HybridRetriever` to RRF: `score(d) = Σ 1/(60 + rank_r(d))` over the sub-retrievers; keep raw sub-scores in `scoreBreakdown` (`{ bm25Rank, keywordRank, bm25: raw, keyword: raw, rrf: fused }`). Constructor accepts sub-retrievers + `k` so apps can fuse a future semantic retriever the same way. Test: a doc ranked #1 by keyword but #15 by BM25 must outrank a doc ranked #8 by both mid-scale — impossible under today's raw addition.

### 5.3 Rank options honesty (fixes N6)

Implement `maxItemsPerSource` in `applySourceDiversity` (hard-cap after penalty sort) *or* remove it from `RankOptions` and stop passing it from the engine. Recommendation: remove — the budget stage already owns per-source caps, and one owner is clearer. Changelog note either way.

### 5.4 Semantic adapter contract (fixes P9 seam)

Types only, in `src/retrieval/semantic.ts`:

```ts
export interface Embedder { embed(texts: string[]): Promise<number[][]>; dimensions?: number; }
export function semanticRetriever(embedder: Embedder, opts?): Retriever  // mode: 'semantic'
```

Ship the cosine-similarity retriever over an injected `Embedder` (pure TS, no deps); embeddings providers stay in future adapter packages per `design.md`. With 5.1, configuring it under `retrievers: { semantic }` makes `strategy: 'semantic'` work end-to-end and un-degrades.

### 5.5 Index reuse (fixes P9 perf, optional within phase)

- Store revision counter: `InMemoryContextStore` increments `revision` on every mutation; expose `revision(): number` (optional method on `ContextStore`).
- `BM25Retriever` caches its last `(revisionKey, index)` pair when the store exposes revisions and the engine passes a revision hint; otherwise current per-call rebuild stands.
- Make `BM25Index.getChunk` a `Map` lookup (id → chunk) — one-line fix regardless.

**Acceptance:** configured `bm25Retriever({k1: 1.2})` + `strategy: 'bm25'` uses `k1 = 1.2` (assert via injected spy); RRF ordering test green; `strategy: 'semantic'` with a stub embedder returns non-degraded packets.
**Effort:** ~1.5 days. **Depends on:** Phases 1–2 (engine internals churn), best landed after them.

---

## Phase 6 — Packaging, examples, release readiness, docs truth pass (fixes N8, P6 part 2, P8)

**Goal:** `npm publish` cannot ship a broken package, and every doc claim is true.

### 6.1 `package.json`

- `"prepublishOnly": "npm run typecheck && npm run build && npm run test"`.
- Add `repository` (`git+https://github.com/jxburros/AI-Context-Nugget.git`), `bugs`, `homepage`.
- Fix declaration maps: either add `src/**/*.ts` + `dist/**/*.map` to `files`, or set `declarationMap: false` (recommended: drop it until sources ship).
- Remove `examples` from `files` (they move to workspace packages below); keep `recipes`, `design.md`.

### 6.2 Runnable examples (fixes N8 examples + prior-review "runnable example" ask)

- Give each `examples/*` its own `package.json` with `"@jxburros/context-nugget": "file:../.."` and a `start` script (`node --experimental-strip-types index.ts` on Node ≥22, or compile with the root tsc).
- CI job: build root, then `npm install && npm start` in each example, asserting non-empty stdout. This is the "prove end-to-end use after installation" check the prior review asked for.
- Add the prior review's suggested richer example: `examples/github-issue-triage/` assembling issue + README + code-snippet sources into an untrusted pack (fixture data, no network).

### 6.3 Release checklist — `docs/release-checklist.md`

Version bump + changelog → CI green → `npm pack` inspection (file list, install-from-tarball smoke test) → tag → publish with `--provenance` → post-publish install smoke test. Note the org-scope consideration from the prior review (`@jxburros/…` fine for seed; revisit before serious adoption).

### 6.4 Docs truth pass (fixes P8; do last)

- README: re-verify every claim against post-phase-5 behavior; adopt tagline *“auditable, cited, budgeted context packets for AI apps”*; document replace-on-re-add semantics, memory lifecycle (status/expiry/supersedes now enforced), policy hook contract, redaction opt-in, boundary guarantees (link security-model), and the new diagnostics fields.
- `design.md`: move shipped items out of "Open adapter seams" (semantic contract now exists); add a short "Lifecycle" section.
- Add `CHANGELOG.md` covering 0.2.0 breaking changes: `ContextStore` interface additions, chunk-ID change, metadata allowlist default, `RankOptions` change, replace-on-re-add.

**Acceptance:** fresh clone → `npm ci && npm run typecheck && npm test` green; `npm pack` tarball installs and runs all examples; no README claim without a covering test.
**Effort:** ~1 day. **Depends on:** all prior phases (docs must describe final behavior).

---

## Sequencing summary

| Phase | Theme | Fixes | Effort | Depends on |
|-------|-------|-------|--------|------------|
| 0 | CI + test harness | P6a | 0.5d | — |
| 1 | Data lifecycle | P1, P7, N1, N12a | 1d | 0 |
| 2 | Policy + diagnostics | P2, P4, N10, N12d | 1d | 1 |
| 3 | Chunking + IDs | P3, N3, N7, N12b | 1.5d | 0 (parallel w/ 1–2) |
| 4 | Safety hardening | N2, P5, N9, N11 | 1d | 0 (parallel w/ 1–3) |
| 5 | Retrieval quality | N4, N5, N6, P9 | 1.5d | 1–2 |
| 6 | Packaging + docs truth | N8, P6b, P8 | 1d | 1–5 |

Total: ~7.5 focused days. Critical path: 0 → 1 → 2 → 5 → 6; phases 3 and 4 can proceed in parallel with 1–2. Cut `v0.2.0` after phase 4 if an early publish is wanted (retrieval-quality items are additive), but do not publish before phase 1 — the stale-data defects contradict the package's core promise.

## Explicit non-goals (unchanged from design.md)

No vector database, document conversion, model calls, hosted memory, sync, accounts, UI, or agent loops. The semantic work in phase 5 ships *contracts and a similarity function*, not embedding providers. Evaluation fixtures beyond unit tests (recall/precision scoring per the prior review) are deferred to a post-0.3 milestone alongside the first embeddings adapter package.
