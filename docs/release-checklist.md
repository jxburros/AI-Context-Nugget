# Release checklist

1. **Version bump + changelog.** Update `version` in `package.json` and add a dated entry to `CHANGELOG.md` describing what changed, calling out breaking changes explicitly.
2. **CI green.** Confirm the CI workflow (`.github/workflows/ci.yml`) is green on the commit being released: typecheck, build, test, `build:nugget`, and `npm pack --dry-run` on Node 20.x and 22.x, plus the `nugget-drift` and `examples` jobs.
3. **`npm pack` inspection.**
   - Run `npm pack --dry-run` and review the file list — it should contain `dist/**/*.js`, `dist/**/*.d.ts`, `nugget/`, `README.md`, `design.md`, `CHANGELOG.md`, `recipes/`, and `LICENSE`. It should **not** contain `src/`, test files, or `examples/` (examples depend on the package via `file:../..` and are for local/CI use, not for shipping in the tarball).
   - Install-from-tarball smoke test:
     ```sh
     npm pack
     mkdir -p /tmp/context-nugget-smoke && cd /tmp/context-nugget-smoke
     npm init -y
     npm install /path/to/jxburros-context-nugget-<version>.tgz
     node -e "import('@jxburros/context-nugget').then(m => console.log(Object.keys(m).length, 'exports'))"
     ```
     Confirm it imports without error and reports a non-zero export count.
4. **Tag + GitHub Release.** `.github/workflows/publish.yml` publishes to both npmjs.org and GitHub Packages on `release: published` (mirrors AI Nugget's release workflow). Create a GitHub Release for tag `vX.Y.Z` matching `package.json`'s `version` — the `validate` job in that workflow checks the tag matches before anything is published, and re-runs typecheck/build/test/`build:nugget`/drift-check as a second gate independent of the PR's CI run. Requires the `NPM_TOKEN` secret (an npmjs.org automation token with publish rights to `@jxburros/context-nugget`) to be configured on the repo; `GITHUB_TOKEN` for the GitHub Packages job is provided automatically by Actions.
5. **Post-publish smoke test.** In a clean directory: `npm install @jxburros/context-nugget@X.Y.Z` and re-run the same import smoke test as step 3, against the *published* package rather than the local tarball.
6. **Org-scope note** (carried from the prior review): `@jxburros/context-nugget` is fine for a seed-stage package. Revisit the scope/name before wider adoption if the project moves under a shared org.

## Notes

- The data-lifecycle fixes (stale chunk/memory retrieval) landed in 0.3.0 — this package has been publish-ready on that front since then; the gap that remained afterward was packaging/CI, not correctness, and is what this checklist and `publish.yml` now close.
- `prepublishOnly` already runs typecheck + build + test + `build:nugget` as a safety net, but it does not replace steps 2-3 above (CI catches environment drift that a local `npm publish` won't).
