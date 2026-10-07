// dist/jslt-editor.js             ESM, the ready-made editor (createEditor); CodeMirror is bundled in
// dist/jslt-editor.standalone.js  the same editor as one script for pages without a bundler, sets globalThis.JsltEditor
// dist/jslt-editor-codemirror.js  ESM, just the CodeMirror extensions; CodeMirror stays external (peer dependencies)
// dist/jslt-editor-core.js        ESM, framework-free logic only (no CodeMirror), usable in Node
import { build } from "esbuild";

const common = { bundle: true, target: "es2022", sourcemap: true, logLevel: "info" };
const peers = ["@codemirror/*", "@lezer/*", "codemirror"];

await Promise.all([
  build({ ...common, entryPoints: ["src/editor.js"], format: "esm", minify: true, outfile: "dist/jslt-editor.js" }),
  build({ ...common, entryPoints: ["src/editor.js"], format: "iife", globalName: "JsltEditor", minify: true, outfile: "dist/jslt-editor.standalone.js" }),
  build({ ...common, entryPoints: ["src/cm/index.js"], format: "esm", external: peers, outfile: "dist/jslt-editor-codemirror.js" }),
  build({ ...common, entryPoints: ["src/core/index.js"], format: "esm", outfile: "dist/jslt-editor-core.js" }),
]);
