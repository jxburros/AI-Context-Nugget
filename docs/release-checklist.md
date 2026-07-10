# Release checklist

1. **Version bump + changelog.** Update `version` in `package.json` and add a dated entry to `CHANGELOG.md` describing what changed, calling out breaking changes explicitly.
2. **CI green.** Confirm the CI workflow (`.github/workflows/ci.yml`) is green on the commit being released: typecheck, build, test, and `npm pack --dry-run` on Node 20.x and 22.x, plus the `examples` job.
3. **`npm pack` inspection.**
   - Run `npm pack --dry-run` and review the file list — it should contain `dist/**/*.js`, `dist/**/*.d.ts`, `README.md`, `design.md`, `CHANGELOG.md`, `recipes/`, and `LICENSE`. It should **not** contain `src/`, test files, or `examples/` (examples depend on the package via `file:../..` and are for local/CI use, not for shipping in the tarball).
   - Install-from-tarball smoke test:
     ```sh
     npm pack
     mkdir -p /tmp/context-nugget-smoke && cd /tmp/context-nugget-smoke
     npm init -y
     npm install /path/to/jxburros-context-nugget-<version>.tgz
     node -e "import('@jxburros/context-nugget').then(m => console.log(Object.keys(m).length, 'exports'))"
     ```
     Confirm it imports without error and reports a non-zero export count.
4. **Tag.** `git tag vX.Y.Z && git push origin vX.Y.Z` (only after the above pass).
5. **Publish.** `npm publish --provenance --access public` (provenance requires publishing from a supported CI environment with OIDC; fall back to plain `npm publish` for a manual/local release, but prefer CI-based provenance publishing once this repo's release workflow runs in GitHub Actions).
6. **Post-publish smoke test.** In a clean directory: `npm install @jxburros/context-nugget@X.Y.Z` and re-run the same import smoke test as step 3, against the *published* package rather than the local tarball.
7. **Org-scope note** (carried from the prior review): `@jxburros/context-nugget` is fine for a seed-stage package. Revisit the scope/name before wider adoption if the project moves under a shared org.

## Notes

- Do not publish before the data-lifecycle fixes (stale chunk/memory retrieval) are in place — serving stale or expired context contradicts this package's core promise.
- `prepublishOnly` already runs typecheck + build + test as a safety net, but it does not replace steps 2-3 above (CI catches environment drift that a local `npm publish` won't).
