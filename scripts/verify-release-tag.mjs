#!/usr/bin/env node
// Verifies that the git tag triggering a release (GITHUB_REF_NAME, e.g. "v0.5.0")
// matches the version in package.json. Exits 1 on mismatch so the release
// workflow fails fast instead of publishing a mismatched artifact.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expected = `v${pkg.version}`;
const actual = process.env.GITHUB_REF_NAME;

if (actual !== expected) {
  console.error(`Release tag ${actual} does not match package version ${expected}`);
  process.exit(1);
}

console.log(`Release tag ${actual} matches package version ${expected}`);
