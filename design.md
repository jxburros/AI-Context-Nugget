# Context Nugget — Design Seed

Context Nugget is a pliable context and memory scaffolding engine for AI apps.

It provides reusable primitives for sources, loaders, normalizers, chunkers, stores, retrievers, rankers, memory records, memory layers, context budgets, context packets, context packers, citations, visibility metadata, and untrusted-source packing.

Apps own prompts, model providers, storage policy, privacy policy, memory write policy, deletion behavior, sync behavior, UI, and agent/tool behavior.

## Boundary

```txt
AI Nugget
= model/provider communication

Context Nugget
= retrieval, memory records, context packets, citations, and packing

Apps
= policy, prompts, storage, privacy, consent, UI, sync, deletion, and action lifecycle
```

The package should be usable with AI Nugget, another model SDK, or no model at all.

## Core pipeline

```txt
ContextSource
  -> normalize
  -> chunk
  -> store/index
  -> retrieve
  -> rank/filter
  -> budget
  -> ContextPacket
  -> ContextPack
```

The v0 implementation keeps each stage separable and swappable.

## Core concepts

### Source

A source is any item of context: a Markdown file, app object, memory, issue, repo file, tool result, card, generated artifact, workspace summary, or imported document.

Every source carries a stable ID, kind, optional title, content, trust level, timestamps, and metadata.

### Chunk

A chunk is model-sized source text with source refs. Chunks are traceable back to a title/path/URL/section/page/line range when available.

### Layer

Layers separate context purpose:

- `session` temporary task state
- `user` durable user preferences/facts
- `project` project docs, decisions, issues, artifacts
- `app` app help text and workflows
- `agent` tool traces, scratchpad, plans
- `model` model-specific notes
- `documents` indexed files/uploads
- `artifacts` generated files and outputs
- `external` imported web/search/tool context

Layers are strings so apps can add their own.

### Packet

A `ContextPacket` is the structured, inspectable retrieval result. A packet should exist before a prompt string exists.

A packet records query, layers, items, sources, budget, retrieval mode, degraded mode, diagnostics, and visibility summary.

### Pack

A `ContextPack` is a model-ready representation of a packet. It contains prompt-ready text but preserves citations, sources, token estimates, and packet metadata.

## Lifecycle

Sources and memories are addressed by stable `id`. Re-adding either one replaces its previously indexed chunks — updated content does not leave stale chunks retrievable alongside the new ones. A memory's `status` (`active` / `archived` / `superseded`) and `expiresAt` are enforced at retrieval time, not just by `listMemories`: an archived, superseded, or expired memory's chunk is excluded from every `retrieve()` call, even though the record itself persists for audit. Adding a memory with `supersedes: [oldId, ...]` marks each superseded record accordingly and removes its chunks. `removeSource`/`removeChunks`/`removeMemory` on `ContextStore` make content unreachable through Context Nugget's own retrieval path (they do not reach into copies the app may have made elsewhere — see `docs/security-model.md`).

## Default retrieval stance

BM25 ships first because it is deterministic, dependency-light, testable, and does not require embeddings or a vector database.

Semantic retrieval belongs behind optional adapters. If an app asks for semantic retrieval without configuring it, Context Nugget should visibly degrade to lexical retrieval.

## Default memory stance

Memory is manual or approval-gated by default.

The core can represent memory candidates and policy hooks, but it should not silently decide what to remember. Auto-memory is an app decision.

## Trust stance

Retrieved content is not authority. It can be wrong, stale, malicious, or irrelevant.

The packer supports an untrusted-source-data boundary that explicitly tells downstream model calls to treat retrieved content as evidence, not instructions.

## What is included as of 0.3.0

- Source/chunk/source-ref/citation/packet/pack types.
- Text and Markdown chunkers with exact offset-based line ranges and per-source-kind overrides (`chunkerByKind`).
- Pure TypeScript BM25 retriever, keyword retriever, and a reciprocal-rank-fusion hybrid retriever.
- `Embedder` adapter contract and a cosine-similarity `semanticRetriever`.
- In-memory and JSON-serializable store with lifecycle operations (`removeSource`, `removeChunks`, `removeMemory`, `getMemory`) and replace-on-re-add semantics.
- Source diversity and memory signal ranking.
- Context budgets.
- Citation-rich packers with honest diagnostics (`candidateChunks`, `retrievedResults`, `returnedItems`, `excludedItems`).
- Untrusted-source-data packer with sentinel-forgery hardening and an optional per-call nonce.
- Opt-in secret redaction and metadata-minimalism packet defaults.
- Manual memory records with an enforced `manual`/`suggested`/`auto` policy contract, plus real expiry/archival/supersession enforcement at retrieval time.
- AI Nugget-compatible message/metadata helpers.
- Policy-driven and query-ranked source selectors.
- Tests, recipes, CI, and runnable examples.

## Open adapter seams

The `Embedder` adapter contract and a cosine-similarity `semanticRetriever` now ship in core (`src/retrieval/semantic.ts`) — no embedding provider is bundled, so `strategy: 'semantic'` degrades visibly until an app configures one. Concrete embedding providers remain adapter-package territory.

Future optional packages can add:

- `@jxburros/context-nugget/node` for filesystem loaders and persistence helpers.
- `@jxburros/context-nugget/browser` for IndexedDB/localStorage stores.
- `@jxburros/context-nugget/openai-embeddings` (or similar) for concrete embedding provider implementations of the `Embedder` contract.
- `@jxburros/context-nugget/github` for issues, PRs, commits, README, and repo-file loaders.
- `@jxburros/context-nugget/ai-nugget` for tighter AI Nugget helpers once this package is independent.
- `@jxburros/context-nugget/chroma` and `@jxburros/context-nugget/lancedb` for vector store adapters.
- `@jxburros/context-nugget/markitdown` or `@jxburros/context-nugget/unstructured` for document conversion adapters.

## External design notes

The package should learn from mature projects without becoming them:

- LangChain and LangGraph show why retrieval pieces should be modular and why context, tool context, and lifecycle context should be separate.
- LlamaIndex shows the value of document/node abstractions, ingestion pipelines, indexes, retrievers, storage, and RAG evaluation.
- Haystack shows the power of component pipelines while warning against making the core require graph orchestration.
- Mastra proves that TypeScript AI app ergonomics matter, but Context Nugget should not compete as an agent framework.
- Mem0 and Zep show strong memory positioning; Context Nugget should stay app-owned rather than a hosted memory oracle.
- Ragas shows retrieval and grounding evaluation vocabulary worth mirroring in tests.
- Chroma and LanceDB are adapter targets for dense/sparse/hybrid retrieval, not core dependencies.
- MarkItDown and Unstructured show that document conversion is its own category and should remain optional.

## First-release mantra

Context in. Evidence out. Policy stays yours.
