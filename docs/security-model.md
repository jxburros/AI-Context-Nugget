# Context Nugget — Security Model

Context Nugget retrieves and packs *content*, not *authority*. This document states plainly what the library guarantees, what it does not, and what stays the consuming app's responsibility.

## What Context Nugget guarantees

- **Structural trust boundary.** `packContext({ trustBoundary: 'untrusted-source-data' })` wraps packed text in fenced delimiters (`== BEGIN/END UNTRUSTED SOURCE DATA ==`) with an explicit instruction that the enclosed text is evidence, not instructions.
- **Sentinel forgery resistance.** Any line inside wrapped content that itself looks like a fence delimiter is neutralized (prefixed with `[neutralized] `) before wrapping, so retrieved content cannot forge a fake `== END ... ==` and smuggle injected instructions outside the fence. Apps that also pass a fresh per-call `trustBoundaryNonce` make the fence text unguessable in advance.
- **Deterministic output.** Given the same inputs, chunking, retrieval, ranking, and packing produce the same output — no hidden randomness, no network calls, no model calls.
- **Explicit degraded mode.** If a query requests a retrieval strategy that isn't configured (e.g. `strategy: 'semantic'` with no embedder), the packet is marked `degraded: true` with a human-readable `degradedReason` rather than failing silently or throwing.
- **Lifecycle correctness.** Updating a source or memory replaces its previously indexed chunks; expired, archived, or superseded memories are excluded from retrieval, not just from `listMemories`. Stale content does not linger in what gets packed for a model.
- **Metadata minimalism by default.** `ContextItem.metadata` defaults to a small allowlist of Context-Nugget-owned fields (see `PacketOptions.metadataPolicy`), not a wholesale copy of whatever an app attached to source metadata.

## What Context Nugget does not guarantee

- **Prompt-injection immunity.** The untrusted-source-data boundary is a strong structural signal, not a proof against every model's behavior. A sufficiently adversarial model, or a sufficiently adversarial document, can still influence downstream generation. Apps that pack untrusted content into a prompt must still treat model output as untrusted.
- **Complete secret/PII discovery.** `redactText` (opt-in via `PackOptions.redact`) matches a fixed set of common secret shapes (API keys, bearer tokens, AWS/Slack/GitLab/npm tokens, PEM key blocks, JWT-shaped strings, `KEY=`/`TOKEN=`-style env assignments). It is **best-effort pattern matching**, not a data-loss-prevention system. It will miss novel formats, obfuscated secrets, and most PII (names, emails, addresses, etc.). Redaction is off by default; enabling it reduces risk, it does not eliminate it.
- **Access control.** Context Nugget does not know who is asking. Scoping retrieval to a user/layer (`layers`, `scope`, `filters`) is a convenience for the app's own access-control logic, not a security boundary on its own — the app must ensure a query is only ever issued with a scope the caller is authorized to see.
- **Transport or storage security.** The in-memory store is exactly that — in memory, unencrypted, with no persistence guarantees. Any durable storage, encryption at rest, or encryption in transit is the app's responsibility.
- **Consent, deletion, and retention policy.** `removeSource`/`removeMemory` make content unreachable through Context Nugget's own retrieval path. They do not touch copies the app may have made elsewhere (logs, caches, model provider records, backups). "Right to be forgotten" semantics belong to the app.

## What stays app-owned

Per `design.md`'s boundary: prompts, model providers, storage policy, privacy policy, memory write policy, deletion behavior, sync behavior, UI, consent, and agent/tool behavior. Context Nugget's job ends at producing an inspectable, cited, budget-enforced `ContextPacket`/`ContextPack`. Everything that happens with that pack — what model sees it, under what system prompt, with what user consent — is the app's decision.

## Practical guidance

- Always set `trust` on sources you don't fully control (repo files, web content, user-uploaded documents) and pack them with `trustBoundary: 'untrusted-source-data'`.
- Pass a fresh random `trustBoundaryNonce` per `packContext` call when packing untrusted content, if your runtime has a source of randomness available (Context Nugget stays dependency-free and does not generate one itself).
- Treat `PackOptions.redact` as a defense-in-depth layer, not a substitute for not indexing secrets in the first place.
- Use `metadataPolicy: 'all'` only when you have already reviewed what's in your source metadata and are comfortable with it reaching packed output and any logging/inspection downstream of it.
