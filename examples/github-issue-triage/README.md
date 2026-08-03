# github-issue-triage

An example showing policy-driven source selection and trust-boundary-aware context packing for a GitHub issue triage scenario, combining a trusted README with untrusted issue text and code snippet fixtures (no network calls).

Run with:

```sh
node --experimental-strip-types index.ts
```

Note: this example requires Node 22.6+ for `--experimental-strip-types`. The `@jxburros/context-nugget` library itself runs on Node >= 20.
