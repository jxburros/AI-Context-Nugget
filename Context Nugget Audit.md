# Context Nugget — Comprehensive Review & Audit

**Date:** 2026-07-10
**Repo:** `jxburros/AI-Context-Nugget` (main branch, commit `ab7e83a`)
**Auditor:** Devin
**Method:** Full source read of `src/`, `tests/`, `docs/`, `examples/`, `README.md`, `design.md`, `package.json`, `tsconfig.json`, `.github/workflows/ci.yml`; local `npm run typecheck && npm run build && npm test`; run each example; `npm pack` + install-from-tarball smoke test; targeted repro scripts for suspected defects.

---

## 1. Executive summary

The nugget is in strong shape. The prior audit (`docs/audit-2026-07-10.md`) and implementation plan (`docs/implementation-plan.md`) have been executed: the stale-chunk problem is fixed, memory lifecycle is enforced at retrieval, the trust boundary is hardened, the retriever strategy map is real, and the package is now CI-ready and publishable.

However, it is **not quite a flawless v0.3.0**. A few real issues remain, mostly around tokenization consistency, secret-redaction false positives, and API ergonomics. They are all fixable and most are small, but a couple are worth fixing before the package is published or widely used.

**Verdict:** publishable with a short punch list. The architecture is sound, the code is clean, and the test surface is good. Fix the tokenization/redaction items and document the Node 22 example requirement, then this is a credible, useful library.

---

## 2. What I verified

| Check | Result |
|-------|--------|
| `npm ci` | passed |
| `npm run typecheck` | passed (no TS errors) |
| `npm run build` | passed, `dist/` is clean ESM/`.d.ts` |
| `npm test` | **44/44 passed** |
| `npm pack --dry-run` | tarball looks correct; `examples/` not included, `dist/` included |
| Install-from-tarball smoke test | passed, 50 exports importable |
| Examples on Node 22.12 | all three (`minimal-doc-qa`, `ai-nugget-chatbot`, `github-issue-triage`) produce expected output |
| Examples on Node 20.18 | fail because `node --experimental-strip-types` is not available in Node 20 |

The codebase is well-organized:

- Zero runtime dependencies, strict TypeScript, ESM with proper `exports` map.
- `ContextEngine` is the right level of abstraction: source → chunk → store → retrieve → rank → budget → pack.
- Diagnostics are honest (`candidateChunks`, `retrievedResults`, `returnedItems`, `excludedItems`) and tested.
- Trust-boundary hardening is real: sentinel lines are neutralized and a per-call nonce is supported.
- Memory lifecycle (`active`/`archived`/`superseded`, `expiresAt`, `supersedes`) is enforced at the store layer and engine policy layer.
- `BM25`, `keyword`, `hybrid` (RRF), and `semantic` (adapter) retrievers are all present and configurable.
- CI covers Node 20.x/22.x and runs every example against the built package.
- `docs/security-model.md` is an honest, non-hype security statement.

---

## 3. Issues found

### 3.1 Stopword / tokenization inconsistency (medium)

**File:** `src/tokenize.ts`  
**Symptom:** `DEFAULT_STOPWORDS` is exported but never used as a default. `tokenize()` and `keywordRetriever()` do not filter stopwords, while `engine.retrieve()` does an empty-query check using `DEFAULT_STOPWORDS`.

**Repro:**

```ts
import { ContextEngine } from '@jxburros/context-nugget';
const engine = new ContextEngine();
await engine.addSource({ id: 'doc', kind: 'text', title: 'Doc', content: 'the and of something' });
const packet = await engine.retrieve({ query: 'the and of' });
console.log(packet.diagnostics?.reasons);
// [ 'query produced no searchable terms', 'matched terms: the, and, of' ]
console.log(packet.items.length);
// 1
```

The engine says the query had no searchable terms, but the keyword retriever happily matched `the`, `and`, and `of` and returned a result. This is contradictory and makes diagnostics unreliable.

**Fix:** Make a single decision on stopwords and apply it consistently. Two options:
1. Make `tokenize` default to `DEFAULT_STOPWORDS` (or pass `stopwords` in `bm25.ts`/`keyword.ts`/`uniqueTokens`). This is the cleaner semantic fix.
2. Remove the stopword-only empty-query check and base it on what the retriever actually searches.

Do not leave the two paths diverging.

---

### 3.2 Secret redaction has false positives (medium)

**File:** `src/safety.ts`  
**Symptom:** Several `SECRET_PATTERNS` lack `\b` word boundaries, so they redact substrings inside legitimate words.

**Repro:**

```ts
import { redactText } from '@jxburros/context-nugget';
redactText('task-sk-123456789012345678901234');
// "ta[REDACTED]"
redactText('abcAIza1234567890123456789012345678901');
// "[REDACTED]"
redactText('MyBearer 12345678901234567890 token');
// "My[REDACTED] token"
```

Patterns affected: `sk-`, `AIza`, `Bearer` (and arguably `AIza` case already has no boundary). Because redaction is opt-in and best-effort, this is not a security hole, but it will corrupt ordinary text when enabled.

**Fix:** Add `\b` anchors where appropriate:

- `/\bsk-[A-Za-z0-9_\-]{20,}/g`
- `/\bAIza[0-9A-Za-z_\-]{20,}/g`
- `/\bBearer\s+[A-Za-z0-9._\-]{20,}/gi`

Or use a negative lookbehind to block preceding word characters for the patterns where `\b` still matches after a hyphen (`task-sk-` -> `sk-` is preceded by `-` which is non-word, so `\b` alone still matches). A safer rule for `sk-` and `AIza` is `(?<![A-Za-z0-9])`.

---

### 3.3 `metadataPolicy` is not reachable through the engine (medium)

**File:** `src/pack.ts` (`PacketOptions.metadataPolicy`), `src/types.ts` (`RetrieveAndPackOptions`), `src/engine.ts`  
**Symptom:** `packetFromResults` supports `metadataPolicy: 'minimal' | 'all' | (meta) => meta`, and `README.md` line 27 mentions it. But `engine.retrieve()` and `engine.retrieveAndPack()` never accept or pass a `metadataPolicy`. The default `minimal` is always used. A user who wants source metadata in packets must bypass the engine and call `packetFromResults` manually.

**Fix:** Add `metadataPolicy` to either `RetrieveAndPackOptions` or `ContextEngineOptions` and thread it through `engine.retrieve()` → `packetFromResults()`. `packContext()` does not need it because metadata is applied at packet-creation time.

---

### 3.4 Examples require Node 22.6+ but `engines` says `>=20` (medium)

**Files:** `examples/*/package.json`, `README.md`, `package.json`  
**Symptom:** Each example uses `node --experimental-strip-types index.ts`, which is only available in Node 22.6+. The root `package.json` declares `"engines": { "node": ">=20" }`. A user on Node 20 will fail to run the examples despite the engine field claiming compatibility.

**Fix:** Either:
1. Update `engines` to `>=22.6` and document that examples require Node 22+.
2. Rewrite examples as plain JavaScript or compile them with the root `tsc` so they work on Node 20.

Option 1 is fine and matches the CI matrix, which already runs examples only on Node 22.x.

---

### 3.5 `Context Nugget Review.txt` at the root is stale (low)

**File:** `Context Nugget Review.txt`  
**Symptom:** This file is a pre-fix review from 2026-07-09 and claims stale chunks, missing policy enforcement, missing CI, etc. All of those are now fixed. The file will mislead anyone browsing the repo.

**Fix:** Delete it or replace it with a pointer to `docs/audit-2026-07-10.md` and `CHANGELOG.md`.

---

### 3.6 `markdownChunker` treats `#` lines inside code fences as headings (low)

**File:** `src/chunk.ts`  
**Symptom:** `parseMarkdownSections` has no notion of code blocks, so a Markdown file containing a shell script like `#!/bin/bash` or a comment line `# this is a comment` inside a code fence will split the section incorrectly. This is the only common Markdown construct that will break the section parser.

**Fix:** Add a simple code-fence state machine to `parseMarkdownSections` (or strip fenced code blocks before parsing headings). This is a small correctness improvement.

---

### 3.7 `tokenize` is ASCII-only and naive (low)

**File:** `src/tokenize.ts`  
**Symptom:** `tokenize` uses `/[a-z0-9]+/g`. It strips Unicode letters, hyphens/apostrophes (`don't` → `don` + `t`), and camelCase boundaries. This is acceptable for English-only, but it limits the library's reach.

**Fix:** Document the limitation or consider a Unicode-aware tokenizer (e.g., `/\p{L}[\p{L}0-9]*/gu` and a fallback for older Node engines). Not urgent for v0.3.0.

---

### 3.8 `trustBoundaryNonce` is not validated (low)

**File:** `src/safety.ts`  
**Symptom:** If a nonce contains `==` or spaces, the outer fence can contain ambiguous delimiter text. There is no validation or documentation forbidding this.

**Repro:**

```ts
wrapUntrustedSourceData('body', { nonce: '==x==' });
// == BEGIN UNTRUSTED SOURCE DATA ==x== ==
```

**Fix:** Restrict nonces to a documented character set (e.g., `[A-Za-z0-9_-]+`) or sanitize them before embedding. Document the restriction in `docs/security-model.md`.

---

### 3.9 `strategy: 'manual'` causes degraded mode (low / documentation)

**File:** `src/engine.ts`  
**Symptom:** `RetrievalQuery.strategy` includes `'manual'`, but `engine.resolveRetriever()` has no built-in retriever for `manual` and no user-provided one either. Passing `strategy: 'manual'` to `engine.retrieve()` will degrade to the default retriever and set `degraded: true`. The `manual` mode is intended for `packetFromResults()` with hand-picked results, not the engine.

**Fix:** Document this or add a short-circuit that returns an empty `ContextPacket` with `retrievalMode: 'manual'` and no retriever call.

---

## 4. What works well

- **Lifecycle correctness:** `addSource` and `addMemory` replace old chunks; `removeSource`/`removeMemory` clean up; `supersedes` and `status`/`expiresAt` are enforced at retrieval.
- **Policy enforcement:** `shouldExpire`, `shouldRetrieve`, and `shouldStore` are wired and tested.
- **Diagnostics:** `candidateChunks`, `retrievedResults`, `returnedItems`, `excludedItems`, and `reasons` are accurate and auditable.
- **Trust boundary:** `wrapUntrustedSourceData` neutralizes sentinel lines and supports a per-call nonce.
- **Retrieval quality:** `BM25` is implemented correctly, `hybrid` uses RRF, `semantic` is a real adapter over a user-provided `Embedder`, and strategy resolution honors configured retrievers.
- **Chunking:** `textChunker` and `markdownChunker` now produce exact, offset-based line ranges and preserve heading paths.
- **Packaging:** `prepublishOnly`, `repository`/`bugs`/`homepage`, `files`, CI, and runnable examples are all in place.
- **Security docs:** `docs/security-model.md` clearly states what the library guarantees and what it does not.

---

## 5. Recommendations / next steps

1. **Fix tokenization consistency** (stopwords in `tokenize`/`retrievers` or remove the empty-query stopword assumption).
2. **Fix redaction false positives** by adding word-boundary / negative-lookbehind anchors to `sk-`, `AIza`, and `Bearer` patterns.
3. **Expose `metadataPolicy`** through `engine.retrieve` / `retrieveAndPack` options.
4. **Align example/runtime Node version** with `engines` or update `engines`.
5. **Delete or replace** `Context Nugget Review.txt`.
6. **Optionally:** skip code blocks in `markdownChunker`, document Unicode tokenizer limits, and validate `trustBoundaryNonce`.

After those, the package is ready to publish and the `v0.3.0` release will be a genuinely solid, small-but-useful TypeScript context-packet library.
