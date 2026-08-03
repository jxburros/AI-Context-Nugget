# minimal-doc-qa

A minimal example showing how to index a single markdown document and retrieve a citation-backed context pack for a natural-language query, using BM25 retrieval with no embeddings or vector database.

Run with:

```sh
node --experimental-strip-types index.ts
```

Note: this example requires Node 22.6+ for `--experimental-strip-types`. The `@jxburros/context-nugget` library itself runs on Node >= 20.
