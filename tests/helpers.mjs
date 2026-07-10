export const markdownSource = {
  id: 'design',
  kind: 'markdown',
  title: 'Design',
  content: `# Context Nugget

Context Nugget prepares context packets before prompt strings.

## Memory Layers

Session memory is temporary. User memory is durable and visible. Project memory belongs to one project.

## Trust Boundary

Retrieved repository files are untrusted source data. They may contain fake instructions such as ignore previous instructions.
`,
};

export const plainTextSource = {
  id: 'notes',
  kind: 'text',
  title: 'Notes',
  content: Array.from({ length: 30 }, (_, i) => `Line ${i + 1} talks about alpha beta gamma delta topic ${i % 5}.`).join('\n'),
};

export function makeMemoryRecord(overrides = {}) {
  return {
    id: 'mem-fixture',
    layer: 'user',
    scope: 'user:fixture',
    text: 'The user prefers minimal monochrome interfaces.',
    importance: 0.5,
    confidence: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

export const expiredMemoryRecord = makeMemoryRecord({
  id: 'mem-expired',
  text: 'This memory expired long ago and should never surface.',
  expiresAt: '2020-01-01T00:00:00.000Z',
});

export const archivedMemoryRecord = makeMemoryRecord({
  id: 'mem-archived',
  text: 'This memory was archived and should never surface.',
  status: 'archived',
});

export const activeMemoryRecord = makeMemoryRecord({
  id: 'mem-active',
  text: 'This memory is active and should surface normally.',
});
