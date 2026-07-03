#!/usr/bin/env node
// jslt-js CLI: jslt <transform.jslt> [input.json|-]
// Reads JSON from the second arg file, or stdin if arg is "-" or omitted.
// Imports in the transform are resolved relative to its directory.

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { compile } from "./index.js";
import { fromJS, toJS } from "./index.js";
import { extensions } from "./extensions/index.js";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  process.stderr.write("Usage: jslt [--extensions] <transform.jslt> [input.json|-]\n");
  process.stderr.write("  --extensions  load built-in extension functions (money, fullName, enumerate)\n");
  process.stderr.write("  input.json    JSON input file; use '-' or omit to read from stdin\n");
  process.exit(args.length === 0 ? 1 : 0);
}

let useExtensions = false;
if (args[0] === "--extensions" || args[0] === "-e") { useExtensions = true; args.shift(); }

const [jsltFile, jsonArg] = args;

const jsltPath = resolve(jsltFile);
const jsltDir = dirname(jsltPath);

let source;
try {
  source = readFileSync(jsltPath, "utf8");
} catch (e) {
  process.stderr.write(`Error reading JSLT file '${jsltFile}': ${e.message}\n`);
  process.exit(1);
}

const opts = {
  resolver: { resolve: (name) => readFileSync(resolve(jsltDir, name), "utf8") },
  functions: useExtensions ? extensions : [],
};

let expr;
try {
  expr = compile(source, jsltFile, opts);
} catch (e) {
  process.stderr.write(`JSLT compile error: ${e.message}\n`);
  process.exit(1);
}

async function readInput() {
  if (!jsonArg || jsonArg === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
  try {
    return readFileSync(resolve(jsonArg), "utf8");
  } catch (e) {
    process.stderr.write(`Error reading JSON file '${jsonArg}': ${e.message}\n`);
    process.exit(1);
  }
}

const raw = await readInput();
let input;
try {
  input = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`JSON parse error: ${e.message}\n`);
  process.exit(1);
}

let result;
try {
  result = toJS(expr.applyInput(fromJS(input)));
} catch (e) {
  process.stderr.write(`JSLT runtime error: ${e.message}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
