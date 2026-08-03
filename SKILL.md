---
name: context-nugget-integration
description: Integrate the @jxburros/context-nugget package into an app — building auditable, cited, budgeted context packets from documents, memories, tool results, or repo content before a model call. Use when adding retrieval/RAG, context assembly, prompt grounding, citations, context budgets, memory lifecycle, or untrusted-content packing to a TypeScript/JavaScript app, or when working with ContextEngine, ContextPacket, ContextPack, ContextManifest, or the AI Nugget bridge.
---

# Implementing with Context Nugget

Context Nugget turns heterogeneous sources into a **`ContextPacket`** (structured,
inspectable) and then a **`ContextPack`** (model-ready text plus citations and an
audit manifest). It does not call models, own prompts, or store anything durably.

Version: 0.5.1. Runtime: Node >= 20, zero dependencies, ESM only.

## Decide first: is this the right tool?

Use it when the app must show *what the model was given and why* — cited answers,
inspectable context, token budgets, untrusted document handling, auditable
retrieval.

Do not reach for it as a vector database, document parser (PDF/DOCX), model SDK,
agent framework, or hosted memory service. Those are explicit non-goals; wire them
in around it.

## Minimum viable integration

```ts
import { ContextEngine } from '@jxburros/context-nugget';

const engine = new ContextEngine();

await engine.addSource({
  id: 'design-doc',            // stable id — re-adding replaces its chunks
  kind: 'markdown',            // drives the default chunker
  title: 'Design Notes',
  content: markdownText,
  trust: 'untrusted',          // set this on anything you do not fully control
  metadata: { path: 'docs/design.md' },
});

const pack = await engine.retrieveAndPack({
  query: userQuestion,
  budget: { maxTokens: 3000, maxItemsPerSource: 2 },
  pack: { trustBoundary: 'untrusted-source-data', includeCitations: true },
});

pack.text;      // string to put in a prompt
pack.citations; // Citation[] to render in the UI
pack.manifest;  // audit record of what was included/excluded and why
```

Two entry points only:

```ts
import { /* everything */ } from '@jxburros/context-nugget';
import { asAiNuggetContextMessages, asAiNuggetMetadata, hasAiNuggetContext }
  from '@jxburros/context-nugget/ai-nugget';
```

## The contracts agents get wrong

These are the failure modes worth checking before shipping an integration.

**An empty packet packs to empty text.** No heading, no citations, no trust fence,
`tokensEstimated: 0`. This is deliberate — the packer must never announce context
that does not exist. Branch on `pack.text` (or let `asAiNuggetContextMessages`
return `[]`) rather than assuming a non-empty string. Why nothing was included
lives on `packet.diagnostics` and `packet.degraded`.

**The packet field is `items`, not `results`.** `RetrievalResult[]` is one layer
down, inside the retrievers; `ContextPacket.items` is the ranked-and-budgeted view.

**`trust` and `authorityClass` are separate and must stay separate.** `trust`
drives fencing and labeling of retrieved text. `authorityClass`
(`application_policy`, `project_instruction`, `user_instruction`, `tool_result`,
`derived_content`, `agent_claim`, `untrusted_content`) records what authority the
content carries, for audit and precedence. Do not derive one from the other in app
code; `defaultAuthorityClass(source)` already handles the default mapping.

**Memory never auto-writes by default.** `MemoryPolicy.mode` is `'manual'` unless
you change it, and `engine.suggestMemory()` will not store under `'manual'` or
`'suggested'` — under `'suggested'` an approving `shouldStore` still returns
`{ store: false, suggested: true }`, expecting the app to route it through an
approval UI and call `engine.addMemory()` itself. If a memory is not appearing,
check the mode before suspecting retrieval.

**Retrieval strategies degrade visibly, they do not throw.** `strategy: 'semantic'`
without a configured embedder returns a packet with `degraded: true` and a
`degradedReason`, using the default retriever. Surface that in the UI or logs, or
you will silently ship lexical results while believing they are semantic:

```ts
import { semanticRetriever } from '@jxburros/context-nugget';
const engine = new ContextEngine({ retrievers: { semantic: semanticRetriever(myEmbedder) } });
```

`strategy: 'manual'` is different — it short-circuits to an empty packet on
purpose, expecting the app to build results itself and call `packetFromResults`.

**Budgets count packing overhead.** `maxTokens` charges item headers, citation
labels, separators, and the trust fence in addition to chunk text, so fewer items
fit than a naive content-only estimate suggests. That is what makes
`diagnostics.estimatedTokens` converge with the measured `pack.tokensEstimated`.
Pass `budgetOptions: {}` to opt out and budget raw content only.

**`reserveTokens` is response headroom**, deducted from `maxTokens` before packing.
Setting it `>= maxTokens` yields an empty packet with a `no-token-budget` reason —
that is a configuration bug, and the report tells you so.

**The trust-boundary nonce must match `[A-Za-z0-9_-]+` or it throws.** Context
Nugget is dependency-free and does not generate randomness; supply a fresh nonce
per call from the app's own source. An invalid nonce is a hard error rather than a
weakened fence.

**Redaction is opt-in and best-effort.** `PackOptions.redact` is off by default and
matches a fixed set of secret shapes. It is defense in depth, not a reason to index
secrets.

**Re-adding a source or memory replaces its chunks.** `addSource` with an existing
`id` removes the old chunks first, so updated content never leaves stale chunks
retrievable. Rely on this instead of remove-then-add.

## Determinism

Selection is deterministic: same inputs produce the same content in the same order.
Two fields are clock-stamped and will differ between runs — `packet.id` and
`packet.createdAt`. To assert two runs produced the same context, compare
`pack.manifest.packageHash` (which excludes time, scores, and diagnostics), not the
packet id.

For reproducible tests, pin the clock explicitly:

```ts
await engine.retrieve({
  query,
  rank: { now: '2026-01-01T00:00:00.000Z' },   // memory recency boost
  asOf: '2026-01-01T00:00:00.000Z',            // memory validity windows
});
```

## Auditing what the model saw

```ts
import { verifyManifest } from '@jxburros/context-nugget';

const { manifest } = pack;
verifyManifest(manifest);   // packageHash still matches its contents
manifest.items;             // locator, trust, authorityClass, score, contentHash
manifest.excluded;          // machine-readable reasons: 'max-tokens', 'per-source-cap',
                            // 'max-chars', 'max-items', 'no-token-budget', 'policy-filtered'
manifest.budget;            // requested vs actually spent, including overhead
```

Manifests contain source locators and retrieval internals — apply the same logging
care you would to the pack itself.

## Choosing the pieces

| Decision | Default | Change it when |
|---|---|---|
| Chunker | `markdownChunker` for `kind: 'markdown'`, else `textChunker` | Per-kind needs differ — pass `chunkerByKind` |
| Retriever | `bm25Retriever()` | You have embeddings (`retrievers: { semantic }`) or want RRF fusion (`hybrid`) |
| Store | `InMemoryContextStore` | You need persistence — implement `ContextStore` (11 methods) |
| Memory mode | `'manual'` | The app has an approval UI (`'suggested'`) or explicit user consent (`'auto'`) |
| Metadata | `'minimal'` allowlist | You have reviewed your source metadata and accept it reaching packed output |
| Grouping | ranked pile | Long contexts — `groupBy: 'source' \| 'layer'` mitigates lost-in-the-middle |

## Layers and scope are organization, not access control

`layers`, `scope`, and `filters` narrow retrieval, but Context Nugget does not know
who is asking. The app must guarantee a query is only ever issued with a scope the
caller is authorized to see. See `docs/security-model.md` for the full boundary.

## Verifying an integration

- Cited answers trace back: every `ContextItem` has a `citation`, and
  `packet.sources` matches what the UI shows.
- An empty result renders as "no context found", not an empty context block.
- Untrusted sources are packed with `trustBoundary: 'untrusted-source-data'`.
- `packet.degraded` is surfaced somewhere a human will see it.
- Budget exclusions are inspectable — `packet.exclusions` explains every drop.
- Deleting a source or memory in the app calls `removeSource`/`removeMemory`.

## Reference material in this repo

- `README.md` — API tour and current release notes.
- `design.md` — architecture, layers, and the boundary against apps/AI Nugget.
- `docs/security-model.md` — guarantees, non-guarantees, app-owned concerns.
- `recipes/` — document Q&A, layered memory, untrusted repo review, GitHub issue
  context, workspace context, card knowledge, spec-driven context.
- `examples/` — three runnable end-to-end integrations.
