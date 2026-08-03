# ai-nugget-chatbot

An example showing how to store a user-scoped memory, retrieve and pack relevant context for an incoming chat message, and convert the packed context into chat messages and metadata via the `ai-nugget` helpers for use with an LLM API.

Run with:

```sh
node --experimental-strip-types index.ts
```

Note: this example requires Node 22.6+ for `--experimental-strip-types`. The `@jxburros/context-nugget` library itself runs on Node >= 20.
