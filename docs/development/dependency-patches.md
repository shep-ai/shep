# Dependency security patches

The following patch is installed through `pnpm.patchedDependencies` and pinned
by hashes in `pnpm-lock.yaml`. Keep it until an upstream release fixes the same
behavior, then remove the patch and rerun its regression tests before upgrading.

| Package | Advisory | Local repair |
| --- | --- | --- |
| `@typespec/openapi3@0.60.0` | [GHSA-2q42-4q24-7rgv](https://github.com/advisories/GHSA-2q42-4q24-7rgv), also attributed to `@typespec/compiler` | Reject version values containing path separators, null bytes or traversal components before interpolating the emitter's output filename. |

The advisory had no published patched version when checked on 2026-10-21 (the
fixed `@typespec` 1.x line needs a TypeScript emitter that only supports 0.59).
The OpenAPI repair covers the vulnerable emitter-to-compiler call path, so a
separate compiler patch is unnecessary. Custom executable emitters remain trusted
build tools with filesystem access.

The former `extract-zip@2.0.1` patch (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3)
was removed with the move to Electron 44, which unpacks its runtime with
`@electron-internal/extract-zip` instead. The archive regressions below now run
against that extractor. It may reject a hostile archive or replace a symlinked
destination with a regular file; the tests require only that nothing outside the
output directory changes and that no extracted link points outside it.

Run the isolated regressions with:

```sh
pnpm exec vitest run tests/integration/security/dependency-path-traversal.test.ts
```

The tests cover malicious ZIP targets, duplicate archive names, existing and
dangling symlinks, directory traversal, valid internal links, and hostile and
valid TypeSpec versions. Archive fixtures write only in temporary directories;
TypeSpec uses its in-memory test host.

`pnpm audit` still reports two package/version matches (`@typespec/compiler` and
`@typespec/openapi3`) because it does not inspect local patch behavior. These
entries are not suppressed. Review the patch and passing regressions together with
the raw audit output; a version match alone does not verify whether a local patch
is present. A frozen-lockfile install must apply the patch successfully.
