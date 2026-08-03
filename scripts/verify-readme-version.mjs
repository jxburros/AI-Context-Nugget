#!/usr/bin/env node
// Enforces the README's standing convention: the last section is
// "## Current release — X.Y.Z", naming the version in package.json and
// summarizing what changed since the previous release. Without this check the
// section silently goes stale one version bump after someone forgets it.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const readme = readFileSync(new URL('README.md', root), 'utf8');

const failures = [];

// Em dash or hyphen, so the check does not hinge on which one an editor typed.
const headingRe = /^## Current release [—-] (\S+)\s*$/m;
const heading = headingRe.exec(readme);

if (!heading) {
  failures.push('README.md has no "## Current release — <version>" section (it must be the last section).');
} else {
  if (heading[1] !== pkg.version) {
    failures.push(`README "Current release" names ${heading[1]}, but package.json is ${pkg.version}.`);
  }

  const body = readme.slice(heading.index + heading[0].length);
  // Only the Pages deployment comment is allowed to trail the section.
  const trailingHeading = /^#{1,6}\s/m.exec(body);
  if (trailingHeading) {
    failures.push('The "Current release" section must be last; another heading follows it.');
  }
  if (!/changed since/i.test(body)) {
    failures.push('The "Current release" section must say what changed since the previous version.');
  }
}

if (failures.length > 0) {
  console.error('README release section is out of date:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nUpdate the section at the bottom of README.md (docs/release-checklist.md step 1).');
  process.exit(1);
}

console.log(`README "Current release" section matches package version ${pkg.version}.`);
