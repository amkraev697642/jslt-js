// Dev tool, not part of the published library: concatenates the ESM module
// graph into one dependency-free script with a tiny CommonJS-style
// require()/exports shim per file (real per-file scoping, not naive text
// concatenation — avoids any top-level name collision across the ~70 source
// files). Needed because the only place this currently runs,
// inlined into a generated HTML report opened via file://) can't use real
// ES module imports: Chrome blocks cross-file fetch() of file:// modules.
//
// No bundler dependency added for this — ponytail: regex-based source
// transform, good enough for this codebase's plain `import {a,b} from "./x.js"`
// / `export class/function/const` shapes. Upgrade to a real bundler (esbuild)
// if the import shapes here ever get more dynamic than that.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

const EXPORT_FROM_RE = /export\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?/g;
const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?/g;
const EXPORT_DECL_RE = /^export\s+(class|function|const|let)\s+([A-Za-z0-9_$]+)/m;
const EXPORT_LIST_RE = /^export\s*\{([\s\S]*?)\};?\s*$/m;

function resolveId(fromFile, specifier) {
  const resolved = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  return resolved.replace(/^\.\//, "");
}

const NODE_IMPORT_RE = /^import\s[\s\S]*?from\s*["']node:[^"']+["'];?\s*$/gm;
const IMPORT_SIDE_EFFECT_RE = /^import\s*["']([^"']+)["'];?\s*$/gm;

function transform(id, source) {
  const exportNames = [];

  // node: imports are ESM-only; bundled builds polyfill globalThis.crypto in runtime instead.
  if (id === "impl/cryptoGlobal.js") {
    return `define(${JSON.stringify(id)}, function (exports, require) {\n});\n`;
  }

  // export { A, B as C } from "./x.js";  ->  const { A, B: C } = require("resolved/x.js");
  // (combined re-export-from — distinct from both plain import and bare `export {};`)
  let body = source.replace(EXPORT_FROM_RE, (_m, names, specifier) => {
    const resolved = resolveId(id, specifier);
    const destructure = names.split(",").map((n) => n.trim()).filter(Boolean).map((n) => {
      const asMatch = n.match(/^(\S+)\s+as\s+(\S+)$/);
      const local = asMatch ? asMatch[2] : n;
      exportNames.push(local);
      return asMatch ? `${asMatch[1]}: ${asMatch[2]}` : n;
    }).join(", ");
    return `const { ${destructure} } = require(${JSON.stringify(resolved)});`;
  });

  body = body.replace(NODE_IMPORT_RE, "");

  // import { A, B as C } from "./x.js";  ->  const { A, B: C } = require("resolved/x.js");
  body = body.replace(IMPORT_RE, (_m, names, specifier) => {
    const resolved = resolveId(id, specifier);
    const destructure = names.split(",").map((n) => n.trim()).filter(Boolean).map((n) => {
      const asMatch = n.match(/^(\S+)\s+as\s+(\S+)$/);
      return asMatch ? `${asMatch[1]}: ${asMatch[2]}` : n;
    }).join(", ");
    return `const { ${destructure} } = require(${JSON.stringify(resolved)});`;
  });

  // import "./x.js";  ->  require("resolved/x.js");
  body = body.replace(IMPORT_SIDE_EFFECT_RE, (_m, specifier) => {
    const resolved = resolveId(id, specifier);
    return `require(${JSON.stringify(resolved)});`;
  });

  // export class/function/const/let Name  ->  strip "export ", record Name
  body = body.replace(new RegExp(EXPORT_DECL_RE, "gm"), (_m, kind, name) => {
    exportNames.push(name);
    return `${kind} ${name}`;
  });

  // export { A, B as C };  ->  strip, record (handles re-exports of imported names)
  body = body.replace(new RegExp(EXPORT_LIST_RE, "gm"), (_m, names) => {
    for (const n of names.split(",").map((s) => s.trim()).filter(Boolean)) {
      const asMatch = n.match(/^(\S+)\s+as\s+(\S+)$/);
      exportNames.push(asMatch ? asMatch[2] : n);
    }
    return "";
  });

  const exportLine = exportNames.length
    ? `\nObject.assign(exports, { ${[...new Set(exportNames)].join(", ")} });\n`
    : "";

  return `define(${JSON.stringify(id)}, function (exports, require) {\n${body}\n${exportLine}});\n`;
}

function walk(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const id = posix.join(base, entry.name);
    if (entry.isDirectory()) walk(full, id, out);
    else if (entry.name.endsWith(".js") && entry.name !== "cli.js") out.push(id);
  }
}

const ids = [];
walk(srcDir, "", ids);

const runtime = `
(function (nodeRequire) {
if (typeof globalThis.crypto?.randomUUID !== "function") {
  try {
    var __nc = nodeRequire("crypto");
    if (__nc.webcrypto) globalThis.crypto = __nc.webcrypto;
    else if (__nc.randomUUID) globalThis.crypto = { randomUUID: function () { return __nc.randomUUID(); } };
  } catch (e) {}
}
var __modules = {};
function define(id, factory) { __modules[id] = { factory: factory, exports: null }; }
function require(id) {
  var mod = __modules[id];
  if (!mod) throw new Error("bundle: no such module " + id);
  if (!mod.exports) {
    mod.exports = {};
    mod.factory(mod.exports, require);
  }
  return mod.exports;
}
`;

const chunks = [];
for (const id of ids) {
  const source = readFileSync(join(srcDir, id), "utf8");
  chunks.push(transform(id, source));
}

const nodeRequireArg = `typeof require !== "undefined" ? require : function (id) { throw new Error("bundle: node built-in unavailable: " + id); }`;
const coreBundle = `${runtime}${chunks.join("\n")}\n`;

const outDir = join(here, "..", "dist");
mkdirSync(outDir, { recursive: true });

// Browser bundle — exposes globalThis.JSLT
const browserFooter = `
var __index = require("index.js");
var __extensions = require("extensions/index.js");
globalThis.JSLT = {
  compile: __index.compile,
  fromJS: __index.fromJS,
  toJS: __index.toJS,
  readTree: __index.readTree,
  JsltException: __index.JsltException,
  extensions: __extensions.extensions,
};
})(${nodeRequireArg});
`;
const browserOut = join(outDir, "jslt-bundle.js");
writeFileSync(browserOut, coreBundle + browserFooter);
console.log(`Wrote ${browserOut} (${ids.length} modules)`);

// Node.js CJS module — module.exports = { compile, fromJS, ... }
const cjsFooter = `
var __index = require("index.js");
var __extensions = require("extensions/index.js");
module.exports = {
  compile: __index.compile,
  fromJS: __index.fromJS,
  toJS: __index.toJS,
  readTree: __index.readTree,
  JsltException: __index.JsltException,
  extensions: __extensions.extensions,
};
})(${nodeRequireArg});
`;
const cjsOut = join(outDir, "jslt.cjs");
writeFileSync(cjsOut, coreBundle + cjsFooter);
console.log(`Wrote ${cjsOut}`);
