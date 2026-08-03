# Context Nugget QA

Context Nugget is a headless TypeScript library for building auditable,
budgeted context packets. It has no standalone UI, file-input flow,
localStorage, or IndexedDB behavior.

## Required checks

Install from the lockfile, then run the package's full deterministic contract:

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run build:nugget
npm pack --dry-run
```

After building generated artifacts, confirm they match source:

```bash
git status --short dist nugget
```

Any output means `dist/` or `nugget/` must be reviewed and committed with the
source change. Run the examples job when public exports, packaging, recipes, or
bridge helpers change.

Repo hygiene gates, also enforced by the `lint` CI job — keep them passing
locally before pushing:

```bash
npx markdownlint-cli2
gitleaks dir . --config .gitleaks.toml --redact --no-banner --exit-code 1
```

## Invariants

- Keep retrieval, ranking, budgeting, and stable identifiers deterministic.
  `RankOptions.now` and `RetrievalQuery.asOf` exist so time-dependent behavior
  can be pinned in tests; do not add hidden `Date.now()` or randomness to the
  retrieval or packing path.
- Preserve exact citations, source references, trust metadata, and diagnostics.
  Diagnostics must stay honest: `candidateChunks`, `retrievedResults`,
  `returnedItems`, and `excludedItems` measure distinct things, `excludedItems`
  matches `packet.exclusions.length`, and `estimatedTokens` counts packing
  overhead instead of under-reporting what actually ships.
- Every pack carries a verifiable `ContextManifest` unless the caller opts out.
  `packageHash` stays deterministic — it covers the selection (query, layers,
  retrieval mode, requested budget, and each item's identity, order, and
  content hash) and must never absorb time, scores, or diagnostics.
  `verifyManifest` is the contract test for this.
- Keep `trust` and `authorityClass` separate. `trust` drives fencing and
  labeling of retrieved text; `authorityClass` records what authority the
  content carries for audit and precedence. Do not collapse them.
- Never allow retrieved content to escape the untrusted-source boundary.
  Sentinel-like lines inside wrapped content stay neutralized, and an invalid
  `trustBoundaryNonce` throws rather than emitting a weakened fence.
- Packed output must not overstate itself: a packet with no items packs to
  empty text, no citations, and no trust fence.
- Keep memory lifecycle decisions visible, scoped, reversible, and testable.
  Expired, archived, superseded, proposed, and disputed records stay out of
  retrieval — enforced at the store, not only in `listMemories`. The
  `manual` / `suggested` / `auto` policy contract is behavioral, not advisory.
- Do not add model-provider calls, secret storage, document parsing, network
  access, or sync to this package; those remain app-owned concerns, and the
  runtime stays dependency-free.
- Keep the AI Nugget bridge dependency-free and limited to compatible data.

## Browser and live checks

The package is intended to be browser-compatible, but this repository does not
ship an interactive app or browser storage flow. Do not treat generic UI,
`file://`, or IndexedDB checks as passed or failed here. If a change introduces
a browser-specific adapter or runtime branch, add a focused real-browser
contract test for that behavior and record any missing-browser skip honestly.

This package does not call live models or remote services. Network or API-key
checks are not applicable.
