#!/usr/bin/env node
// Wraps the marked-rendered README body (_site/body.html, produced by the
// `marked` CLI in the Pages workflow) in a minimal, readable HTML5 template
// and writes _site/index.html, _site/404.html, and _site/.nojekyll.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const bodyPath = '_site/body.html';
const body = existsSync(bodyPath)
  ? readFileSync(bodyPath, 'utf8')
  : '<p>No project documentation is available yet.</p>';

const title = 'AI Context Nugget';
const repo = process.env.GITHUB_REPOSITORY || '';
const repoLink = repo
  ? `<a href="https://github.com/${repo}">View repository</a>`
  : '';

const css = `
  :root {
    color-scheme: light dark;
  }
  body {
    margin: 0;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
  }
  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    border-bottom: 1px solid #d8d8d8;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
  }
  header h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  a {
    color: #0969da;
  }
  pre {
    background: #f6f8fa;
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
  }
  code {
    font: 0.9em/1.5 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  }
  pre code {
    background: none;
    padding: 0;
  }
  :not(pre) > code {
    background: #f6f8fa;
    border-radius: 4px;
    padding: 0.15em 0.35em;
  }
  img {
    max-width: 100%;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    overflow-x: auto;
    display: block;
  }
  th, td {
    border: 1px solid #d8d8d8;
    padding: 0.4rem 0.6rem;
    text-align: left;
  }
  @media (prefers-color-scheme: dark) {
    body {
      color: #e6e6e6;
      background: #0d1117;
    }
    header {
      border-bottom-color: #30363d;
    }
    a {
      color: #58a6ff;
    }
    pre, :not(pre) > code {
      background: #161b22;
    }
    th, td {
      border-color: #30363d;
    }
  }
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main>
<header>
<h1>${title}</h1>
${repoLink}
</header>
${body}
</main>
</body>
</html>
`;

writeFileSync('_site/index.html', html);
writeFileSync('_site/404.html', html);
writeFileSync('_site/.nojekyll', '');
