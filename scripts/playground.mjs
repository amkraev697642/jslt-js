// Bundles the playground (CodeMirror, editor modules, jslt-js) into one self-contained file: no CDN at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["playground/app.js"],
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: true,
  target: "es2022",
  outfile: "playground/dist/app.js",
  alias: { "jslt-js": "./src/index.js" },
  conditions: ["source"], // jslt-editor resolves to its src/ in the workspace
  logLevel: "info",
});
