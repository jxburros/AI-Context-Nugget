# Changelog

All notable changes to this project are documented in this file.

## 0.5.0

Implements the highest-value recommendations from the AI context systems
research report (auditability, honest budgets, governed memory), closes every
open item from the 2026-07-10 root audit punch list, and resolves all open
QA-generated issues.

### Added

- **Context manifest** (`src/manifest.ts`): every `packContext` call now
  attaches a versioned, serializable `ContextManifest` (`pack.manifest`,
  disable with `PackOptions.includeManifest: false`) recording each included
  item's locator, trust/authority class, scores, selection reasons, token
  estimate, and content hash; every excluded candidate with machine-readable
  reasons; and the budget actually spent. `packageHash` is deterministic
  (covers the selection, excludes time/scores) so two runs selecting the same
  content in the same order hash identically — `buildManifest`,
  `manifestHash`, `verifyManifest`, and `canonicalJson` are exported.
- `AuthorityClass` — a typed authority field on sources, chunks, and items
  (`application_policy`, `project_instruction`, `user_instruction`,
  `tool_result`, `derived_content`, `agent_claim`, `untrusted_content`),
  deliberately independent of `trust`. Chunkers derive it via
  `defaultAuthorityClass(source)`; memory chunks are `derived_content`.
- Structured exclusion reporting: `applyContextBudget` returns `exclusions`
  (with reasons `max-items`, `per-source-cap`, `max-chars`, `max-tokens`,
  `no-token-budget`) and report-level `reasons` (e.g. when `reserveTokens`
  consumes the whole budget); packets expose `packet.exclusions` including
  memory-policy drops (`policy-filtered`); diagnostics gain `overheadTokens`.
- Bitemporal memory: optional `validFrom`/`validTo`/`observedAt`/`reviewAt`
  on `MemoryRecord`, an `asOf` reference time on `RetrievalQuery` (applied at
  the store via `recordIsActive(record, { asOf })`), and `isDueForReview`.
- Governed memory write path: `MemoryStatus` gains `'proposed'` and
  `'disputed'` (both excluded from retrieval); `engine.proposeMemory`,
  `engine.approveMemory`, and `engine.disputeMemory` implement
  propose -> approve/dispute; `RetrievalQuery.memoryStatuses` lets approval
  UIs list non-active records via `listMemories`.
- Deterministic MMR diversity re-ranking: `applyMmr` and
  `RankOptions.mmr: { lambda }` (token-overlap similarity, no embeddings);
  `RetrievalQuery.rank` threads `RankOptions` through `engine.retrieve`.
- Evidence grouping: `PackOptions.groupBy: 'source' | 'layer'` renders items
  grouped (lost-in-the-middle mitigation) with citations renumbered in
  reading order; `packet.items` keeps ranked order.
- `metadataPolicy` is now reachable through the engine:
  `ContextEngineOptions.metadataPolicy`, a per-call override on
  `engine.retrieve(query, { metadataPolicy })`, and
  `RetrieveAndPackOptions.metadataPolicy`. `METADATA_ALLOWLIST` is exported
  and now includes `startWord`/`endWord` so text-chunk offsets survive the
  default policy.
- Typed AI Nugget bridge: exported `AiNuggetMetadata` interface,
  `hasAiNuggetContext` is a type predicate, and metadata includes
  `contextManifestHash` when the pack carries a manifest.
- Deterministic ranking support: `RankOptions.now` and optional `nowMs`
  parameters on `recencyBoost`/`daysSince`.
- Tests: new `budget`, `rank`, `manifest`, and `citations` test files plus
  lifecycle/policy/safety/chunking/bridge extensions (48 -> 106 tests).
- Repo-specific QA instructions (`.ai/qa.md`) for the package contract,
  generated-artifact drift, security invariants, examples, and honest
  browser/live-check applicability (previously listed under Unreleased).

### Changed

- **Breaking (behavior):** memory ranking boosts are multiplicative
  (`score * (1 + boost)`, boost clamped to [0, 1]) instead of additive.
  Additive boosts (up to +0.35) let any high-importance memory outrank every
  document under RRF hybrid scores (~0.016); ranking order can change.
  The boost also now gates on `metadata.memoryId` (which `memoryToChunk`
  always sets) instead of `sourceKind === 'memory'` (which it does not
  guarantee), and `scoreBreakdown` reports
  `preBoostScore`/`memoryBoostFactor`/`memoryAdjusted`.
- **Breaking (behavior):** token budgeting now counts packing overhead —
  per-item headers and pack framing (heading, trust fence) are charged
  against `maxTokens` by default, so `diagnostics.estimatedTokens` converges
  with the measured `pack.tokensEstimated` instead of under-reporting by
  ~30%. Fewer items may fit under the same `maxTokens`; pass
  `budgetOptions: {}` (engine) or call `applyContextBudget` without options
  to restore raw content-only accounting.
- `applySourceDiversity` sorts its input before assigning per-source
  penalties, so direct callers get the same result regardless of argument
  order (unchanged through `rankResults`).
- `strategy: 'manual'` no longer degrades to the default retriever: it
  short-circuits to an empty packet with `retrievalMode: 'manual'` and an
  explanatory diagnostics reason (apps supply results via
  `packetFromResults`).
- `formatSourceLabel` uses explicit `!== undefined` checks (0-valued
  `page`/`lineStart`/`lineEnd` now render) and shows page and line range
  together instead of treating them as mutually exclusive.
- `tokenize` is Unicode-aware (`\p{L}\p{N}`); pure-ASCII output is
  unchanged. `DEFAULT_STOPWORDS` documents exactly where it applies (only
  the engine's empty-query diagnostic heuristic — retrievers stay
  stopword-free because BM25's IDF already down-weights common terms).
- `markdownChunker` tracks code fences: `#` lines inside ```` ``` ````/`~~~`
  blocks (shell comments, shebangs) no longer split sections or pollute
  heading paths.
- Secret-redaction patterns for `sk-`/`AIza`/`Bearer` are anchored with
  lookbehinds so prefixed identifiers (`task-sk-...`, `abcAIza...`,
  `MyBearer ...`) are no longer false positives.
- `wrapUntrustedSourceData` validates the nonce against `[A-Za-z0-9_-]+` and
  throws on anything that would make the fence ambiguous.
- `npm test` uses a shell-independent glob (`node --test "tests/*.test.mjs"`).
- `package.json` `files` now ships `dist/**/*.js.map`, fixing broken
  `sourceMappingURL` references in the published tarball; `package-lock.json`
  version drift (0.1.0) fixed.
- `publish.yml` tag verification moved to `scripts/verify-release-tag.mjs`
  (the inline `node -e` one-liner had backticks/`${...}` mangled by bash —
  shellcheck SC2006/SC2086); npm publishing now uses `--provenance` with
  `id-token: write`.
- GitHub Pages workflow renders the README as real HTML (via `marked` at
  build time; the runtime library remains zero-dependency) instead of an
  escaped `<pre>` dump.
- Repo hygiene: `.gitleaks.toml` allowlists the intentional fake secret
  fixtures in `tests/safety.test.mjs`; `.markdownlint-cli2.jsonc` configures
  MD013/MD024 sanely; historical audit/implementation-plan docs carry
  superseded banners; examples document their Node 22.6+ requirement.

### Fixed

- Budget accounting is consistent for mixed explicit/estimated token counts,
  and `tokensEstimated` always equals the accumulated admission total
  (previously unverified; now unit-tested).
- Top-ranked items dropped by budget constraints are no longer silent — the
  skip-and-continue admission is traced through `packet.exclusions` and the
  manifest.

## 0.4.0

## 0.4.0

Closes the packaging/publishing gap identified while integrating this
package into a downstream app (`Test-App`/Nugget Bench) — no data-lifecycle
or correctness changes; 0.3.0 already covered those.

### Added

- `hasAiNuggetContext(metadata)` in `src/ai-nugget.ts` — detects whether a
  chat call's `metadata` (from `asAiNuggetMetadata`) carries packed context,
  via the stable `contextPacketId` field, instead of pattern-matching the
  packed system message text (whose headers/fences vary with `PackOptions`
  and have no stable sentinel of their own).
- `nugget/` — a generated, vendorable single-folder build (`src/` +
  `VERSION.txt` stamped with a version + content hash), matching AI Nugget's
  vendoring convention, for repos that cannot take a package dependency.
  Built via the new `npm run build:nugget` script.
- `dist/` is now committed (previously gitignored and only produced by a
  local `npm run build`) so consuming this repo directly — not via the npm
  package — no longer requires a manual build step first.
- `.github/workflows/publish.yml` — publishes to npmjs.org and GitHub
  Packages on `release: published`, mirroring AI Nugget's release workflow.
  This was the actual blocker to a first publish; the package has been
  correctness-ready since 0.3.0.
- CI: `nugget-drift` job (fails if committed `dist/`/`nugget/` is stale) and
  a `build:nugget` step in the `test` job.
- Tests for the AI Nugget bridge (`tests/ai-nugget-bridge.test.mjs`) — this
  module had no test coverage before.

### Changed

- `ContextPacket.items` gained a doc comment clarifying the field name
  (`items`, not `results` — that convention lives one layer down, in
  `RetrievalResult[]`). Caught by a downstream integrator guessing wrong on
  first use; no runtime change.
- README: added a vendoring subsection (mirroring AI Nugget's) and bridge
  guidance to use `hasAiNuggetContext` instead of text-matching.
- `docs/release-checklist.md` updated now that a CI-driven `publish.yml`
  exists — the checklist previously described a manual/local `npm publish`
  as the only path.

## 0.3.0

First publishable release. Implements the fixes and hardening from `docs/audit-2026-07-10.md` / `docs/implementation-plan.md`. The package was never published before this version, so these are listed as breaking changes relative to the `0.1.0` seed rather than as a deprecation cycle.

### Breaking changes

- **`ContextStore` interface** gained `removeSource`, `removeChunks`, `removeMemory`, and `getMemory`. Third-party `ContextStore` implementations must add these methods.
- **Re-adding a source or memory now replaces its chunks.** `engine.addSource`/`engine.addMemory` remove the previous chunks for that id before indexing the new content. Previously, updated content left old chunks orphaned but still retrievable.
- **Expired, archived, and superseded memories are excluded from retrieval**, not just from `listMemories`. `listChunks` now checks the backing `MemoryRecord`'s status/`expiresAt` for memory-backed chunks.
- **Chunk IDs changed.** `stableHash` widened from a single 32-bit FNV-1a lane to two lanes (~64 bits) to push the collision bound far beyond seed-scale corpora, and chunk ID seeds now use full chunk text instead of a truncated prefix. IDs from `0.1.x` will not match IDs generated by this version.
- **`ContextItem.metadata` defaults to a minimal allowlist** (`chunkIndex`, `headingPath`, `memoryId`, `scope`, `tags`, `importance`, `confidence`, `status`) instead of a wholesale copy of chunk/source metadata. Pass `metadataPolicy: 'all'` to `packetFromResults`/`PacketOptions` to restore the old behavior.
- **`RankOptions.maxItemsPerSource` removed.** It was accepted but never implemented by the ranking stage. Per-source limits are enforced by `ContextBudget.maxItemsPerSource` at the budget stage, which is unaffected.
- **`HybridRetriever` fusion algorithm changed** from raw score addition (which put BM25 and keyword scores on incompatible scales) to reciprocal rank fusion (RRF). Hybrid result ordering and `scoreBreakdown` shape will differ from `0.1.x`. The constructor now accepts `HybridRetrieverOptions` (`{ retrievers?, k? }`) instead of no arguments.
- **`ContextEngineOptions.chunker` is no longer defaulted to `markdownChunker()`.** When unset, the engine now resolves a kind-smart built-in default per source (`markdownChunker` for `kind: 'markdown'`, `textChunker` otherwise) via the new `chunkerByKind` resolution order. An explicitly configured `chunker` is now honored for *every* source kind, including markdown (previously markdown sources always used a fresh default chunker, ignoring the configured one).
- **`manualMemoryPolicy.shouldStore` removed.** It was dead code — `mode: 'manual'` never consulted it. See the documented mode × `shouldStore` contract in `src/memory.ts`.
- **`ContextDiagnostics.searchedChunks` is deprecated** (still present, now aliased to the new `candidateChunks`). It will be removed in a future release; use `candidateChunks`/`retrievedResults` instead.

### Added

- `ContextEngine.removeSource(id)` / `removeMemory(id)` convenience methods.
- `MemoryRecord.supersedes` is now honored: adding a memory that supersedes another marks the superseded record `status: 'superseded'` and removes its chunks.
- `memoryPolicy.shouldExpire` / `shouldRetrieve` are now enforced during `engine.retrieve`, with drops recorded in `diagnostics.reasons`.
- `MemoryDecision.suggested` field; `mode: 'suggested'` now never stores directly — it surfaces `{ store: false, suggested: true }` so apps can route to an approval flow.
- `ContextEngineOptions.chunkerByKind` for per-source-kind chunker overrides.
- Exact, offset-based line ranges in `textChunker`/`markdownChunker`. Previously line ranges were silently `undefined` for most realistic text (any content with newlines/multiple spaces) and wrong when present.
- `ContextEngineOptions.retrievers` — a strategy-name-to-retriever map consulted before built-in defaults, so `strategy: 'bm25'` (etc.) honors a constructor-injected, custom-configured retriever instead of silently substituting a fresh default instance.
- Generalized retrieval degraded-mode: any `strategy` naming a mode with no configured/built-in retriever degrades visibly with a reason, not just `'semantic'`.
- `semanticRetriever(embedder)` and the `Embedder` adapter contract (`src/retrieval/semantic.ts`) — a real cosine-similarity retriever over an app-supplied embedder, no embedding provider bundled.
- Sentinel-forgery hardening: `wrapUntrustedSourceData` neutralizes any fence-like line inside wrapped content, and accepts an optional per-call `nonce` (`PackOptions.trustBoundaryNonce`) for an unguessable fence.
- Expanded secret-redaction patterns (AWS access keys, Slack tokens, PEM private-key blocks, GitLab/npm tokens, JWT-shaped strings) and opt-in wiring via `PackOptions.redact` (`true` for the built-in redactor, or a custom function). Off by default.
- `PacketOptions.metadataPolicy` (`'all' | 'minimal' | (meta) => meta`).
- `docs/security-model.md` — what the library guarantees, what it doesn't, and what stays app-owned.
- `docs/release-checklist.md`.
- CI (`.github/workflows/ci.yml`): typecheck/build/test/`npm pack --dry-run` on Node 20.x/22.x, plus an `examples` job that installs and runs each example against the built package.
- Each `examples/*` now has its own `package.json` depending on the root package via `file:../..`, and a new `examples/github-issue-triage/` example.
- `package.json`: `repository`, `bugs`, `homepage`, and a `prepublishOnly` script (typecheck + build + test) so a broken build cannot be published.

### Fixed

- `BM25Index.getChunk` is now a `Map` lookup instead of an O(n) linear scan.
- Store snapshot `export()`/`import()` round-trips are now identity-stable (both paths apply the same `updatedAt`/`status` normalization).
- Empty or stopword-only queries now surface an explicit `"query produced no searchable terms"` diagnostics reason instead of silently returning an unexplained empty packet.
- `declarationMap` removed from `tsconfig.json` — it previously emitted `.d.ts.map` files referencing `../src` paths that are excluded from the published package, breaking go-to-definition for consumers.

## 0.1.0

Initial seed release (unpublished).
