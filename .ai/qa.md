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

## Invariants

- Keep retrieval, ranking, budgeting, and stable identifiers deterministic.
- Preserve exact citations, source references, trust metadata, and diagnostics.
- Never allow retrieved content to escape the untrusted-source boundary.
- Keep memory lifecycle decisions visible, scoped, reversible, and testable.
- Do not add model-provider calls, secret storage, document parsing, or sync to
  this package; those remain app-owned concerns.
- Keep the AI Nugget bridge dependency-free and limited to compatible data.

## Browser and live checks

The package is intended to be browser-compatible, but this repository does not
ship an interactive app or browser storage flow. Do not treat generic UI,
`file://`, or IndexedDB checks as passed or failed here. If a change introduces
a browser-specific adapter or runtime branch, add a focused real-browser
contract test for that behavior and record any missing-browser skip honestly.

This package does not call live models or remote services. Network or API-key
checks are not applicable.
