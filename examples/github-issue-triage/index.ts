import { ContextEngine, selectSourcesByPolicy } from '@jxburros/context-nugget';

// Fixture data standing in for a GitHub issue, a repo README, and a code
// snippet pulled from the file the issue references. No network calls.
const readme = {
  id: 'readme',
  kind: 'markdown' as const,
  title: 'README.md',
  trust: 'trusted' as const,
  content: `# Widget Service

## Retry behavior

The client retries failed requests up to 3 times with exponential backoff.

## Configuration

Set \`WIDGET_TIMEOUT_MS\` to override the default 5000ms request timeout.
`,
  metadata: { path: 'README.md' },
};

const issue = {
  id: 'issue-482',
  kind: 'text' as const,
  title: 'Issue #482: requests time out under load',
  trust: 'untrusted' as const,
  content: `Under sustained load, requests to the widget service start timing out
after about 5 seconds, even though retries are supposed to kick in.
Suspect the retry loop isn't actually being reached before the timeout fires.`,
  metadata: { path: 'issues/482.md', url: 'https://example.invalid/issues/482' },
};

const codeSnippet = {
  id: 'client-ts',
  kind: 'text' as const,
  title: 'src/widgetClient.ts',
  trust: 'untrusted' as const,
  content: `async function requestWidget(id: string): Promise<Widget> {
  const timeoutMs = Number(process.env.WIDGET_TIMEOUT_MS ?? 5000);
  return fetchWithTimeout(\`/widgets/\${id}\`, timeoutMs);
  // NOTE: retry wrapper is applied by the caller, not here.
}`,
  metadata: { path: 'src/widgetClient.ts' },
};

const engine = new ContextEngine();
await engine.addSources([readme, issue, codeSnippet]);

// Policy-driven selection: an "issue-triage" task type always needs the
// issue and the README, and optionally pulls in any indexed code.
const selection = selectSourcesByPolicy([readme, issue, codeSnippet], 'issue-triage', [
  { taskType: 'issue-triage', requiredSourceIds: ['issue-482'], optionalKinds: ['markdown', 'text'] },
]);
console.log('Selected sources:', selection.selected.map((s) => s.title).join(', '));

const pack = await engine.retrieveAndPack({
  query: 'Why would requests time out before retries happen?',
  budget: { maxItems: 5, maxTokens: 1200 },
  pack: {
    trustBoundary: 'untrusted-source-data',
    includeCitations: true,
    includeTrust: true,
  },
});

console.log('\n--- Packed context ---\n');
console.log(pack.text);
console.log('\n--- Citations ---');
for (const citation of pack.citations) console.log(citation.label);
console.log('\n--- Diagnostics ---');
console.log(pack.packet.diagnostics);
