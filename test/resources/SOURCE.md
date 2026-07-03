# Source of these fixtures

Vendored from the upstream Java JSLT repo — [schibsted/jslt](https://github.com/schibsted/jslt),
directory `core/src/test/resources/`.

- **Commit:** `cfcdeb886052f4cf614a428a6044c25e18ff80c1`
- **Branch:** `master` (nearest upstream release tag: `0.1.14`, this commit is later/untagged)
- **License:** Apache-2.0 (same as this project)

## Why these are vendored

This project is a faithful JavaScript port of the Java JSLT engine. These fixtures are the upstream
project's own conformance suite — **they are the primary correctness contract for this port, not
incidental tests.** `test/conformance.test.js` runs every query/function/error/parse case here
against the JS engine and asserts identical output to the Java engine (mirrors what `QueryTest.java`
does upstream). Passing this suite unchanged is what "parity" means for this project.

## Files

- `query-tests.json`, `function-tests.json` — query/function cases with expected output
- `query-error-tests.json`, `function-error-tests.json` — cases expected to throw
- `json-parse-tests.json`, `json-parse-error-tests.json` — JSON parser round-trip cases
- `query-tests.yaml` — additional query cases in YAML form
- `function-declaration-tests.yaml` — `let`/module-import test cases
- `module-*.jslt` — the 8 module files `function-declaration-tests.yaml` imports by relative name
- `experimental-tests.json` — `group-by` via the experimental module (also loaded by `QueryTest.java`)
- `import-from-fs/` — filesystem import fixtures from `FileSystemResourceResolverTest.java`
- `character-encoding.jslt`, `character-encoding-master.jslt` — non-ASCII import (UTF-8 vendored; upstream uses ISO-8859-1)

## Re-syncing

To refresh against a newer upstream commit, re-copy the same file set from
`core/src/test/resources/` in a fresh `schibsted/jslt` checkout and update the commit hash above.
