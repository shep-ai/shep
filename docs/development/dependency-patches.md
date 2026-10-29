# Dependency patches

The following patch is installed through `pnpm.patchedDependencies` and pinned
by hashes in `pnpm-lock.yaml`. Remove it once upstream ships an equivalent
release, then rerun `pnpm generate` and confirm the generated output is unchanged.

| Package | Reason | Local repair |
| --- | --- | --- |
| `@typespec-tools/emitter-typescript@0.3.0` | Keeps the TypeScript domain-model emitter working on `@typespec/compiler` 1.x, which fixes [GHSA-2q42-4q24-7rgv](https://github.com/advisories/GHSA-2q42-4q24-7rgv) | Imports `CodeTypeEmitter`, `createAssetEmitter`, `code` and `StringBuilder` from `@typespec/asset-emitter` instead of the removed `@typespec/compiler/emitter-framework` subpath. |

The emitter's last release (0.3.0) targets compiler 0.59. Compiler 1.0 moved the
emitter framework, unchanged, into the separate `@typespec/asset-emitter` package,
so the patch only rewrites the import path. Two `pnpm` settings complete it:
`packageExtensions` adds `@typespec/asset-emitter` as a dependency of the emitter,
and `peerDependencyRules.allowedVersions` accepts compiler 1.x for its peer range.
`pnpm generate` produces a byte-identical `output.ts` with the patched emitter.

The earlier local repair of `@typespec/openapi3@0.60.0` for GHSA-2q42-4q24-7rgv was
removed when TypeSpec moved to 1.17. Upstream fixed the issue in 1.16.0: the
emitter now replaces unsafe characters in interpolated path segments instead of
writing outside its output directory.

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
valid TypeSpec versions (a hostile version must stay inside the emitter output
folder). Archive fixtures write only in temporary directories; TypeSpec uses its
in-memory test host.
