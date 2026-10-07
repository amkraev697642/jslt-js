# Changelog

## 0.3.0

- Version aligned with the editor tooling (`jslt-editor`, `jslt-language-server`, `vscode-jslt`, `jslt.tmbundle`, `jslt-playground`), which now live in their own repositories. README and package links updated. No engine changes.

## 0.1.8

- **Browser / CDN fix:** remove the static `node:crypto` import from `cryptoGlobal.js`.
  That import made ESM browser loads (and `esm.sh/jslt-js@…?bundle`) fail with
  `Failed to fetch dynamically imported module` (`/node/crypto.mjs`). UUID now uses
  `globalThis.crypto.randomUUID`, with a sync `process.getBuiltinModule("crypto")`
  fallback on Node 22+.
- Advertise the classic-script browser build: `unpkg` / `jsdelivr` → `dist/jslt-bundle.js`,
  `exports["./bundle"]`, and `browser` → `./src/index.js` (ESM, now safe without `node:crypto`).

## 0.1.0

Initial public release. JavaScript (ESM) port of [JSLT](https://github.com/schibsted/jslt), zero
runtime dependencies, isomorphic (browser + Node.js). Passes the upstream conformance suite with
0 skips — see `test/resources/SOURCE.md` for the pinned upstream commit.
