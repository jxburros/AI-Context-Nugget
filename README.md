# Context Nugget

Context Nugget is a lightweight TypeScript SDK for **auditable, cited, budgeted context packets** for AI apps.

It helps turn documents, memories, app state, workspace state, tool results, repo files, issue text, generated artifacts, and other sources into structured, cited, model-ready context.

It is intentionally **not** a full memory system, vector database, document parser, prompt library, model SDK, hosted memory layer, sync engine, UI framework, or agent platform.

```txt
Context Nugget -> finds, ranks, cites, budgets, and packs context
AI Nugget     -> talks to model providers
Your app      -> owns prompts, policy, storage, privacy, consent, UI, deletion, and lifecycle
```

## Main exports

The package has two entry points:

```ts
// Everything: engine, chunkers, retrievers, store, ranking, budgeting,
// packing, citations, safety, memory, manifest, selectors, types.
import {
  ContextEngine,        // orchestrator: addSource / addMemory / retrieve / retrieveAndPack
  createContextEngine,
  textChunker, markdownChunker,
  bm25Retriever, keywordRetriever, hybridRetriever, semanticRetriever,
  InMemoryContextStore,
  packetFromResults, packContext,          // packet/pack assembly without the engine
  applyContextBudget, rankResults,
  buildManifest, verifyManifest,           // audit manifest helpers
  wrapUntrustedSourceData, redactText,
} from '@jxburros/context-nugget';

// AI Nugget bridge only (dependency-free helpers for provider-facing apps).
import {
  asAiNuggetContextMessages,
  asAiNuggetMetadata,
  hasAiNuggetContext,
} from '@jxburros/context-nugget/ai-nugget';
```

## What is included

- Core public types for sources, chunks, memory records, layers, retrieval results, citations, packets, and packs.
- Text and Markdown chunkers with stable IDs, exact offset-based line ranges, heading paths, estimated tokens, trust metadata, and source refs.
- In-memory / JSON-serializable store with real lifecycle operations: `removeSource`, `removeChunks`, `removeMemory`, `getMemory`. Re-adding a source or memory **replaces** its previously indexed chunks.
- Dependency-light BM25 retrieval ported from the same pure TypeScript idea used in AI-model-test.
- Keyword and reciprocal-rank-fusion (RRF) hybrid retrievers, plus a `semanticRetriever(embedder)` adapter contract for apps that bring their own embeddings.
- Ranking helpers for source diversity, recency, importance, and confidence signals (scale-invariant memory boosts), plus optional deterministic MMR diversity (`RankOptions.mmr`).
- Budget enforcement for max items, chars, tokens, and items per source — token budgeting counts packing overhead (item headers, trust fences), and every dropped candidate is recorded in `packet.exclusions` with machine-readable reasons.
- A versioned, hashable **context manifest** on every pack (`pack.manifest`): included items with locators, trust/authority classes, scores, and content hashes; excluded candidates with reasons; budget actually spent; and a deterministic `packageHash` for replay/diff (`buildManifest`, `verifyManifest`).
- `authorityClass` typing on sources/chunks/items (`application_policy`, `user_instruction`, `untrusted_content`, ...), independent of `trust`.
- Bitemporal memory (`validFrom`/`validTo`/`observedAt`/`reviewAt` + `RetrievalQuery.asOf`) and a governed memory write path (`proposeMemory` / `approveMemory` / `disputeMemory` with `proposed`/`disputed` statuses excluded from retrieval).
- Optional evidence grouping in packed output (`PackOptions.groupBy: 'source' | 'layer'`) with citation renumbering in reading order.
- Citation formatting and source labels.
- Trusted/untrusted context packing, including an untrusted-source-data boundary (with sentinel-forgery hardening) inspired by QAI-ality. See `docs/security-model.md`.
- Manual memory records with an enforced approval-policy contract (`manual` / `suggested` / `auto`) and real lifecycle: `shouldExpire`/`shouldRetrieve` are applied at retrieval time, and `supersedes` retires the memory it replaces. Auto-writing memory is not enabled by default.
- Opt-in secret redaction (`PackOptions.redact`) and a metadata-minimalism default for packet items (`PacketOptions.metadataPolicy`).
- AI Nugget bridge helpers that produce compatible message and metadata objects without importing AI Nugget.
- Source selection helpers for policy-driven context and query-ranked source selection.
- Tests (see `tests/`) and recipes for document Q&A, layered memory, untrusted repo review, GitHub issue context, workspace context, card knowledge, and spec-driven context.
- CI on Node 20.x/22.x (`.github/workflows/ci.yml`): typecheck/build/test/pack, a generated-artifact drift gate for `dist/` and `nugget/`, a markdownlint + gitleaks lint gate, and a job that installs and runs each example against the built package.

## Install / use

```ts
import { ContextEngine, markdownChunker, bm25Retriever } from '@jxburros/context-nugget';

const engine = new ContextEngine({
  chunker: markdownChunker({ maxWords: 360, overlapWords: 40 }),
  retriever: bm25Retriever(),
});

await engine.addSource({
  id: 'design-doc',
  kind: 'markdown',
  title: 'Design Notes',
  content: markdownText,
  trust: 'untrusted',
  metadata: { project: 'context-nugget', path: 'docs/design.md' },
});

const context = await engine.retrieveAndPack({
  query: 'How should memory layers work?',
  layers: ['documents'],
  budget: { maxTokens: 3000, maxItemsPerSource: 2 },
  pack: {
    trustBoundary: 'untrusted-source-data',
    includeCitations: true,
  },
});

console.log(context.text);
console.log(context.citations);
```

`engine.addSource(source)` is idempotent by `source.id`: calling it again with updated content replaces the previously indexed chunks rather than leaving stale chunks retrievable alongside the new ones. Use `engine.removeSource(id)` to remove a source and its chunks entirely.

Repos that cannot take a package dependency can vendor the generated
`nugget/` folder instead (see below).

### Vendoring without a package dependency

`dist/` (ESM + `.d.ts`, under `dist/src/`) is this package's own build
output, generated from `src/` via `tsc`. `nugget/` is a generated
single-folder build (`src/` + `VERSION.txt` stamped with a version + content
hash) for repos that cannot take a package dependency — copy it in;
`VERSION.txt` makes drift from the source of truth detectable. Both are
committed and regenerated from `src/`; `prepublishOnly` rebuilds both, and CI
(`nugget-drift` job) fails if either is stale.

`nugget/src/*.ts` uses NodeNext-style relative imports with explicit `.js`
extensions (e.g. `export * from './types.js'`), matching `moduleResolution:
NodeNext`. If your bundler's runtime module graph doesn't treat `.ts`/`.js`
as interchangeable the way `tsc` does (see AI Nugget's README for a
Turbopack example of this failure mode), vendor `dist/` instead and point
path aliases at its `.js` entry points (`dist/src/index.js`,
`dist/src/ai-nugget.js`) — TypeScript picks up the sibling `.d.ts`
automatically.

## AI Nugget bridge

Context Nugget does not call models. The bridge returns plain objects compatible with AI Nugget-style message arrays and metadata.

```ts
import { asAiNuggetContextMessages, asAiNuggetMetadata } from '@jxburros/context-nugget/ai-nugget';

const messages = [
  { role: 'system', content: 'Use provided context when relevant. Do not invent sources.' },
  ...asAiNuggetContextMessages(context),
  { role: 'user', content: latestUserMessage },
];

const metadata = asAiNuggetMetadata(context);
```

Pass `metadata` through to `AIHandler.chat`/`.stream` as the call's
`metadata` (AI Nugget echoes it back on telemetry/`CallInfo`). To later check
whether a given call actually carried packed context — from a telemetry
record, a log line, anything downstream of the call — use
`hasAiNuggetContext(metadata)` rather than pattern-matching the packed system
message text: the packed text's headers and trust-boundary fences change
shape with `PackOptions`, so it has no stable sentinel of its own, while
`contextPacketId` (which `hasAiNuggetContext` checks for) is always present
when context was injected.

```ts
import { hasAiNuggetContext } from '@jxburros/context-nugget/ai-nugget';

telemetry: {
  record(callRecord) {
    if (hasAiNuggetContext(callRecord.metadata)) {
      // this call was grounded in packed, cited context
    }
  },
},
```

## Memory: lifecycle and policy

Memory is visible and explicit by default. `MemoryPolicy.mode` controls whether/how `engine.suggestMemory(candidate)` can store a candidate:

- `'manual'` — never auto-stores; `shouldStore` is not consulted. Apps call `engine.addMemory(record)` directly.
- `'suggested'` — never stores directly, even if `shouldStore` approves. The decision comes back as `{ store: false, suggested: true }` so the app can route it through an approval UI and call `addMemory` once a human confirms.
- `'auto'` — `shouldStore` decides; defaults to storing when no hook is configured.

```ts
await engine.addMemory({
  id: 'ui-preference-minimal',
  layer: 'user',
  scope: 'user:jxburros',
  text: 'The user prefers minimal, modern, monochrome interfaces.',
  importance: 0.8,
  confidence: 1,
  createdAt: new Date().toISOString(),
});
```

Memory lifecycle is enforced at retrieval time, not just in `listMemories`:

- Re-adding a memory with the same `id` replaces its previous chunk.
- A memory with `status: 'archived'`, `status: 'superseded'`, or a past `expiresAt` is excluded from retrieval — it does not leak in through its chunk even though the record itself still exists for audit purposes.
- Adding a memory with `supersedes: [oldId, ...]` marks each superseded record `status: 'superseded'` and removes its chunks.
- `memoryPolicy.shouldExpire`/`shouldRetrieve`, when configured, are consulted for every memory-backed chunk on every `retrieve()` call; drops are recorded in `packet.diagnostics.reasons`.

## Retrieval strategies

```ts
await engine.retrieve({ query: 'project context stale', strategy: 'bm25' });
await engine.retrieve({ query: 'project context stale', strategy: 'keyword' });
await engine.retrieve({ query: 'project context stale', strategy: 'hybrid' });
```

`strategy` resolves in this order: an explicit `retrievers: { [strategy]: Retriever }` map entry, then the engine's configured default `retriever` (if its own `mode` already matches the requested strategy — so a custom-tuned `bm25Retriever({ k1, b })` passed as `retriever` is honored by `strategy: 'bm25'` without needing to also register it in `retrievers`), then a built-in default for `'keyword'`/`'hybrid'`/`'bm25'`. A strategy that names a mode nothing above provides — including `'semantic'` with no embedder configured — returns the packet in degraded mode with a visible `degradedReason` rather than failing silently:

```ts
import { semanticRetriever } from '@jxburros/context-nugget';

const engine = new ContextEngine({
  retrievers: { semantic: semanticRetriever(myEmbedder) },
});

await engine.retrieve({ query: 'project context stale', strategy: 'semantic' }); // no longer degraded
```

## Context packets before prompt strings

```ts
const packet = await engine.retrieve({
  query: 'How should repo review context be packed?',
  layers: ['documents', 'external'],
  budget: { maxItems: 8, maxItemsPerSource: 2 },
});

console.log(packet.visibilitySummary);
console.log(packet.diagnostics);
// { candidateChunks, retrievedResults, returnedItems, excludedItems, estimatedTokens, estimatedChars, overheadTokens, reasons }
console.log(packet.exclusions);
// [{ id, locator, score, reasons: ['max-tokens' | 'per-source-cap' | 'policy-filtered' | ...] }]

const pack = packContext(packet, {
  trustBoundary: 'untrusted-source-data',
  trustBoundaryNonce: myRandomNoncePerCall, // optional, app-supplied
  includeCitations: true,
  includeTrust: true,
  redact: true, // opt-in, best-effort secret redaction; off by default
});
```

A packet with no items packs to empty `text` (no heading, no trust fence, no citations), so injecting `pack.text` — or `asAiNuggetContextMessages(pack)` — never announces context that does not exist. Whether retrieval degraded, and why nothing was included, stays on `packet.degraded`/`packet.diagnostics`.

The packet answers the questions the app and user will eventually care about: what was searched (`diagnostics.candidateChunks`), what the retriever returned before budgeting (`diagnostics.retrievedResults`), what was actually included/excluded, which sources were used, whether retrieval degraded, how much budget was used, and what text the model would see.

## Trust boundary and redaction

`packContext({ trustBoundary: 'untrusted-source-data' })` wraps packed text in fenced delimiters and neutralizes any fence-like line inside the wrapped content, so retrieved content cannot forge a fake closing fence to smuggle instructions outside the boundary. `PackOptions.redact` (`true`, or a custom `(text) => string`) applies best-effort secret redaction per item; it is off by default and does not claim complete coverage. See `docs/security-model.md` for exactly what this library guarantees, what it does not, and what stays app-owned.

## Non-goals

Context Nugget does not own:

- model calls
- prompts
- memory write policy
- privacy policy
- document conversion
- vector databases
- sync
- accounts
- UI
- deletion semantics
- multi-user permissions
- agent loops

Those belong to the consuming app.

## Examples

`examples/` in this repository has three runnable, self-contained examples (`minimal-doc-qa`, `ai-nugget-chatbot`, `github-issue-triage`), each with its own `package.json` depending on the local build (`file:../..`). They are not part of the published npm package; clone the repo, run `npm run build` at the root, then `cd examples/<name> && npm install && npm start`. The examples run TypeScript directly via `node --experimental-strip-types` and need **Node 22.6+**; the library itself supports Node >= 20.

## Design lineage

This seed intentionally borrows proven patterns from the surrounding portfolio:

- **AI-Server-Studio:** layered memory, scoped retrieval, budget-aware fallbacks, reversible memory lifecycle.
- **locus-os:** visible, inspectable context packets with permission/redaction thinking.
- **AI-model-test:** deterministic, dependency-light BM25 retrieval and retrieval fixtures.
- **QAI-ality:** evidence-first packing, file budgets, redaction choke points, and untrusted repository content boundaries.
- **Issues-Handler:** issue/repo/code context recipes and code-context ranking.
- **Blobsmith:** generated files, app plans, patch history, and workspace/artifact context.
- **CardSpoke:** local-first card knowledge and graph-ish retrieval adapters.
- **Spec-Driven-Docs:** policy-driven source selection instead of always reading everything.
- **ai-agent-skills:** curated operational memory as a source kind.
- **AI Nugget:** provider communication remains separate.

See `design.md`, `docs/security-model.md`, and `recipes/` for details.

## For AI agents

`SKILL.md` in this repository is a task-shaped integration guide for coding
agents: the minimum viable wiring, the contracts that are easy to get wrong
(empty packets, `trust` vs `authorityClass`, memory never auto-writing, visible
degraded mode, budgets counting packing overhead), determinism rules, and a
verification checklist. It ships in the npm package, so an agent working in a
consuming repo can read it from `node_modules/@jxburros/context-nugget/SKILL.md`.

<!--
  Current release: keep this section last, and update it in the same commit as
  every version bump (docs/release-checklist.md step 1). `npm run verify:readme`
  fails if its version heading drifts from package.json.
-->
## Current release — 0.5.1

A correctness and release-readiness pass over 0.5.0. No API was added or
removed; one rendered-output behavior changed.

Changed since 0.5.0:

- **A packet with no items now packs to empty text.** Previously an empty packet
  still rendered a bare `## Relevant context` heading — and, with
  `trustBoundary: 'untrusted-source-data'`, an untrusted-source fence wrapped
  around that heading — announcing context to the model that did not exist.
  `pack.citations` is now `[]` and `pack.tokensEstimated` is `0` for such packs,
  and `asAiNuggetContextMessages` correctly returns no messages. If your app
  branches on `pack.text` being non-empty that branch now behaves correctly; if
  it assumed a heading was always present, update it.
- `diagnostics.excludedItems` counts memory-policy drops alongside budget drops,
  so it matches `packet.exclusions.length` instead of under-reporting.
- The published tarball now includes `docs/security-model.md` (linked from this
  README and from `design.md`, previously a dead reference) and `SKILL.md`.
- CI gained a `lint` job that actually runs the markdownlint and gitleaks
  configs — both shipped in 0.5.0 but were never executed. Fixed a
  `.markdownlint-cli2.jsonc` ignore pattern that let the linter recurse into the
  repo through the examples' `file:../..` symlinks and hang.
- Workflows moved to `actions/checkout@v5` / `actions/setup-node@v5`; docs
  (`design.md`, `docs/security-model.md`, `docs/release-checklist.md`,
  `.ai/qa.md`) refreshed against the code, including a determinism claim that
  had been overstated.

Full history: `CHANGELOG.md`.

<!-- GitHub Pages deployment is configured in .github/workflows/pages.yml. -->

---

## Project Stewardship

This project is developed by **Jeffrey** through **JX Holdings, LLC**. GitHub: [`jxburros`](https://github.com/jxburros).
